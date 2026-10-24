// Real agent state from herdr, push-fed.
//
// Events are treated as invalidation signals: any relevant event triggers a
// fresh agent.list read (the approach herdr's socket docs recommend). Two
// subscriptions:
//   - lifecycle: global pane events; also our liveness signal. If it drops and
//     herdr doesn't come back within RECONNECT_TRIES seconds, onDead() fires.
//   - status: pane.agent_status_changed needs a pane_id per entry, and one
//     stale id rejects the whole request, so it's rebuilt whenever the set of
//     agent panes changes.

import path from "node:path";
import { request, subscribe } from "../herdr.mjs";
import { placeOf } from "./git.mjs";
import { CommandError } from "./commands.mjs";
import { openHerdrTerminal, openNative } from "../term/herdr-term.mjs";

const LIFECYCLE = ["pane.created", "pane.closed", "pane.updated", "pane.moved", "pane.agent_detected"];
const SAFETY_POLL_MS = 5000;
const DEBOUNCE_MS = 50;
const RECONNECT_TRIES = 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createHerdrSource({ onDead }) {
  const listeners = new Set();
  let last = "";
  let watchedIds = "";
  let lifecycleSub = null;
  let statusSub = null;
  let closed = false;
  let known = new Set();
  let terminalIds = new Map(); // pane id → herdr terminal id (for the native link-out)

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
      console.error("agent.list failed:", err.message);
    }
    refreshing = false;
  }

  async function load() {
    const { agents: raw } = await request("agent.list");
    const ids = raw.map((a) => a.pane_id).sort();
    if (ids.join(",") !== watchedIds) watchStatuses(ids);

    const placed = await Promise.all(
      raw.map(async (a) => ({
        id: a.pane_id,
        kind: a.agent,
        status: a.agent_status,
        ...(await placeOf(a.foreground_cwd ?? a.cwd)),
        workspace: a.workspace_id,
        tab: a.tab_id,
        title: a.terminal_title_stripped ?? "",
      })),
    );
    const agents = uniqueProjects(placed);
    known = new Set(agents.map((a) => a.id));
    terminalIds = new Map(raw.map((a) => [a.pane_id, a.terminal_id]));
    const snapshot = { type: "snapshot", source: "herdr", agents };
    const json = JSON.stringify(snapshot);
    if (json === last) return;
    last = json;
    for (const cb of listeners) cb(snapshot);
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
        if (err) console.error(`status subscription ended: ${err.code ?? err.message}`);
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
        console.error(`lifecycle subscription ended: ${err?.code ?? err?.message ?? "closed"}`);
        for (let i = 0; i < RECONNECT_TRIES; i++) {
          await sleep(1000);
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

  // Commands. Only agents in the current snapshot can be targeted, so the
  // browser can never reach a plain shell pane.
  function target(id) {
    if (!known.has(id)) throw new CommandError(404, "agent_not_found", `agent ${id} not found`);
    return id;
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

  return {
    subscribe: (cb) => listeners.add(cb),
    has: (id) => known.has(id),
    async prompt(id, text) {
      await call("agent.prompt", { target: target(id), text });
      schedule();
    },
    async read(id, lines) {
      const { read } = await call("agent.read", { target: target(id), source: "recent_unwrapped", format: "text", lines });
      return read.text.replace(/\n+$/, "").split("\n");
    },
    async keys(id, keys) {
      await call("agent.send_keys", { target: target(id), keys });
      schedule();
    },
    async focus(id) {
      await call("agent.focus", { target: target(id) });
    },
    openTerminal(id, size, events) {
      return openHerdrTerminal(target(id), size, events);
    },
    async openNative(id) {
      const terminalId = terminalIds.get(target(id));
      if (!terminalId) throw new CommandError(404, "agent_not_found", `no terminal for ${id}`);
      return openNative(terminalId);
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

// Two different directories with the same name would otherwise merge into one
// building. Disambiguate with the parent directory's name: "api (work)".
function uniqueProjects(agents) {
  const roots = new Map();
  for (const a of agents) {
    if (!roots.has(a.project)) roots.set(a.project, new Set());
    roots.get(a.project).add(a.root);
  }
  return agents.map(({ root, ...a }) =>
    roots.get(a.project).size > 1 ? { ...a, project: `${a.project} (${path.basename(path.dirname(root))})` } : a,
  );
}
