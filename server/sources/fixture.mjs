// Fake agents for working without herdr. Cycles statuses so the client
// has something changing to render. Shape matches PROTOCOL.md exactly.

const STATUSES = ["working", "idle", "blocked", "done", "unknown"];
const TICK_MS = 3000;

// [project, worktree, lobby, kind, title]
const SEATS = [
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

export function createFixtureSource() {
  const listeners = new Set();
  const agents = SEATS.map(([project, worktree, lobby, kind, title], i) => ({
    id: `w1:p${i + 1}`,
    kind,
    status: STATUSES[i % STATUSES.length],
    project,
    worktree,
    lobby,
    workspace: "w1",
    tab: `w1:t${(i % 3) + 1}`,
    title,
  }));

  function emit() {
    const snapshot = { type: "snapshot", source: "fixture", agents: agents.map((a) => ({ ...a })) };
    for (const cb of listeners) cb(snapshot);
  }

  const timer = setInterval(() => {
    const a = agents[Math.floor(Math.random() * agents.length)];
    a.status = STATUSES[Math.floor(Math.random() * STATUSES.length)];
    emit();
  }, TICK_MS);

  return {
    subscribe: (cb) => {
      listeners.add(cb);
      emit();
    },
    close: () => clearInterval(timer),
  };
}
