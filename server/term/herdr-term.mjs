// Live herdr terminals for the TermHub, plus the native-terminal link-out.
//
// A session is one `herdr terminal session control <pane> --takeover` process:
// it prints NDJSON `terminal.frame` / `terminal.closed` records and reads
// `terminal.input` / `terminal.resize` / `terminal.release` commands on stdin.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { CommandError } from "../sources/commands.mjs";
import { SOCKET_PATH } from "../herdr.mjs";

const HERDR = process.env.HERDR_BIN_PATH ?? "herdr";
const RELEASE_GRACE_MS = 1000;

export function openHerdrTerminal(paneId, { cols, rows }, { onFrame, onClosed }) {
  const proc = spawn(HERDR, ["terminal", "session", "control", paneId, "--takeover", "--cols", String(cols), "--rows", String(rows)], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let done = false;
  let lastError = "";
  const close = (reason) => {
    if (done) return;
    done = true;
    onClosed(reason);
  };

  let buf = "";
  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line) continue;
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      if (rec.type === "terminal.frame" && !done) onFrame({ full: rec.full, width: rec.width, height: rec.height, bytes: rec.bytes });
      else if (rec.type === "terminal.closed") close(rec.reason ?? "closed");
    }
  });
  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (d) => {
    const msg = d.trim();
    if (msg) {
      lastError = msg.replace(/^herdr:\s*/, "");
      console.error(`term ${paneId}: ${lastError}`);
    }
  });
  proc.stdin.on("error", () => {}); // the process may exit before we finish writing
  proc.on("error", (err) => close(err.message));
  proc.on("exit", (code) => close(lastError || `terminal exited (${code})`));

  const send = (cmd) => {
    if (!done && proc.stdin.writable) proc.stdin.write(JSON.stringify(cmd) + "\n");
  };

  return {
    input: ({ text, bytes }) => send(text != null ? { type: "terminal.input", text } : { type: "terminal.input", bytes }),
    resize: (c, r) => send({ type: "terminal.resize", cols: c, rows: r }),
    release() {
      send({ type: "terminal.release" });
      done = true; // the hub asked for this; no closed event back to it
      setTimeout(() => proc.kill(), RELEASE_GRACE_MS).unref();
    },
  };
}

// ---- native link-out -----------------------------------------------------------------

// Terminal apps we know how to launch with a command. `cmd` is the argv to run inside.
const LAUNCHERS = {
  ghostty: {
    label: "Ghostty",
    darwin: (cmd) => ["open", ["-na", "Ghostty", "--args", "-e", ...cmd]],
    linux: (cmd) => ["ghostty", ["-e", ...cmd]],
  },
  kitty: {
    label: "kitty",
    darwin: (cmd) => ["open", ["-na", "kitty", "--args", ...cmd]],
    linux: (cmd) => ["kitty", cmd],
  },
  terminal: {
    label: "Terminal",
    darwin: (cmd) => ["osascript", ["-e", `tell application "Terminal" to do script ${JSON.stringify(cmd.map(shellQuote).join(" "))}`, "-e", 'tell application "Terminal" to activate']],
  },
};

function shellQuote(s) {
  return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
}

/** The configured native terminal: { key, label } or null if unsupported here. */
export function nativeTerminal() {
  let key = "ghostty";
  try {
    const dir = process.env.HERDR_PLUGIN_CONFIG_DIR;
    if (dir) key = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")).terminal ?? key;
  } catch {}
  const launcher = LAUNCHERS[key];
  return launcher?.[process.platform] ? { key, label: launcher.label } : null;
}

export function openNative(terminalId) {
  const term = nativeTerminal();
  if (!term) throw new CommandError(501, "not_supported", "no supported native terminal configured (config.json \"terminal\": ghostty | kitty | terminal)");
  // The app is launched outside our environment, so pin the herdr session explicitly.
  const cmd = ["/usr/bin/env", `HERDR_SOCKET_PATH=${SOCKET_PATH}`, HERDR, "terminal", "attach", terminalId, "--takeover"];
  const [bin, args] = LAUNCHERS[term.key][process.platform](cmd);
  const child = spawn(bin, args, { stdio: "ignore", detached: true });
  child.on("error", (err) => console.error(`open-native: ${err.message}`));
  child.unref();
  return { terminal: term.label };
}
