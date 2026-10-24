// Buildings grouped by machine, for the street and the HUD. Pure: no store, no Pixi.
import type { Machine, MachineStatus } from "../net/protocol";

/** One machine's stretch of the street: local first, then each saved machine. */
export interface District {
  /** Machine label, or null for local. */
  machine: string | null;
  label: string;
  /** null for local; a saved machine's connection otherwise. */
  status: MachineStatus | null;
  message: string | null;
  projects: string[];
}

/**
 * Buildings grouped by machine, each group in first-seen order. Every saved machine
 * gets a district even with no buildings, so an offline one still shows its sign.
 */
export function districtsOf(projects: string[], projectMachine: Record<string, string | null>, machines: Machine[]): District[] {
  const local: District = { machine: null, label: "local", status: null, message: null, projects: [] };
  const byLabel = new Map<string, District>(
    machines.map((m) => [m.label, { machine: m.label, label: m.label, status: m.status, message: m.message, projects: [] }]),
  );
  for (const p of projects) {
    const m = projectMachine[p] ?? null;
    if (m === null) local.projects.push(p);
    else {
      // A machine that left the catalog keeps its buildings until reload, shown as offline.
      if (!byLabel.has(m)) byLabel.set(m, { machine: m, label: m, status: "offline", message: null, projects: [] });
      byLabel.get(m)!.projects.push(p);
    }
  }
  return [local, ...byLabel.values()];
}
