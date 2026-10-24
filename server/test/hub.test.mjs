// The terminal hub: one session per agent, shared by viewers, replayed to
// latecomers, and released a moment after the last viewer leaves.

import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import test from "node:test";
import { createTermHub } from "../term/hub.mjs";

function fakeSource() {
  const opens = [];
  return {
    opens,
    openTerminal(id, size, events) {
      const handle = {
        id,
        size,
        events,
        inputs: [],
        sizes: [],
        scrolls: [],
        released: 0,
        input(data) {
          this.inputs.push(data);
        },
        resize(cols, rows) {
          this.sizes.push([cols, rows]);
        },
        scroll(data) {
          this.scrolls.push(data);
        },
        release() {
          this.released += 1;
        },
      };
      opens.push(handle);
      return handle;
    },
  };
}

/** A stand-in for the SSE response and its request. */
function viewer() {
  const req = { handlers: {}, on(event, fn) { this.handlers[event] = fn; } };
  const res = {
    written: "",
    ended: false,
    writeHead() {},
    write(chunk) { this.written += chunk; },
    end() { this.ended = true; },
  };
  return {
    res,
    req,
    events: () => res.written.split("\n\n").filter(Boolean).map((chunk) => JSON.parse(chunk.slice(6))),
    leave: () => req.handlers.close(),
  };
}

test("shares one session between viewers and replays frames to a latecomer", () => {
  const source = fakeSource();
  const hub = createTermHub(source);

  const a = viewer();
  hub.join("w1:p1", { cols: 80, rows: 24 }, a.req, a.res);
  source.opens[0].events.onFrame({ full: true, width: 80, height: 24, bytes: "AAA=" });

  const b = viewer();
  hub.join("w1:p1", { cols: 100, rows: 30 }, b.req, b.res);

  assert.equal(source.opens.length, 1, "a second viewer must not open a second session");
  assert.deepEqual(source.opens[0].sizes, [[100, 30]], "the newest viewer's size wins");
  assert.deepEqual(b.events(), [{ type: "frame", full: true, width: 80, height: 24, bytes: "AAA=" }]);
});

test("keeps the session briefly so a reopened viewer reuses it", async () => {
  const source = fakeSource();
  const hub = createTermHub(source, { releaseLingerMs: 30 });

  const a = viewer();
  hub.join("w1:p1", { cols: 80, rows: 24 }, a.req, a.res);
  a.leave();
  await sleep(5);
  assert.equal(source.opens[0].released, 0, "not released immediately");

  const b = viewer();
  hub.join("w1:p1", { cols: 80, rows: 24 }, b.req, b.res);
  assert.equal(source.opens.length, 1, "the reopen joins the same session");
  assert.equal(source.opens[0].released, 0, "the pending release is cancelled");

  await sleep(50);
  assert.equal(source.opens[0].released, 0, "a watched session is never released");
});

test("releases the session when nobody comes back", async () => {
  const source = fakeSource();
  const hub = createTermHub(source, { releaseLingerMs: 5 });

  const a = viewer();
  hub.join("w1:p1", { cols: 80, rows: 24 }, a.req, a.res);
  a.leave();
  await sleep(30);

  assert.equal(source.opens[0].released, 1);
  assert.throws(() => hub.input("w1:p1", { text: "x" }), { status: 409 });
});

test("forwards input, resize and scroll to the open session", () => {
  const source = fakeSource();
  const hub = createTermHub(source);

  const a = viewer();
  hub.join("w1:p1", { cols: 80, rows: 24 }, a.req, a.res);
  hub.input("w1:p1", { text: "hi" });
  hub.resize("w1:p1", 90, 25);
  hub.scroll("w1:p1", { direction: "up", lines: 2, column: 3, row: 4 });

  assert.deepEqual(source.opens[0].inputs, [{ text: "hi" }]);
  assert.deepEqual(source.opens[0].sizes, [[90, 25]]);
  assert.deepEqual(source.opens[0].scrolls, [{ direction: "up", lines: 2, column: 3, row: 4 }]);
});

test("commands fail with 409 when no stream is open", () => {
  const hub = createTermHub(fakeSource());
  assert.throws(() => hub.input("w1:p1", { text: "x" }), { status: 409, code: "no_session" });
  assert.throws(() => hub.resize("w1:p1", 80, 24), { status: 409, code: "no_session" });
  assert.throws(() => hub.scroll("w1:p1", { direction: "up", lines: 1 }), { status: 409, code: "no_session" });
});

test("a closed session tells its viewers and frees the agent id", () => {
  const source = fakeSource();
  const hub = createTermHub(source);

  const a = viewer();
  hub.join("w1:p1", { cols: 80, rows: 24 }, a.req, a.res);
  source.opens[0].events.onClosed("agent gone");

  assert.deepEqual(a.events().at(-1), { type: "closed", reason: "agent gone" });
  assert.equal(a.res.ended, true);

  const b = viewer();
  hub.join("w1:p1", { cols: 80, rows: 24 }, b.req, b.res);
  assert.equal(source.opens.length, 2, "a fresh open after the session ended");
});

test("scroll is refused when the source cannot scroll", () => {
  const hub = createTermHub({
    openTerminal: () => ({ input() {}, resize() {}, release() {} }),
  });
  const a = viewer();
  hub.join("w1:p1", { cols: 80, rows: 24 }, a.req, a.res);
  assert.throws(() => hub.scroll("w1:p1", { direction: "up", lines: 1 }), { status: 501 });
});
