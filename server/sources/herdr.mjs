// Real agent state from one herdr server, push-fed. The local server, or a
// saved SSH machine's server through its forwarded socket (machines.mjs);
// office.mjs merges them into the snapshot.
//
// Events are treated as invalidation signals: any relevant event triggers a
// fresh agent.list read (the approach herdr's socket docs recommend). Two
// subscriptions:
//   - lifecycle: global pane events; also our liveness signal. If it drops and
//     herdr doesn't come back within RECONNECT_TRIES seconds, onDead() fires.
//   - status: pane.agent_status_changed needs a pane_id per entry, and one
//     stale id rejects the whole request, so it's rebuilt whenever the set of
//     agent panes changes.
//
// herdr reports a finished agent as "done" until something marks it seen, and
// only a herdr client focusing the pane does that (terminal sessions don't count,
// and agent.focus would yank the user's herdr window). So the office keeps its own
// seen marks: a completion is seen once a drawer has had that agent open, and a
// seen "done" is reported as "idle". herdr's completion_seq tells completions apart.

import { SOCKET_PATH, request as rawRequest, subscribe as rawSubscribe } from "../herdr.mjs";
import { placeOf as gitPlaceOf } from "./git.mjs";
import { CommandError, pickName } from "./commands.mjs";
import { openHerdrTerminal } from "../term/herdr-term.mjs";

