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

import { request, subscribe } from "../herdr.mjs";
import { placeOf } from "./git.mjs";

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

    const agents = await Promise.all(
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

  return {
    subscribe: (cb) => listeners.add(cb),
    close: () => {
      closed = true;
      clearInterval(timer);
      clearTimeout(pending);
      lifecycleSub?.close();
      statusSub?.close();
    },
  };
}
