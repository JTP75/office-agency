// The fixture TUI's wheel behaviour: scroll the transcript, not the prompt.

import assert from "node:assert/strict";
import test from "node:test";
import { FakeTerm } from "../term/fake.mjs";

const HISTORY = Array.from({ length: 40 }, (_, i) => `line ${i}`);

async function makeTerm(rows = 12) {
  const frames = [];
  const term = new FakeTerm({
    cols: 40,
    rows,
    agent: { kind: "claude", project: "p", worktree: "main", status: "idle", lobby: false },
    history: () => [...HISTORY],
    prompt: async () => {},
    keys: async () => {},
    onFrame: (frame) => frames.push(frame),
    onClosed: () => {},
  });
  await new Promise((resolve) => setImmediate(resolve)); // the first render
  const screen = () => Buffer.from(frames.at(-1).bytes, "base64").toString("utf8");
  return { term, frames, screen };
}

test("starts at the bottom of the transcript", async () => {
  const { screen } = await makeTerm();
  assert.match(screen(), /line 39/);
  assert.doesNotMatch(screen(), /scrolled back/);
});

test("a wheel notch scrolls back and says so", async () => {
  const { term, screen } = await makeTerm();
  term.scroll({ direction: "up", lines: 3 });
  assert.equal(term.offsetBack, 3);
  assert.match(screen(), /scrolled back 3 lines/);
  assert.doesNotMatch(screen(), /line 39/);
});

test("scrolling down returns to the live prompt", async () => {
  const { term, screen } = await makeTerm();
  term.scroll({ direction: "up", lines: 5 });
  term.scroll({ direction: "down", lines: 5 });
  assert.equal(term.offsetBack, 0);
  assert.match(screen(), /line 39/);
  assert.doesNotMatch(screen(), /scrolled back/);
});

test("cannot scroll past either end", async () => {
  const { term } = await makeTerm();
  term.scroll({ direction: "down", lines: 4 });
  assert.equal(term.offsetBack, 0);
  term.scroll({ direction: "up", lines: 500 });
  assert.equal(term.offsetBack, HISTORY.length - 1, "one line stays in view");
});

test("typing jumps back to the prompt", async () => {
  const { term, screen } = await makeTerm();
  term.scroll({ direction: "up", lines: 4 });
  term.input({ text: "x" });
  assert.equal(term.offsetBack, 0);
  assert.match(screen(), /line 39/);
});
