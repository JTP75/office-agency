// Fake agents for working without herdr. Shape matches PROTOCOL.md exactly,
// including the command endpoints, so the client can be built end to end.
//
// Scenarios (--scenario <name> or OFFICE_SCENARIO):
//   default  13 agents, 2 projects, 5 worktrees; random status every 3 s
//   empty    no agents at all
//   crowded  40 agents in one worktree room, plus a few in the lobby
//   churn    default, plus agents and a whole project coming and going

import { CommandError, pickName } from "./commands.mjs";
import { FakeTerm } from "../term/fake.mjs";

const STATUSES = ["working", "idle", "blocked", "done", "unknown"];
const TICK_MS = 3000;
const CHURN_MS = 5000;
const WORK_MS = 4000;

// [project, worktree, lobby, kind, title]
const DEFAULT_SEATS = [
  ["office-agency", "main", true, "claude", "Plan the protocol"],
  ["office-agency", "main", true, "codex", "Review PRD wording"],
  ["office-agency", "main", true, "opencode", "Answer a question about herdr"],
  ["office-agency", "feat/minimap", false, "claude", "Draw the minimap"],
  ["office-agency", "feat/minimap", false, "codex", "Minimap click-to-walk"],
  // A crowded worktree: several read-only agents sharing one room.
  ["office-agency", "fix/auth", false, "claude", "Fix flaky auth test"],
  ["office-agency", "fix/auth", false, "claude", "Read auth module"],
  ["office-agency", "fix/auth", false, "codex", "Search for token usages"],
  ["office-agency", "fix/auth", false, "opencode", "Summarize auth history"],
  ["office-agency", "fix/auth", false, "claude", "Check CI logs"],
  ["office-agency", "fix/auth", false, "codex", "Draft regression test"],
  ["tts", "main", true, "claude", "Compare TTS models"],
  ["tts", "exp/streaming", false, "opencode", "Prototype streaming output"],
];

const KINDS = ["claude", "codex", "opencode"];

function seatsFor(scenario) {
  switch (scenario) {
    case "empty":
      return [];
    case "crowded":
      return [
        ["office-agency", "main", true, "claude", "Coordinate the swarm"],
        ["office-agency", "main", true, "codex", "Merge results"],
        ...Array.from({ length: 40 }, (_, i) => ["office-agency", "swarm/research", false, KINDS[i % 3], `Research task ${i + 1}`]),
      ];
    case "default":
    case "churn":
      return DEFAULT_SEATS;
    default:
      throw new Error(`unknown fixture scenario "${scenario}" (default, empty, crowded, churn)`);
  }
}

