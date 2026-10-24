// Validation for POST /api/agents and POST /api/worktrees.

import assert from "node:assert/strict";
import test from "node:test";
import { checkSpawn, checkWorktree, pickName } from "../sources/commands.mjs";

test("spawn targets the lobby or a worktree", () => {
  assert.deepEqual(checkSpawn({ project: "api", lobby: true, worktree: "main", kind: "claude" }), {
    project: "api",
    lobby: true,
    worktree: null,
    kind: "claude",
    name: null,
  });
  assert.equal(checkSpawn({ project: "api", worktree: "fix/auth", kind: "codex", name: "auth-2" }).worktree, "fix/auth");
  assert.throws(() => checkSpawn({ project: "api", kind: "claude" }), { status: 400 });
  assert.throws(() => checkSpawn({ lobby: true, kind: "claude" }), { status: 400 });
});

test("spawn refuses unknown harnesses and bad names", () => {
  assert.throws(() => checkSpawn({ project: "api", lobby: true, kind: "bash" }), { status: 400 });
  assert.throws(() => checkSpawn({ project: "api", lobby: true, kind: "claude", name: "Has Space" }), { status: 400 });
  assert.throws(() => checkSpawn({ project: "api", lobby: true, kind: "claude", name: "1abc" }), { status: 400 });
  assert.equal(checkSpawn({ project: "api", lobby: true, kind: "claude", name: "" }).name, null);
});

test("worktree needs a plausible branch; base is optional", () => {
  assert.deepEqual(checkWorktree({ project: "api", branch: "feat/x", kind: "claude" }), {
    project: "api",
    branch: "feat/x",
    base: null,
    kind: "claude",
    name: null,
  });
  assert.equal(checkWorktree({ project: "api", branch: "feat/x", base: "origin/main", kind: "claude" }).base, "origin/main");
  for (const branch of ["", "has space", "-x", "a..b", "x/", "x.", "a:b", "a~1", "x@{1}"])
    assert.throws(() => checkWorktree({ project: "api", branch, kind: "claude" }), { status: 400 }, branch);
});

test("names default to the first free <kind>-<n>", () => {
  assert.equal(pickName("claude", null, new Set()), "claude-1");
  assert.equal(pickName("claude", null, new Set(["claude-1", "claude-3"])), "claude-2");
  assert.equal(pickName("claude", "mine", new Set()), "mine");
  assert.throws(() => pickName("claude", "mine", new Set(["mine"])), { status: 409, code: "name_taken" });
});
