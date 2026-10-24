// Subscribes to the server's SSE snapshot stream (PROTOCOL.md) and feeds the store.
import { parseAgent, type Agent } from "./protocol";
import { applySnapshot, store } from "../state/store";

export function connectFeed() {
  const token = new URLSearchParams(location.search).get("t");
  if (!token) {
    store.setState({ connection: "no-token" });
    return;
  }
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
    const m = msg as { type?: unknown; source?: unknown; agents?: unknown };
    if (m.type !== "snapshot" || !Array.isArray(m.agents)) return;
    const agents = m.agents.map(parseAgent).filter((a): a is Agent => a !== null);
    applySnapshot(typeof m.source === "string" ? m.source : "unknown", agents);
  };
}