const LIFECYCLE = ["pane.created", "pane.closed", "pane.updated", "pane.moved", "pane.agent_detected"];
const SAFETY_POLL_MS = 5000;
const DEBOUNCE_MS = 50;
const RECONNECT_TRIES = 10;
const START_TIMEOUT_MS = 30_000;
const START_POLL_MS = 300;
const START_GRACE_MS = 1500; // before trusting "shell in the foreground" as a failed launch

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Agents come out as { pane, kind, status, project, worktree, lobby, root,
// checkout, workspace, tab, title, terminal }: `root` and `checkout` are paths on
// that server's machine, used to create agents and worktrees and to tell apart
// projects that share a name. `placeOf` resolves a cwd to that place; locally
// it runs git, for a machine it asks the machine's herdr (place.mjs).
// `name` prefixes log lines ("pacel-pc: …") so a machine's errors aren't mistaken for local ones.
export function createHerdrSource({ socketPath = SOCKET_PATH, placeOf = gitPlaceOf, onDead, name = null }) {
  const log = (msg) => console.error(name ? `${name}: ${msg}` : msg);
  const request = (method, params) => rawRequest(socketPath, method, params);
  const subscribe = (subs, onEvent, onEnd) => rawSubscribe(socketPath, subs, onEvent, onEnd);
  const listeners = new Set();
  let last = "";
  let watchedIds = "";
  let lifecycleSub = null;
  let statusSub = null;
  let closed = false;
  let known = new Set();
  let agents = [];
  let names = new Set(); // live herdr agent names (unique per herdr server)
  const viewing = new Map(); // pane id → open drawer terminals
  const seenSeq = new Map(); // pane id → last completion_seq seen in a drawer

  let refreshing = false;
  let again = false;
  let pending = null;

  function schedule() {
    if (closed || pending) return;
    pending = setTimeout(() => {
      pending = null;
      refresh();
    }, DEBOUNCE_MS);
  }

  // Serialized: an event during a read triggers one more read afterwards.
  async function refresh() {
    if (refreshing) return void (again = true);
    refreshing = true;
    try {
      do {
        again = false;
        await load();
      } while (again && !closed);
    } catch (err) {
      log(`agent.list failed: ${err.message}`);
    }
    refreshing = false;
  }

  async function load() {
    const { agents: raw } = await request("agent.list");
    const ids = raw.map((a) => a.pane_id).sort();
    if (ids.join(",") !== watchedIds) watchStatuses(ids);

    for (const a of raw) if (viewing.has(a.pane_id)) seenSeq.set(a.pane_id, a.completion_seq);
    for (const id of seenSeq.keys()) if (!ids.includes(id)) seenSeq.delete(id);
    agents = await Promise.all(
      raw.map(async (a) => ({
        pane: a.pane_id,
        kind: a.agent,
        status: a.agent_status === "done" && seenSeq.has(a.pane_id) && seenSeq.get(a.pane_id) === a.completion_seq ? "idle" : a.agent_status,
        ...(await placeOf(a.foreground_cwd ?? a.cwd)),
        workspace: a.workspace_id,
        tab: a.tab_id,
        title: a.terminal_title_stripped ?? "",
        terminal: a.terminal_id,
      })),
    );
    known = new Set(agents.map((a) => a.pane));
    names = new Set(raw.map((a) => a.name).filter(Boolean));
    const json = JSON.stringify(agents);
    if (json === last) return;
    last = json;
    for (const cb of listeners) cb(agents);
  }

  function watchStatuses(ids) {
    watchedIds = ids.join(",");
    const old = statusSub;
    statusSub = null;
    old?.close();
    if (!ids.length) return;
    const sub = subscribe(
      ids.map((pane_id) => ({ type: "pane.agent_status_changed", pane_id })),
      schedule,
      (err) => {
        if (closed || sub !== statusSub) return; // replaced on purpose
        if (err) log(`status subscription ended: ${err.code ?? err.message}`);
        statusSub = null;
        watchedIds = ""; // forces a resubscribe on the next read
        setTimeout(schedule, 500);
      },
    );
    statusSub = sub;
  }

  function watchLifecycle() {
    lifecycleSub = subscribe(
      LIFECYCLE.map((type) => ({ type })),
      schedule,
      async (err) => {
        if (closed) return;
        log(`lifecycle subscription ended: ${err?.code ?? err?.message ?? "closed"}`);
        for (let i = 0; i < RECONNECT_TRIES; i++) {
          await sleep(1000);
          if (closed) return; // closed while we waited (a machine being reconnected)
          try {
            await request("ping");
            watchLifecycle();
            schedule();
            return;
          } catch {}
        }
        onDead();
      },
    );
  }

  watchLifecycle();
  schedule();
  const timer = setInterval(schedule, SAFETY_POLL_MS);

  // Commands take herdr pane ids. Only agents in the current list can be
  // targeted, so the browser can never reach a plain shell pane.
  function target(pane) {
    if (!known.has(pane)) throw new CommandError(404, "agent_not_found", `agent ${pane} not found`);
    return pane;
  }

  async function call(method, params) {
    try {
      return await request(method, params);
    } catch (err) {
      if (err.code === "agent_blocked" || err.code === "agent_not_ready") throw new CommandError(409, err.code, err.message);
      if (err.code === "agent_not_found") throw new CommandError(404, err.code, err.message);
      throw new CommandError(502, err.code ?? "herdr_error", err.message);
    }
  }

  // herdr's socket agent.start returns as soon as the command is typed
  // (launch_pending), so wait here until herdr detects the harness in the pane.
  // If the shell comes back to the foreground first, the launch failed (e.g.
  // the harness isn't installed): report the pane's last lines.
  async function start(paneId, kind, name) {
    await call("agent.start", { pane_id: paneId, kind, name, timeout_ms: START_TIMEOUT_MS });
    const begun = Date.now();
    while (Date.now() - begun < START_TIMEOUT_MS) {
      await sleep(START_POLL_MS);
      const { agent } = await request("agent.get", { target: paneId }).catch(() => ({}));
      if (agent?.agent === kind) {
        names.add(name);
        schedule();
        return { agent: paneId, name };
      }
      if (Date.now() - begun < START_GRACE_MS) continue;
      const { process_info: proc } = await request("pane.process_info", { pane_id: paneId }).catch(() => ({}));
      if (proc && proc.foreground_process_group_id === proc.shell_pid) throw new CommandError(502, "agent_start_failed", `${kind} exited: ${await lastLine(paneId)}`);
    }
    throw new CommandError(504, "agent_start_failed", `${kind} wasn't detected within ${START_TIMEOUT_MS / 1000} s`);
  }

  async function lastLine(paneId) {
    const { read } = await request("pane.read", { pane_id: paneId, source: "recent_unwrapped", format: "text", lines: 5 }).catch(() => ({}));
    const lines = (read?.text ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    // The last line is the shell prompt again; the one before says why.
    return lines.at(-2) ?? lines.at(-1) ?? "no output";
  }

  async function firstPane(workspaceId) {
    const { panes } = await call("pane.list", { workspace_id: workspaceId });
    if (!panes.length) throw new CommandError(502, "herdr_error", `workspace ${workspaceId} has no pane`);
    return panes[0].pane_id;
  }

  return {
    socketPath,
    /** cb(agents) on every change; the current list right away if there is one. */
    subscribe(cb) {
      listeners.add(cb);
      if (last) cb(agents);
    },
    has: (pane) => known.has(pane),
    async prompt(pane, text) {
      await call("agent.prompt", { target: target(pane), text });
      schedule();
    },
    async read(pane, lines) {
      const { read } = await call("agent.read", { target: target(pane), source: "recent_unwrapped", format: "text", lines });
      return read.text.replace(/\n+$/, "").split("\n");
    },
    async keys(pane, keys) {
      await call("agent.send_keys", { target: target(pane), keys });
      schedule();
    },
    async focus(pane) {
      await call("agent.focus", { target: target(pane) });
    },
    openTerminal(pane, size, events) {
      let open = true;
      const stop = () => {
        if (!open) return;
        open = false;
        const n = viewing.get(pane) - 1;
        if (n > 0) viewing.set(pane, n);
        else viewing.delete(pane);
      };
      const handle = openHerdrTerminal(
        target(pane),
        size,
        {
          ...events,
          onClosed(reason) {
            stop();
            events.onClosed(reason);
          },
        },
        { socketPath },
      );
      viewing.set(pane, (viewing.get(pane) ?? 0) + 1);
      schedule(); // marks the current completion seen
      return {
        ...handle,
        release() {
          stop();
          handle.release();
        },
      };
    },
    terminalOf(pane) {
      const agent = agents.find((a) => a.pane === target(pane));
      if (!agent?.terminal) throw new CommandError(404, "agent_not_found", `no terminal for ${pane}`);
      return agent.terminal;
    },
    // New agents get their own tab in the room's workspace, so they never
    // squeeze an existing pane. A tab whose agent didn't start is closed again.
    async spawnIn({ workspace, checkout }, kind, name) {
      const agentName = pickName(kind, name, names);
      const { tab, root_pane } = await call("tab.create", { workspace_id: workspace, cwd: checkout, label: agentName, focus: false });
      try {
        return await start(root_pane.pane_id, kind, agentName);
      } catch (err) {
        await request("tab.close", { tab_id: tab.tab_id }).catch(() => {});
        throw err;
      }
    },
    // herdr opens the new worktree as its own workspace; its first pane gets the agent.
    // If the agent fails to start, the worktree stays: it's the user's branch now.
    async createWorktreeIn(root, { branch, base, kind, name }) {
      const agentName = pickName(kind, name, names);
      const { workspace, root_pane } = await call("worktree.create", { cwd: root, branch, base, label: branch, focus: false });
      try {
        return await start(root_pane?.pane_id ?? (await firstPane(workspace.workspace_id)), kind, agentName);
      } catch (err) {
        throw new CommandError(err.status ?? 502, err.code ?? "herdr_error", `worktree created, but the agent didn't start: ${err.message}`);
      }
    },
    close: () => {
      closed = true;
      clearInterval(timer);
      clearTimeout(pending);
      lifecycleSub?.close();
      statusSub?.close();
    },
  };
}
