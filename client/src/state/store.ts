// One store shared by the Pixi world and the React HUD so they never disagree.
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { Agent, Machine } from "../net/protocol";
import { districtsOf } from "./districts";

export { districtsOf, type District } from "./districts";

export type Connection = "connecting" | "live" | "retrying" | "no-token";

/** Where the player is: on the street, or inside a project's building. */
export type Location = { kind: "street" } | { kind: "building"; project: string };

/** How the agent drawer was opened. Only an "e" drawer closes when you walk away. */
export type OpenedBy = "e" | "click" | "hud";

/** The "new agent" / "new worktree" form, for one building. */
export type CreateForm = { kind: "agent" | "worktree"; project: string };

export interface OfficeState {
  connection: Connection;
  source: string | null;
  agents: Agent[];
  /** Projects in first-seen order. Append-only so buildings never swap lots. */
  projects: string[];
  /** Saved SSH machines, in the server's order. */
  machines: Machine[];
  /** Which machine each project is on (label, null = local). Sticky like `projects`. */
  projectMachine: Record<string, string | null>;
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
  /** Harnesses the server can start (`kinds` from /api/ping). */
  kinds: string[];
  createForm: CreateForm | null;
  /** A just-created agent: its drawer opens as soon as a snapshot includes it. */
  openWhenSeen: string | null;
}

export const store = createStore<OfficeState>(() => ({
  connection: "connecting",
  source: null,
  agents: [],
  projects: [],
  machines: [],
  projectMachine: {},
  location: { kind: "street" },
  renderer: "…",
  travelRequest: null,
  drawer: null,
  nearAgent: null,
  typing: false,
  nativeTerminal: null,
  kinds: [],
  createForm: null,
  openWhenSeen: null,
}));

export function applySnapshot(source: string, agents: Agent[], machines: Machine[] = []) {
  const { projects: known, projectMachine: knownMachine } = store.getState();
  const seen = new Set(known);
  const projects = [...known];
  const projectMachine = { ...knownMachine };
  for (const a of agents) {
    if (!seen.has(a.project)) {
      seen.add(a.project);
      projects.push(a.project);
    }
    projectMachine[a.project] = a.machine;
  }
  store.setState({ source, agents, projects, machines, projectMachine, connection: "live" });
  const pending = store.getState().openWhenSeen;
  if (pending && agents.some((a) => a.id === pending)) {
    store.setState({ openWhenSeen: null });
    openAgent(pending, "hud");
  }
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

export function openCreateForm(form: CreateForm) {
  store.setState({ createForm: form });
}

export function closeCreateForm() {
  store.setState({ createForm: null });
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

/** A room an agent can be started in: the lobby, or a worktree by branch. */
export interface Room {
  lobby: boolean;
  worktree: string | null;
}

export const roomKey = (r: Room) => (r.lobby ? "lobby" : `wt:${r.worktree}`);

/** The building's rooms that have agents, lobby first. */
export function roomsIn(agents: Agent[], project: string): Room[] {
  const rooms = new Map<string, Room>();
  for (const a of agentsIn(agents, project)) {
    const room = { lobby: a.lobby, worktree: a.worktree };
    rooms.set(roomKey(room), room);
  }
  return [...rooms.values()].sort((a, b) => Number(b.lobby) - Number(a.lobby) || (a.worktree ?? "").localeCompare(b.worktree ?? ""));
}

/** Districts for the current state. */
export const districts = (s: OfficeState) => districtsOf(s.projects, s.projectMachine, s.machines);
