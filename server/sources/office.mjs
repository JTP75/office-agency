// The herdr-mode source the server talks to: local agents plus every saved SSH
// machine's agents in one snapshot, with each command routed to the server
// that owns the agent.
//
// ids: local agents keep their herdr pane id (`w1:p6`); a machine's agents are
// `<profile id>/<pane id>`, since pane ids repeat across servers.
// project: stays unique across the office, so it can keep naming one building
// (and the room to create agents in). See uniqueProjects below.

import path from "node:path";
import { CommandError } from "./commands.mjs";
import { createHerdrSource } from "./herdr.mjs";
import { createMachineManager } from "./machines.mjs";
import { openNative } from "../term/herdr-term.mjs";

export function createOfficeSource({ onDead, stateDir }) {
  const listeners = new Set();
  let last = "";
  let localAgents = [];
  let entries = new Map(); // agent id → { src, pane, machine, agent (with root/checkout) }

  const local = createHerdrSource({ onDead });
  local.subscribe((agents) => {
    localAgents = agents;
    emit();
  });
  const manager = createMachineManager({ stateDir, onChange: () => emit() });

  function emit() {
    const groups = [{ src: local, machine: null, agents: localAgents }];
    for (const m of manager.machines()) if (m.source && m.status === "online") groups.push({ src: m.source, machine: m, agents: m.agents });

    const placed = groups.flatMap(({ src, machine, agents }) =>
      agents.map((a) => ({ ...a, id: machine ? `${machine.id}/${a.pane}` : a.pane, machine: machine?.label ?? null, src, owner: machine })),
    );
    const projects = uniqueProjects(placed);
    entries = new Map(placed.map((a, i) => [a.id, { ...a, project: projects[i] }]));

    const snapshot = {
      type: "snapshot",
      source: "herdr",
      agents: placed.map((a, i) => ({
        id: a.id,
        kind: a.kind,
        status: a.status,
        project: projects[i],
        worktree: a.worktree,
        lobby: a.lobby,
        machine: a.machine,
        workspace: a.workspace,
        tab: a.tab,
        title: a.title,
      })),
      machines: manager.machines().map((m) => ({ id: m.id, label: m.label, status: m.status, message: m.message ?? null })),
    };
    const json = JSON.stringify(snapshot);
    if (json === last) return;
    last = json;
    for (const cb of listeners) cb(snapshot);
  }

  function route(id) {
    const e = entries.get(id);
    if (!e) throw new CommandError(404, "agent_not_found", `agent ${id} not found`);
    return e;
  }

  // A created agent's pane id → the id it will have in the snapshot.
  const created = (owner, result) => ({ ...result, agent: owner ? `${owner.id}/${result.agent}` : result.agent });

  return {
    subscribe: (cb) => listeners.add(cb),
    has: (id) => entries.has(id),
    prompt(id, text) {
      const e = route(id);
      return e.src.prompt(e.pane, text);
    },
    read(id, lines) {
      const e = route(id);
      return e.src.read(e.pane, lines);
    },
    keys(id, keys) {
      const e = route(id);
      return e.src.keys(e.pane, keys);
    },
    // A machine's herdr focuses the pane on that machine; the herdr window shows it
    // once that machine is selected in its sidebar.
    async focus(id) {
      const e = route(id);
      await e.src.focus(e.pane);
      return e.owner ? { machine: e.owner.label } : {};
    },
    openTerminal(id, size, events) {
      const e = route(id);
      return e.src.openTerminal(e.pane, size, events);
    },
    openNative(id) {
      const e = route(id);
      return openNative(e.src.terminalOf(e.pane), e.owner?.remote ?? null);
    },
    async spawn({ project, lobby, worktree, kind, name }) {
      const room = [...entries.values()].find((a) => a.project === project && (lobby ? a.lobby : !a.lobby && a.worktree === worktree));
      if (!room) throw new CommandError(404, "room_not_found", `no agents in ${project} ${lobby ? "lobby" : worktree} to start next to`);
      return created(room.owner, await room.src.spawnIn(room, kind, name));
    },
    async createWorktree({ project, branch, base, kind, name }) {
      const repo = [...entries.values()].find((a) => a.project === project && a.worktree !== null);
      if (!repo) throw new CommandError(404, "room_not_found", `${project} is not a git repo with a running agent`);
      return created(repo.owner, await repo.src.createWorktreeIn(repo.root, { branch, base, kind, name }));
    },
    close() {
      local.close();
      manager.close();
    },
  };
}

// Project names → one unique building name per (machine, repo):
//   - two directories with the same name on one machine: "api (work)", "api (home)"
//     (the parent directory's name), as before machines existed;
//   - the same name on more than one machine: the machine's copy is "api @ pacel-pc"
//     (local keeps the plain name).
// Agents are { project, root, owner } with owner = machine state or null; returns
// the names in the same order.
export function uniqueProjects(agents) {
  const roots = new Map(); // machine key → name → Set(root)
  const machinesOf = new Map(); // name → Set(machine key)
  for (const a of agents) {
    const mk = a.owner?.id ?? "";
    if (!roots.has(mk)) roots.set(mk, new Map());
    const byName = roots.get(mk);
    if (!byName.has(a.project)) byName.set(a.project, new Set());
    byName.get(a.project).add(a.root);
    if (!machinesOf.has(a.project)) machinesOf.set(a.project, new Set());
    machinesOf.get(a.project).add(mk);
  }
  return agents.map((a) => {
    const mk = a.owner?.id ?? "";
    let name = roots.get(mk).get(a.project).size > 1 ? `${a.project} (${path.posix.basename(path.posix.dirname(a.root))})` : a.project;
    if (a.owner && machinesOf.get(a.project).size > 1) name = `${name} @ ${a.owner.label}`;
    return name;
  });
}
