// Wire types from PROTOCOL.md. Keep in sync with that file; unknown keys are ignored.

export type AgentStatus = "working" | "idle" | "blocked" | "done" | "unknown";

export const STATUSES: readonly AgentStatus[] = ["working", "idle", "blocked", "done", "unknown"];

export interface Agent {
  id: string;
  kind: string;
  status: AgentStatus;
  project: string;
  worktree: string | null;
  lobby: boolean;
  /** Saved SSH machine label, or null for a local agent. */
  machine: string | null;
  workspace: string;
  tab: string;
  title: string;
}

export type MachineStatus = "connecting" | "online" | "offline" | "attention";

export const MACHINE_STATUSES: readonly MachineStatus[] = ["connecting", "online", "offline", "attention"];

/** A saved SSH machine (local isn't listed). */
export interface Machine {
  id: string;
  label: string;
  status: MachineStatus;
  /** Why it's offline / needs attention, often with the command that fixes it. */
  message: string | null;
}

export interface Snapshot {
  type: "snapshot";
  source: "herdr" | "fixture";
  agents: Agent[];
  machines: Machine[];
}

/** Narrow untrusted JSON to an Agent, dropping anything malformed. */
export function parseAgent(raw: unknown): Agent | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.id !== "string" || typeof a.project !== "string") return null;
  const status = STATUSES.includes(a.status as AgentStatus) ? (a.status as AgentStatus) : "unknown";
  return {
    id: a.id,
    kind: typeof a.kind === "string" ? a.kind : "unknown",
    status,
    project: a.project,
    worktree: typeof a.worktree === "string" ? a.worktree : null,
    lobby: a.lobby === true,
    machine: typeof a.machine === "string" ? a.machine : null,
    workspace: typeof a.workspace === "string" ? a.workspace : "",
    tab: typeof a.tab === "string" ? a.tab : "",
    title: typeof a.title === "string" ? a.title : "",
  };
}

/** Narrow untrusted JSON to a Machine, dropping anything malformed. */
export function parseMachine(raw: unknown): Machine | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== "string" || typeof m.label !== "string") return null;
  return {
    id: m.id,
    label: m.label,
    status: MACHINE_STATUSES.includes(m.status as MachineStatus) ? (m.status as MachineStatus) : "offline",
    message: typeof m.message === "string" ? m.message : null,
  };
}
