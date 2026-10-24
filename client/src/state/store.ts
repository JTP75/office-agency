// One store shared by the Pixi world and the React HUD so they never disagree.
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { Agent } from "../net/protocol";

export type Connection = "connecting" | "live" | "retrying" | "no-token";

/** Where the player is: on the street, or inside a project's building. */
export type Location = { kind: "street" } | { kind: "building"; project: string };

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
}

export const store = createStore<OfficeState>(() => ({
  connection: "connecting",
  source: null,
  agents: [],
  projects: [],
  location: { kind: "street" },
  renderer: "…",
  travelRequest: null,
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

export const useOffice = <T,>(selector: (s: OfficeState) => T) => useStore(store, selector);

export function agentsIn(agents: Agent[], project: string) {
  return agents.filter((a) => a.project === project);
}
