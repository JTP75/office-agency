// Saved SSH machines: placing remote agents, unique building names across
// machines, SSH error triage, and the fixture's machines scenario.

import assert from "node:assert/strict";
import test from "node:test";
import { checkoutOf, createHerdrPlacer, placeFromWorktrees } from "../sources/place.mjs";
import { uniqueProjects } from "../sources/office.mjs";
import { classifySshError, clientSocketOf } from "../sources/machines.mjs";
import { remoteAttachCommand } from "../term/herdr-term.mjs";
import { createFixtureSource } from "../sources/fixture.mjs";

// A `worktree.list` result, shaped like herdr 0.9.x returns it.
const LIST = {
  source: { repo_root: "/home/u/vettd", repo_name: "vettd", source_checkout_path: "/home/u/vettd" },
  worktrees: [
    { branch: "main", is_detached: false, is_linked_worktree: false, path: "/home/u/vettd" },
    { branch: "fix/a", is_detached: false, is_linked_worktree: true, path: "/home/u/vettd/.worktrees/fix-a" },
    { branch: null, is_detached: true, is_linked_worktree: true, path: "/home/u/wt/scratch" },
  ],
};

test("a remote cwd lands in the deepest checkout containing it", () => {
  assert.equal(checkoutOf("/home/u/vettd/src", LIST.worktrees).path, "/home/u/vettd");
  assert.equal(checkoutOf("/home/u/vettd/.worktrees/fix-a/lib", LIST.worktrees).path, "/home/u/vettd/.worktrees/fix-a");
  assert.equal(checkoutOf("/home/u/vettd-other", LIST.worktrees), null); // a prefix, not a parent
});

test("remote places match git.mjs: lobby for the main checkout, branch for worktrees", () => {
  assert.deepEqual(placeFromWorktrees("/home/u/vettd/src", LIST), {
    project: "vettd",
    worktree: "main",
    lobby: true,
    root: "/home/u/vettd",
    checkout: "/home/u/vettd",
  });
  const wt = placeFromWorktrees("/home/u/vettd/.worktrees/fix-a", LIST);
  assert.equal(wt.worktree, "fix/a");
  assert.equal(wt.lobby, false);
  assert.equal(placeFromWorktrees("/home/u/wt/scratch", LIST).worktree, "scratch"); // detached → directory name
});

test("non-git directories are their own lobby; other failures don't stick", async () => {
  let calls = 0;
  const fail = (code) => async () => {
    calls++;
    throw Object.assign(new Error(code), { code });
  };
  const plain = { project: "notes", worktree: null, lobby: true, root: "/home/u/notes", checkout: "/home/u/notes" };
  const placeOf = createHerdrPlacer(fail("not_git_worktree"));
  assert.deepEqual(await placeOf("/home/u/notes"), plain);
  await placeOf("/home/u/notes");
  assert.equal(calls, 1, "cached");

  const flaky = createHerdrPlacer(fail("connection_closed"));
  const errors = [];
  const orig = console.error;
  console.error = (m) => errors.push(m);
  try {
    assert.deepEqual(await flaky("/home/u/notes"), plain);
  } finally {
    console.error = orig;
  }
  assert.equal(errors.length, 1);
});

const pc = { id: "pc", label: "pacel-pc" };
const orin = { id: "orin", label: "orin" };

test("project names stay unique across machines", () => {
  const names = uniqueProjects([
    { project: "office-agency", root: "/Users/me/office-agency", owner: null },
    { project: "office-agency", root: "/home/me/office-agency", owner: pc },
    { project: "vettd", root: "/home/me/vettd", owner: pc },
    { project: "tts", root: "/home/me/tts", owner: orin },
  ]);
  assert.deepEqual(names, ["office-agency", "office-agency @ pacel-pc", "vettd", "tts"]);
});

test("same-name folders on one machine still use the parent directory", () => {
  const names = uniqueProjects([
    { project: "api", root: "/home/me/work/api", owner: pc },
    { project: "api", root: "/home/me/home/api", owner: pc },
    { project: "api", root: "/Users/me/api", owner: null },
  ]);
  assert.deepEqual(names, ["api (work) @ pacel-pc", "api (home) @ pacel-pc", "api"]);
});

test("SSH failures that need the user say what to run", () => {
  const auth = classifySshError("pacel@box: Permission denied (publickey).", "Build box");
  assert.equal(auth.status, "attention");
  assert.match(auth.message, /herdr machine reconnect 'Build box'/);
  assert.equal(classifySshError("Host key verification failed.", "box").status, "attention");
  assert.deepEqual(classifySshError("ssh: connect to host box port 22: Operation timed out\n", "box"), {
    status: "offline",
    message: "ssh: connect to host box port 22: Operation timed out",
  });
});

test("the terminal stream socket sits next to the API socket", () => {
  assert.equal(clientSocketOf("/home/u/.config/herdr/herdr.sock"), "/home/u/.config/herdr/herdr-client.sock");
  assert.equal(clientSocketOf("/tmp/office-x/722e6102aa79.sock"), "/tmp/office-x/722e6102aa79-client.sock");
});

test("a remote native window attaches over its own SSH session", () => {
  assert.deepEqual(remoteAttachCommand({ target: "pacel-pc", herdr: "/home/u/.local/bin/herdr", socket: "/home/u/.config/herdr/herdr.sock" }, "term_1"), [
    "ssh",
    "-t",
    "pacel-pc",
    "env HERDR_SOCKET_PATH=/home/u/.config/herdr/herdr.sock /home/u/.local/bin/herdr terminal attach term_1 --takeover",
  ]);
});

test("fixture machines: colliding pane ids, a shared project name, an offline machine", async () => {
  const source = createFixtureSource({ scenario: "machines" });
  let snap;
  source.subscribe((s) => (snap = s));
  try {
    assert.deepEqual(
      snap.machines.map((m) => [m.label, m.status]),
      [
        ["pacel-pc", "online"],
        ["pacel-orin", "offline"],
      ],
    );
    const remote = snap.agents.filter((a) => a.machine === "pacel-pc");
    assert.ok(remote.some((a) => a.id.endsWith("/w1:p1")) && snap.agents.some((a) => a.id === "w1:p1"));
    assert.ok(remote.some((a) => a.project === "office-agency @ pacel-pc"));
    assert.ok(snap.agents.filter((a) => !a.machine).every((a) => a.machine === null));
    assert.equal(new Set(snap.agents.map((a) => a.id)).size, snap.agents.length);

    // Create lands on the room's machine.
    const { agent } = await source.spawn({ project: "vettd", lobby: true, worktree: null, kind: "claude", name: null });
    assert.equal(snap.agents.find((a) => a.id === agent).machine, "pacel-pc");
    assert.deepEqual(await source.focus(agent), { machine: "pacel-pc" });
  } finally {
    source.close();
  }
});
