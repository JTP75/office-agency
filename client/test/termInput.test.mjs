// xterm's onData carries both keystrokes and the emulator's replies to terminal
// queries. Replies must never be forwarded as typing.

import assert from "node:assert/strict";
import test from "node:test";
import { isDeviceReply, typedInput } from "../src/term/termInput.ts";

const replies = [
  "\x1b[?62;22c", // DA1
  "\x1b[>1;10;0c", // DA2
  "\x1b[12;40R", // cursor position report
  "\x1b[?1u", // kitty keyboard flags
  "\x1b[I", // focus in
  "\x1b[O", // focus out
  "\x1b[?2026;2$y", // DECRPM
  "\x1bP>|xterm(370)\x1b\\", // DCS reply
  "\x1b]10;rgb:ffff/ffff/ffff\x07", // OSC colour report
];

const typed = [
  "a",
  "hello world",
  "\r",
  "\x7f",
  "\x1b[A", // up arrow
  "\x1b[1;5C", // ctrl+right
  "\x1b[5~", // page up
  "\x1b[200~paste\x1b[201~", // bracketed paste
  "\x1bOP", // F1 (SS3)
  "\x03", // ctrl+c
];

test("device replies are recognised", () => {
  for (const data of replies) assert.equal(isDeviceReply(data), true, JSON.stringify(data));
});

test("keystrokes are not mistaken for replies", () => {
  for (const data of typed) assert.equal(isDeviceReply(data), false, JSON.stringify(data));
});

test("replies are dropped, typing is passed through unchanged", () => {
  assert.equal(typedInput("\x1b[I"), "");
  assert.equal(typedInput("\x1b[?62;22c"), "");
  assert.equal(typedInput("ab"), "ab");
  assert.equal(typedInput("\x1b[A"), "\x1b[A");
  assert.equal(typedInput("\x1b[200~x\x1b[201~"), "\x1b[200~x\x1b[201~");
});