export function createFixtureSource({ scenario = "default" } = {}) {
  const listeners = new Set();
  let nextPane = 1;
  const makeAgent = ([project, worktree, lobby, kind, title]) => ({
    id: `w1:p${nextPane++}`,
    kind,
    status: STATUSES[nextPane % STATUSES.length],
    project,
    worktree,
    lobby,
    workspace: "w1",
    tab: `w1:t${(nextPane % 3) + 1}`,
    title,
  });
  let agents = seatsFor(scenario).map(makeAgent);
  const history = new Map(); // id → fake terminal lines
  const terms = new Map(); // id → open FakeTerm
  const timers = [];

  function emit() {
    const snapshot = { type: "snapshot", source: "fixture", agents: agents.map((a) => ({ ...a })) };
    for (const cb of listeners) cb(snapshot);
    for (const [id, term] of terms) {
      const agent = agents.find((a) => a.id === id) ?? null;
      term.refresh(agent && { ...agent });
      if (!agent) terms.delete(id);
    }
  }

  function find(id) {
    const agent = agents.find((a) => a.id === id);
    if (!agent) throw new CommandError(404, "agent_not_found", `agent ${id} not found`);
    return agent;
  }

  function lines(agent) {
    if (!history.has(agent.id)) {
      history.set(agent.id, [
        `$ ${agent.kind}`,
        `(fixture) ${agent.kind} session in ${agent.project}${agent.lobby ? "" : ` @ ${agent.worktree}`}`,
        `> ${agent.title}`,
        "Reading files…",
        "Thinking…",
      ]);
    }
    return history.get(agent.id);
  }

  // A new agent shows up idle at its prompt, like a freshly started harness.
  function arrive([project, worktree, lobby, kind], name) {
    const title = pickName(kind, name, new Set(agents.map((a) => a.title)));
    const agent = { ...makeAgent([project, worktree, lobby, kind, title]), status: "idle" };
    agents = [...agents, agent];
    emit();
    return { agent: agent.id, name: title };
  }

  function startWork(agent, note) {
    agent.status = "working";
    lines(agent).push(note, "Working…");
    emit();
    timers.push(
      setTimeout(() => {
        if (!agents.includes(agent) || agent.status !== "working") return;
        agent.status = "done";
        lines(agent).push("Done.");
        emit();
      }, WORK_MS),
    );
  }

  if (scenario !== "empty") {
    timers.push(
      setInterval(() => {
        if (!agents.length) return;
        const a = agents[Math.floor(Math.random() * agents.length)];
        a.status = STATUSES[Math.floor(Math.random() * STATUSES.length)];
        if (a.status === "blocked") lines(a).push("Allow edit to src/auth.ts? [1] yes  [2] no  [esc] cancel");
        emit();
      }, TICK_MS),
    );
  }

  if (scenario === "churn") {
    let step = 0;
    timers.push(
      setInterval(() => {
        step++;
        if (step % 4 === 0) {
          // Whole project leaves, then comes back.
          const gone = agents.some((a) => a.project === "tts");
          agents = gone ? agents.filter((a) => a.project !== "tts") : [...agents, ...DEFAULT_SEATS.filter((s) => s[0] === "tts").map(makeAgent)];
        } else if (step % 2 === 0 && agents.length > 3) {
          agents = agents.filter((_, i) => i !== Math.floor(Math.random() * agents.length));
        } else {
          agents = [...agents, makeAgent(DEFAULT_SEATS[Math.floor(Math.random() * DEFAULT_SEATS.length)])];
        }
        emit();
      }, CHURN_MS),
    );
  }

  return {
    subscribe: (cb) => {
      listeners.add(cb);
      emit();
    },
    has: (id) => agents.some((a) => a.id === id),
    async prompt(id, text) {
      const agent = find(id);
      if (agent.status === "blocked") throw new CommandError(409, "agent_blocked", `agent ${id} is waiting on a dialog; answer it with keys`);
      startWork(agent, `> ${text}`);
    },
    async read(id, n) {
      return lines(find(id)).slice(-n);
    },
    async keys(id, keys) {
      const agent = find(id);
      lines(agent).push(`[keys] ${keys.join(" ")}`);
      if (agent.status === "blocked" && keys.some((k) => ["enter", "1", "2", "y", "n"].includes(k))) startWork(agent, "Dialog answered.");
      else if (agent.status === "blocked" && keys.includes("esc")) {
        agent.status = "idle";
        emit();
      }
    },
    async focus(id) {
      find(id); // nothing to focus in fixture mode
    },
    async spawn({ project, lobby, worktree, kind, name }) {
      const room = agents.find((a) => a.project === project && (lobby ? a.lobby : !a.lobby && a.worktree === worktree));
      if (!room) throw new CommandError(404, "room_not_found", `no agents in ${project} ${lobby ? "lobby" : worktree} to start next to`);
      return arrive([project, room.worktree, room.lobby, kind], name);
    },
    async createWorktree({ project, branch, kind, name }) {
      if (!agents.some((a) => a.project === project)) throw new CommandError(404, "room_not_found", `no project ${project}`);
      if (agents.some((a) => a.project === project && a.worktree === branch))
        throw new CommandError(409, "worktree_exists", `${branch} is already checked out in ${project}`);
      return arrive([project, branch, false, kind], name);
    },
    openTerminal(id, { cols, rows }, { onFrame, onClosed }) {
      const agent = find(id);
      const api = this;
      const term = new FakeTerm({
        cols,
        rows,
        agent: { ...agent },
        history: () => lines(agent),
        prompt: (text) => api.prompt(id, text),
        keys: (keys) => api.keys(id, keys),
        onFrame,
        onClosed,
      });
      terms.get(id)?.release(); // one session per agent; the hub enforces this too
      terms.set(id, term);
      return {
        input: (data) => term.input(data),
        resize: (c, r) => term.resize(c, r),
        scroll: (data) => term.scroll(data),
        release: () => {
          term.release();
          if (terms.get(id) === term) terms.delete(id);
        },
      };
    },
    close: () => timers.forEach((t) => clearTimeout(t)),
  };
}
