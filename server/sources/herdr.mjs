// Real agent state from herdr.
// TODO(backend): replace polling with events.subscribe on the socket.

import { execFile } from "node:child_process";
import { placeOf } from "./git.mjs";

const HERDR = process.env.HERDR_BIN_PATH ?? "herdr";
const POLL_MS = 1000;

export function createHerdrSource() {
  const listeners = new Set();
  let last = "";

  function poll() {
    execFile(HERDR, ["agent", "list"], async (err, stdout) => {
      if (err) return console.error("herdr agent list failed:", err.message);
      const agents = await Promise.all(
        JSON.parse(stdout).result.agents.map(async (a) => ({
          id: a.pane_id,
          kind: a.agent,
          status: a.agent_status,
          ...(await placeOf(a.foreground_cwd ?? a.cwd)),
          workspace: a.workspace_id,
          tab: a.tab_id,
          title: a.terminal_title_stripped ?? "",
        })),
      );
      const snapshot = { type: "snapshot", source: "herdr", agents };
      const json = JSON.stringify(snapshot);
      if (json === last) return;
      last = json;
      for (const cb of listeners) cb(snapshot);
    });
  }

  poll();
  const timer = setInterval(poll, POLL_MS);

  return {
    subscribe: (cb) => listeners.add(cb),
    close: () => clearInterval(timer),
  };
}
