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
  workspace: string;
  tab: string;
  title: string;
}

export interface Snapshot {
  type: "snapshot";
  source: "herdr" | "fixture";
  agents: Agent[];
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
    workspace: typeof a.workspace === "string" ? a.workspace : "",
    tab: typeof a.tab === "string" ? a.tab : "",
    title: typeof a.title === "string" ? a.title : "",
  };
}
