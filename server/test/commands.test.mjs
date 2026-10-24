// Validation for POST term/scroll.

import assert from "node:assert/strict";
import test from "node:test";
import { MAX_SCROLL_LINES, checkTermScroll } from "../sources/commands.mjs";

test("defaults to one line at the pane's first cell", () => {
  assert.deepEqual(checkTermScroll({ direction: "up" }), { direction: "up", lines: 1 });
});

test("accepts a cell and keeps zero-based coordinates", () => {
  assert.deepEqual(checkTermScroll({ direction: "down", lines: 3, column: 0, row: 0 }), {
    direction: "down",
    lines: 3,
    column: 0,
    row: 0,
  });
});

test("rejects a missing or unknown direction", () => {
  assert.throws(() => checkTermScroll({}), { status: 400, code: "bad_request" });
  assert.throws(() => checkTermScroll({ direction: "left" }), { status: 400 });
  assert.throws(() => checkTermScroll(null), { status: 400 });
});

test("rejects out-of-range line counts", () => {
  assert.throws(() => checkTermScroll({ direction: "up", lines: 0 }), { status: 400 });
  assert.throws(() => checkTermScroll({ direction: "up", lines: 1.5 }), { status: 400 });
  assert.throws(() => checkTermScroll({ direction: "up", lines: MAX_SCROLL_LINES + 1 }), { status: 400 });
  assert.equal(checkTermScroll({ direction: "up", lines: MAX_SCROLL_LINES }).lines, MAX_SCROLL_LINES);
});

test("rejects a negative or fractional cell", () => {
  assert.throws(() => checkTermScroll({ direction: "up", column: -1 }), { status: 400 });
  assert.throws(() => checkTermScroll({ direction: "up", row: 2.5 }), { status: 400 });
});
