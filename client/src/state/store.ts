// One store shared by the Pixi world and the React HUD so they never disagree.
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { Agent } from "../net/protocol";

export type Connection = "connecting" | "live" | "retrying" | "no-token";

/** Where the player is: on the street, or inside a project's building. */
export type Location = { kind: "street" } | { kind: "building"; project: string };

/** How the agent drawer was opened. Only an "e" drawer closes when you walk away. */
export type OpenedBy = "e" | "click" | "hud";

export interface OfficeState {
  connection: Connection;
  source: string | null;
  agents: Agent[];
  /** Projects in first-seen order. Append-only so buildings never swap lots. */
  projects: string[];
  location: Location;
  renderer: string;
  /** Requested by the HUD; the game consumes it and performs the transition. */
  travelRequest: Location | null;
  /** The agent whose terminal drawer is open. */
  drawer: { agentId: string; openedBy: OpenedBy } | null;
  /** The agent the player is standing next to (E opens it). */
  nearAgent: string | null;
  /** Keyboard focus is in the terminal: the game ignores keys. */
  typing: boolean;
  /** Native terminal app for the link-out (e.g. "Ghostty"), or null if unavailable. */
  nativeTerminal: string | null;
}

export const store = createStore<OfficeState>(() => ({
  connection: "connecting",
  source: null,
  agents: [],
  projects: [],
  location: { kind: "street" },
  renderer: "…",
  travelRequest: null,
  drawer: null,
  nearAgent: null,
  typing: false,
  nativeTerminal: null,
}));

export function applySnapshot(source: string, agents: Agent[]) {
  const known = store.getState().projects;
  const seen = new Set(known);
  const projects = [...known];
  for (const a of agents) {
    if (!seen.has(a.project)) {
      seen.add(a.project);
      projects.push(a.project);
    }
  }
  store.setState({ source, agents, projects, connection: "live" });
}

export function requestTravel(to: Location) {
  store.setState({ travelRequest: to });
}

/** Open an agent's drawer, walking into its building first if we're elsewhere. */
export function openAgent(agentId: string, openedBy: OpenedBy) {
  const { agents, location } = store.getState();
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) return;
  if (location.kind !== "building" || location.project !== agent.project) requestTravel({ kind: "building", project: agent.project });
  store.setState({ drawer: { agentId, openedBy } });
}

export function closeDrawer() {
  store.setState({ drawer: null, typing: false });
}

/** The blocked agent after the one in the drawer (wrapping), or the first one. */
export function nextBlocked(project?: string) {
  const { agents, drawer } = store.getState();
  const blocked = agents.filter((a) => a.status === "blocked" && (!project || a.project === project));
  if (!blocked.length) return null;
  const i = blocked.findIndex((a) => a.id === drawer?.agentId);
  return blocked[(i + 1) % blocked.length];
}

export const useOffice = <T,>(selector: (s: OfficeState) => T) => useStore(store, selector);

export function agentsIn(agents: Agent[], project: string) {
  return agents.filter((a) => a.project === project);
}
