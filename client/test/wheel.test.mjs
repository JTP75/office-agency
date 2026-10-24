// Wheel → notches. The drawer handles the wheel itself so xterm.js never turns
// it into arrow keys (which agents read as prompt history).

import assert from "node:assert/strict";
import test from "node:test";
import { NOTCH_PX, cellAt, notchesFor, scrollCommand, wheelPixels } from "../src/term/wheel.ts";

test("one mouse-wheel notch scrolls one line", () => {
  assert.deepEqual(notchesFor(NOTCH_PX, 0), { notches: 1, carry: 0 });
  assert.deepEqual(notchesFor(-NOTCH_PX, 0), { notches: -1, carry: 0 });
});

test("small trackpad deltas are carried until they add up to a notch", () => {
  const first = notchesFor(10, 0);
  assert.equal(first.notches, 0, "no notch yet — and no arrow key either");
  const second = notchesFor(10, 0, first.carry);
  assert.equal(second.notches, 0);
  const third = notchesFor(15, 0, second.carry);
  assert.equal(third.notches, 1);
  assert.equal(third.carry, 2);
});

test("line and page deltas are converted to pixels", () => {
  assert.equal(wheelPixels(3, 1), 48);
  assert.equal(wheelPixels(1, 2), 400);
  assert.equal(wheelPixels(12, 0), 12);
  assert.ok(notchesFor(3, 1).notches >= 1, "three lines is a notch");
});

test("a big flick scrolls several lines, capped per command", () => {
  assert.deepEqual(notchesFor(4 * NOTCH_PX, 0), { notches: 4, carry: 0 });
  assert.equal(scrollCommand(9, 0, 0).lines, 5);
  assert.equal(scrollCommand(-1, 0, 0).direction, "up");
  assert.equal(scrollCommand(1, 0, 0).direction, "down");
});

test("the pointer picks the cell the wheel is over", () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 };
  assert.deepEqual(cellAt(100, 50, rect, 40, 10), { column: 0, row: 0 });
  assert.deepEqual(cellAt(300, 150, rect, 40, 10), { column: 20, row: 5 });
  assert.deepEqual(cellAt(9999, -9999, rect, 40, 10), { column: 39, row: 0 }, "clamped to the screen");
});
