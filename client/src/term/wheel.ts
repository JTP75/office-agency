// Wheel handling for the drawer terminal.
//
// xterm.js turns the wheel into up/down arrow keys in the alternate screen when
// the app has no mouse reporting — which makes Claude Code and OpenCode step
// through prompt history instead of scrolling. The office intercepts the wheel
// instead and forwards it to herdr (`terminal.scroll`), which delivers it to the
// app as a mouse-wheel event when the app asked for mouse reporting.
//
// Trackpads send many small deltas, so a per-event threshold is not enough: the
// remainder is carried to the next event and only whole notches are sent.

/** Pixels of wheel delta that count as one notch of a mouse wheel. */
export const NOTCH_PX = 33;

/** Wheel delta converted to pixels, whatever unit the event used. */
export function wheelPixels(deltaY: number, deltaMode: number) {
  if (deltaMode === 1) return deltaY * 16; // lines
  if (deltaMode === 2) return deltaY * 400; // pages
  return deltaY; // pixels
}

/** Whole notches for this event, plus the sub-notch remainder for the next one. */
export function notchesFor(deltaY: number, deltaMode: number, carry = 0) {
  const px = wheelPixels(deltaY, deltaMode) + carry;
  const notches = Math.trunc(px / NOTCH_PX);
  return { notches, carry: px - notches * NOTCH_PX };
}

/** One herdr `terminal.scroll` command. Positive notches scroll down. */
export function scrollCommand(notches: number, column: number, row: number) {
  return {
    direction: notches > 0 ? ("down" as const) : ("up" as const),
    lines: Math.min(Math.abs(notches), 5),
    column,
    row,
  };
}

/** The zero-based cell under a point, clamped to the terminal. */
export function cellAt(x: number, y: number, rect: { left: number; top: number; width: number; height: number }, cols: number, rows: number) {
  const col = Math.floor(((x - rect.left) / Math.max(1, rect.width)) * cols);
  const row = Math.floor(((y - rect.top) / Math.max(1, rect.height)) * rows);
  const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), Math.max(0, max - 1));
  return { column: clamp(col, cols), row: clamp(row, rows) };
}
