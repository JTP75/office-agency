// Claude Code and OpenCode draw markers with symbols that no monospace font in
// the drawer's stack has: U+23FA ⏺, U+23F5 ⏵, U+23BF ⎿, U+29C9 ⧉. The browser
// then falls back per-glyph to Apple Color Emoji (a 16px coloured glyph, clipped
// by the 15.3px row), a maths font, or a tofu box - so the marker row looks
// broken and several pixels out of place.
//
// Swap those codepoints for monospace-safe equivalents before the frame reaches
// xterm. Substitution works on UTF-8 bytes rather than a decoded string so it is
// safe across frame boundaries: every mapping is 3 bytes to 3 bytes, so a
// sequence split between two frames simply does not match and arrives intact.
export const GLYPH_SUBSTITUTES: Readonly<Record<string, string>> = {
  "\u23FA": "\u25CF", // ⏺ -> ●
  "\u23F5": "\u25B6", // ⏵ -> ▶
  "\u23BF": "\u21B3", // ⎿ -> ↳
  "\u29C9": "\u25A3", // ⧉ -> ▣
};

type Pair = { from: Uint8Array; to: Uint8Array };

const ENCODER = new TextEncoder();

const PAIRS: Pair[] = Object.entries(GLYPH_SUBSTITUTES).map(([from, to]) => ({
  from: ENCODER.encode(from),
  to: ENCODER.encode(to),
}));

/**
 * Replaces the glyphs in GLYPH_SUBSTITUTES inside a UTF-8 frame, returning the
 * input unchanged (same instance) when there is nothing to replace.
 */
export function substituteGlyphs(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  let replaced = false;
  for (let i = 0; i < bytes.length; ) {
    // Every source sequence is 3 bytes, so only 3-byte lead bytes can match.
    const pair = bytes[i] >= 0xe0 ? PAIRS.find((p) => matches(bytes, i, p.from)) : undefined;
    if (!pair) {
      out.push(bytes[i++]);
      continue;
    }
    for (const b of pair.to) out.push(b);
    i += pair.from.length;
    replaced = true;
  }
  return replaced ? Uint8Array.from(out) : bytes;
}

function matches(bytes: Uint8Array, at: number, seq: Uint8Array): boolean {
  if (at + seq.length > bytes.length) return false;
  for (let k = 0; k < seq.length; k++) if (bytes[at + k] !== seq[k]) return false;
  return true;
}
