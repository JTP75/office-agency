// The wire format of the herdr control-stdin commands the drawer sends.

import assert from "node:assert/strict";
import test from "node:test";
import { scrollCommand } from "../term/herdr-term.mjs";

test("a wheel notch is a terminal.scroll command", () => {
  assert.deepEqual(scrollCommand({ direction: "up", lines: 1 }), {
    type: "terminal.scroll",
    direction: "up",
    lines: 1,
  });
});

test("the cell is included only when known, and stays zero-based", () => {
  assert.deepEqual(scrollCommand({ direction: "down", lines: 2, column: 0, row: 0 }), {
    type: "terminal.scroll",
    direction: "down",
    lines: 2,
    column: 0,
    row: 0,
  });
  assert.equal("column" in scrollCommand({ direction: "up", lines: 1 }), false);
  assert.equal("row" in scrollCommand({ direction: "up", lines: 1 }), false);
});
