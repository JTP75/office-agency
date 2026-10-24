// Saved SSH machines (`herdr machine list`) as extra herdr servers.
//
// herdr's own client merges machines in its UI; the local server's API only
// knows local agents, and `herdr --machine` can neither subscribe to events nor
// stream terminals. So for each enabled machine we hold one SSH connection that
// forwards the remote server's two sockets (API + terminal streams) to short
// local paths, and run an ordinary HerdrSource against them:
//
//   ssh -N -L <dir>/<id>.sock:<remote herdr.sock> -L <dir>/<id>-client.sock:<remote herdr-client.sock> <target>
//
// The connection never prompts (BatchMode) and never installs, starts or
// restarts anything remotely, like herdr's background connections. A machine
// that needs attention (auth, host key, no running server) says so, with the
// command that fixes it, and is retried with backoff.

import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { request } from "../herdr.mjs";
import { createHerdrSource } from "./herdr.mjs";
import { createHerdrPlacer } from "./place.mjs";
import { shellQuote } from "../term/herdr-term.mjs";

const HERDR = process.env.HERDR_BIN_PATH ?? "herdr";
const LIST_POLL_MS = 30_000;
const SOCKET_WAIT_MS = 15_000;
const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 120_000;
const HEALTHY_MS = 60_000; // connected this long → the next drop retries fast again
const SUN_PATH_MAX = 103; // macOS sun_path is 104 bytes including the NUL

const SSH_OPTS = [
  "-o", "BatchMode=yes",
  "-o", "ConnectTimeout=10",
  "-o", "ServerAliveInterval=15",
  "-o", "ServerAliveCountMax=3",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(bin, args, timeout = 20_000) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout }, (err, stdout, stderr) => resolve({ ok: !err, code: err?.code, stdout, stderr: String(stderr).trim() }));
  });
}

/** `herdr machine list --json`, enabled profiles only. */
export async function listMachines() {
  const { ok, stdout, stderr } = await run(HERDR, ["machine", "list", "--json"]);
  if (!ok) throw new Error(`herdr machine list: ${stderr || "failed"}`);
  return JSON.parse(stdout)
    .filter((m) => m.enabled)
    .map((m) => ({ id: m.id, label: m.label, target: m.target, session: m.session ?? "default" }));
}

/** herdr's cache of the remote executable path (`ssh-metadata/<id>.json`), if any. */
function cachedExecutable(id) {
  const state = process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local", "state");
  try {
    return JSON.parse(fs.readFileSync(path.join(state, "herdr", "client", "ssh-metadata", `${id}.json`), "utf8")).metadata?.executable ?? null;
  } catch {
    return null;
  }
}

/** Why SSH failed, as { status, message }: "attention" needs the user, "offline" will just be retried. */
export function classifySshError(stderr, label) {
  const last = stderr.split("\n").map((l) => l.trim()).filter(Boolean).at(-1) ?? "ssh failed";
  if (/permission denied|passphrase|authentication|too many authentication/i.test(stderr))
    return { status: "attention", message: `SSH authentication failed. Run: herdr machine reconnect ${shellQuote(label)}` };
  if (/host key verification failed|remote host identification has changed/i.test(stderr))
    return { status: "attention", message: `SSH host key needs approval: ${last}` };
  return { status: "offline", message: last };
}

/** The forwarded stream socket herdr looks for next to an API socket: `x.sock` → `x-client.sock`. */
export function clientSocketOf(socket) {
  return socket.replace(/(\.sock)?$/, "-client.sock");
}

// Socket file names: a profile id prefix, short enough for any of the dirs below.
const sockName = (id) => `${id.slice(0, 12)}.sock`;
const LONGEST = clientSocketOf(sockName("0".repeat(32))).length + 1;

