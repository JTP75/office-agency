// Agent TUIs emit marker glyphs that no monospace font in the drawer's stack
// has (Claude Code's ⏺ ⏵ ⎿ ⧉). They are swapped for monospace-safe equivalents
// at the byte level, so a sequence split across two frames is left intact.

import assert from "node:assert/strict";
import test from "node:test";
import { GLYPH_SUBSTITUTES, substituteGlyphs } from "../src/term/glyphs.ts";

const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);

test("every mapping is a 3-byte to 3-byte substitution", () => {
  for (const [from, to] of Object.entries(GLYPH_SUBSTITUTES)) {
    assert.equal(enc(from).length, 3, `source ${from} must be 3 UTF-8 bytes`);
    assert.equal(enc(to).length, 3, `replacement ${to} must be 3 UTF-8 bytes`);
  }
});

test("marker glyphs are replaced", () => {
  for (const [from, to] of Object.entries(GLYPH_SUBSTITUTES)) {
    assert.equal(dec(substituteGlyphs(enc(`x${from}y`))), `x${to}y`);
  }
});

test("all markers in one frame are replaced", () => {
  const input = "⏺ run ⏵⏵ auto ⎿ result ⧉ tab";
  const out = dec(substituteGlyphs(enc(input)));
  assert.equal(out, "● run ▶▶ auto ↳ result ▣ tab");
  for (const from of Object.keys(GLYPH_SUBSTITUTES)) assert.equal(out.includes(from), false);
});

test("ordinary text and other multi-byte characters are untouched", () => {
  const input = "General · DeepSeek V4.1 — ✓ 日本語 🎉 ▀ ┃ ╭─╮";
  assert.equal(dec(substituteGlyphs(enc(input))), input);
});

test("a marker split across frames is left intact", () => {
  const bytes = enc("a⏺b");
  const split = 1 + 2; // cut inside the 3-byte marker
  const first = substituteGlyphs(bytes.slice(0, split));
  const second = substituteGlyphs(bytes.slice(split));
  assert.deepEqual([...first], [...bytes.slice(0, split)]);
  assert.deepEqual([...second], [...bytes.slice(split)]);
  // Reassembly is lossless; the next frame would have carried the whole marker.
  assert.equal(dec(new Uint8Array([...first, ...second])), "a⏺b");
});

test("frame with nothing to replace is returned as the same array", () => {
  const bytes = enc("plain ascii and · 日");
  assert.equal(substituteGlyphs(bytes), bytes);
});

test("an empty frame is a no-op", () => {
  const bytes = new Uint8Array(0);
  assert.equal(substituteGlyphs(bytes), bytes);
});
