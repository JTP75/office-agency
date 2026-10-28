// Subscribes to the server's SSE snapshot stream (PROTOCOL.md) and feeds the store.
import { parseAgent, parseMachine, type Agent, type Machine } from "./protocol";
import { applySnapshot, store } from "../state/store";

export function connectFeed() {
  const token = new URLSearchParams(location.search).get("t");
  if (!token) {
    store.setState({ connection: "no-token" });
    return;
  }
  fetch(`/api/ping?t=${encodeURIComponent(token)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((p) =>
      store.setState({
        nativeTerminal: typeof p?.nativeTerminal === "string" ? p.nativeTerminal : null,
        kinds: Array.isArray(p?.kinds) ? p.kinds.filter((k: unknown): k is string => typeof k === "string") : [],
      }),
    )
    .catch(() => {});
  const events = new EventSource(`/api/events?t=${encodeURIComponent(token)}`);
  events.onopen = () => store.setState({ connection: "live" });
  events.onerror = () => store.setState({ connection: "retrying" });
  events.onmessage = (e) => {
    let msg: unknown;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    const m = msg as { type?: unknown; source?: unknown; agents?: unknown; machines?: unknown };
    if (m.type !== "snapshot" || !Array.isArray(m.agents)) return;
    const agents = m.agents.map(parseAgent).filter((a): a is Agent => a !== null);
    const machines = Array.isArray(m.machines) ? m.machines.map(parseMachine).filter((x): x is Machine => x !== null) : [];
    applySnapshot(typeof m.source === "string" ? m.source : "unknown", agents, machines);
  };
}
