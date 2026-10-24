// Small canvas-drawn labels. Agent text is only ever drawn on the canvas, never into the DOM as HTML.
import { Container, Graphics, Text } from "pixi.js";

// The world is scaled up (pixel art), so text renders at high resolution to stay crisp.
const RES = 8;

export function truncate(s: string, max: number) {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

export function makeText(text: string, size: number, color: number, bold = false) {
  return new Text({
    text,
    resolution: RES,
    style: { fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: size, fill: color, fontWeight: bold ? "700" : "400" },
  });
}

/** A rounded plaque with centered text. Origin is the bottom-center of the plaque. */
export function makePlaque(text: string, opts: { size?: number; fg?: number; bg?: number; border?: number; alpha?: number } = {}) {
  const { size = 5, fg = 0xffffff, bg = 0x1b1d23, border, alpha = 0.85 } = opts;
  const c = new Container();
  const t = makeText(text, size, fg, true);
  const padX = 2;
  const padY = 1;
  const w = Math.ceil(t.width) + padX * 2;
  const h = Math.ceil(t.height) + padY * 2;
  const g = new Graphics().roundRect(-w / 2, -h, w, h, 2).fill({ color: bg, alpha });
  if (border !== undefined) g.stroke({ width: 1, color: border });
  t.position.set(-t.width / 2, -h + padY);
  c.addChild(g, t);
  return c;
}