// A directory short enough for unix socket paths, private to us: the plugin's
// state dir if it fits, else a fresh temp dir (macOS's $TMPDIR is long too, so /tmp last).
function socketDir(stateDir) {
  const fits = (dir) => dir.length + LONGEST <= SUN_PATH_MAX;
  let dir = path.join(stateDir, "m");
  if (fits(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  else {
    const base = [os.tmpdir(), "/tmp"].find((d) => fits(path.join(d, "office-XXXXXX")));
    if (!base) throw new Error("no directory short enough for the machines' forwarded sockets");
    dir = fs.mkdtempSync(path.join(base, "office-"));
  }
  fs.chmodSync(dir, 0o700);
  return dir;
}

// Ask the remote which herdr binary and socket the profile's session uses, without
// starting anything: `status server` only reports.
async function resolveRemote(m) {
  const cached = cachedExecutable(m.id);
  const find = `h=${cached ? shellQuote(cached) : "''"}; [ -x "$h" ] || h=$(command -v herdr 2>/dev/null) || h="$HOME/.local/bin/herdr"; [ -x "$h" ] || { echo "herdr not found" >&2; exit 127; }; echo "$h"; "$h" --session ${shellQuote(m.session)} status server --json`;
  const res = await run("ssh", [...SSH_OPTS, m.target, find]);
  if (!res.ok) {
    if (res.code === 127) return { error: { status: "attention", message: `herdr isn't installed on ${m.label}. Run: herdr --remote ${m.target}` } };
    return { error: classifySshError(res.stderr, m.label) };
  }
  const [herdr, ...rest] = res.stdout.trim().split("\n");
  let status;
  try {
    status = JSON.parse(rest.join("\n"));
  } catch {
    return { error: { status: "attention", message: `couldn't read herdr's status on ${m.label}` } };
  }
  if (!status.running) {
    const session = m.session === "default" ? "" : ` --session ${m.session}`;
    return { error: { status: "attention", message: `herdr isn't running on ${m.label}. Run: herdr --remote ${m.target}${session}` } };
  }
  if (status.compatible === false) return { error: { status: "attention", message: `herdr ${status.version} on ${m.label} isn't compatible; update it with herdr --remote ${m.target}` } };
  return { herdr, socket: status.socket, version: status.version };
}

/**
 * Keeps one HerdrSource per enabled saved machine.
 * onChange() fires whenever a machine's status, label or agents change.
 * machines() → [{ id, label, target, status, message, source, remote }]
 */
export function createMachineManager({ stateDir, onChange }) {
  const dir = socketDir(stateDir);
  const machines = new Map(); // profile id → state
  let closed = false;
  let listError = null;

  function set(m, patch) {
    Object.assign(m, patch);
    onChange();
  }

  function teardown(m) {
    m.source?.close();
    m.source = null;
    m.agents = [];
    if (m.ssh && m.ssh.exitCode === null) m.ssh.kill();
    m.ssh = null;
    for (const f of [m.sock, m.sock && clientSocketOf(m.sock)]) if (f) fs.rmSync(f, { force: true });
  }

  function retry(m, status, message) {
    if (closed || !machines.has(m.id)) return;
    const healthy = m.since && Date.now() - m.since > HEALTHY_MS;
    m.delay = healthy ? RETRY_MIN_MS : Math.min(RETRY_MAX_MS, (m.delay || RETRY_MIN_MS / 2) * 2);
    m.since = 0;
    teardown(m);
    set(m, { status, message });
    clearTimeout(m.timer);
    m.timer = setTimeout(() => connect(m), m.delay);
    m.timer.unref?.();
  }

  async function connect(m) {
    if (closed || !machines.has(m.id)) return;
    const attempt = ++m.attempt;
    const stale = () => closed || attempt !== m.attempt || !machines.has(m.id);
    if (m.status !== "attention") set(m, { status: "connecting" });

    const remote = await resolveRemote(m);
    if (stale()) return;
    if (remote.error) return retry(m, remote.error.status, remote.error.message);
    m.remote = { target: m.target, herdr: remote.herdr, socket: remote.socket };

    m.sock = path.join(dir, sockName(m.id));
    const sockets = [
      [m.sock, remote.socket],
      [clientSocketOf(m.sock), clientSocketOf(remote.socket)],
    ];
    for (const [local] of sockets) fs.rmSync(local, { force: true });
    const forwards = sockets.flatMap(([local, far]) => ["-L", `${local}:${far}`]);
    const ssh = spawn("ssh", [...SSH_OPTS, "-o", "ExitOnForwardFailure=yes", "-o", "StreamLocalBindUnlink=yes", "-N", ...forwards, m.target], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    m.ssh = ssh;
    let stderr = "";
    ssh.stderr.setEncoding("utf8");
    ssh.stderr.on("data", (d) => {
      stderr = (stderr + d).slice(-4000);
    });
    ssh.on("error", (err) => (stderr += err.message));
    ssh.on("exit", () => {
      if (m.ssh !== ssh) return; // torn down on purpose
      const why = classifySshError(stderr || "SSH connection closed", m.label);
      console.error(`machine ${m.label}: ssh exited: ${why.message}`);
      retry(m, why.status, why.message);
    });

    // Up once both sockets exist and the API answers through them.
    const begun = Date.now();
    for (;;) {
      if (stale() || m.ssh !== ssh || ssh.exitCode !== null) return;
      if (sockets.every(([local]) => fs.existsSync(local)) && (await request(m.sock, "ping").then(() => true, () => false))) break;
      if (Date.now() - begun > SOCKET_WAIT_MS) return retry(m, "offline", `${m.label}: forwarded herdr socket didn't answer`);
      await sleep(200);
    }
    if (stale() || m.ssh !== ssh) return;

    const sock = m.sock;
    const source = createHerdrSource({
      name: m.label,
      socketPath: sock,
      placeOf: createHerdrPlacer((method, params) => request(sock, method, params)),
      onDead: () => {
        if (m.source !== source) return;
        console.error(`machine ${m.label}: herdr stopped answering`);
        retry(m, "offline", `lost the connection to herdr on ${m.label}`);
      },
    });
    m.source = source;
    source.subscribe((agents) => {
      if (m.source !== source) return;
      if (m.status !== "online") m.since = Date.now();
      set(m, { agents, status: "online", message: null });
    });
  }

  async function sync() {
    let list;
    try {
      list = await listMachines();
    } catch (err) {
      // Keep what we have; herdr itself retries a broken catalog. Log each new error once.
      if (err.message !== listError) console.error(err.message);
      listError = err.message;
      return;
    }
    listError = null;
    if (closed) return;
    const ids = new Set(list.map((p) => p.id));
    for (const [id, m] of machines)
      if (!ids.has(id)) {
        machines.delete(id);
        clearTimeout(m.timer);
        teardown(m);
        onChange();
      }
    for (const p of list) {
      const m = machines.get(p.id);
      if (!m) {
        const fresh = { ...p, status: "connecting", message: null, agents: [], source: null, ssh: null, remote: null, attempt: 0, delay: 0, since: 0, timer: null, sock: null };
        machines.set(p.id, fresh);
        onChange();
        connect(fresh);
      } else if (m.target !== p.target || m.session !== p.session) {
        // Same profile pointed somewhere else: start over.
        Object.assign(m, p, { delay: 0 });
        clearTimeout(m.timer);
        m.attempt++;
        teardown(m);
        connect(m);
      } else if (m.label !== p.label) set(m, { label: p.label });
    }
  }

  sync();
  const timer = setInterval(sync, LIST_POLL_MS);
  timer.unref?.();

  return {
    machines: () => [...machines.values()],
    close() {
      closed = true;
      clearInterval(timer);
      for (const m of machines.values()) {
        clearTimeout(m.timer);
        teardown(m);
      }
      machines.clear();
      fs.rmSync(dir, { recursive: true, force: true }); // only ever holds our sockets
    },
  };
}
