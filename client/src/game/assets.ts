// Loads the two Kenney sheets and slices them into frames.
//
//   city.png   kenney_pico-8-city       8×8 tiles, 1px spacing, 24 columns (outdoors + people)
//   indoor.png kenney_roguelike-indoors 16×16 tiles, 1px spacing, 27 columns (furniture)
//
// roguelike-indoors ships furniture only: its sample's wood floor and walls come from
// a different Kenney pack. Floors and walls are painted here in the sample's palette.
import { Assets, Rectangle, Texture, TextureSource } from "pixi.js";

TextureSource.defaultOptions.scaleMode = "nearest";

export const CITY_TILE = 8;
export const INDOOR_TILE = 16;

let cityBase: Texture;
let indoorBase: Texture;
const cache = new Map<string, Texture>();

export async function loadAssets() {
  const base = import.meta.env.BASE_URL;
  [cityBase, indoorBase] = await Promise.all([
    Assets.load<Texture>(`${base}tiles/city.png`),
    Assets.load<Texture>(`${base}tiles/indoor.png`),
  ]);
  paintTextures();
}

function slice(base: Texture, cols: number, size: number, index: number, key: string) {
  let t = cache.get(key);
  if (!t) {
    const x = (index % cols) * (size + 1);
    const y = Math.floor(index / cols) * (size + 1);
    t = new Texture({ source: base.source, frame: new Rectangle(x, y, size, size) });
    cache.set(key, t);
  }
  return t;
}

/** An 8×8 pico-8-city tile. */
export const city = (i: number) => slice(cityBase, 24, CITY_TILE, i, `c${i}`);
/** A 16×16 roguelike-indoors tile. */
export const indoor = (i: number) => slice(indoorBase, 27, INDOOR_TILE, i, `i${i}`);

/** Tile indices (0-based, row-major) picked from the sheets. */
export const CITY = {
  grass: 0,
  grassDots: 24,
  grassFlowers: 48,
  sidewalk: 44,
  sidewalkAboveRoad: 68,
  sidewalkBelowRoad: 20,
  roadTop: 265,
  road: 289,
  roadBottom: 313,
  // Building, 3 roof rows + awning + facade. [left, middle, right]
  roof: [
    [96, 97, 99],
    [120, 121, 123],
    [144, 145, 147],
  ],
  awnings: [262, 260, 261],
  facadeLeft: 245,
  facadeWindow: 247,
  facadeWindowAlt: 248,
  facadeDoor: 246,
  facadeRight: 249,
  // Two-tile trees: [top, trunk]
  trees: [
    [310, 334],
    [311, 335],
    [263, 287],
  ],
  bush: 358,
  // Characters: 4 people × 3 walk frames, front view only (back and side views are
  // derived from these in personFrames()).
  people: [
    [283, 284, 285],
    [307, 308, 309],
    [331, 332, 333],
    [355, 356, 357],
  ],
} as const;

export const INDOOR = {
  desk: { left: 112, mid: 113, right: 114, single: 115 },
  /** Chairs by the way the sitter faces. */
  chair: { down: 54, up: 55, right: 56, left: 57 },
  monitorFront: 129,
  monitorBack: 130,
  plants: [16, 17],
  shelves: [478, 479],
  counter: [324, 325, 326],
  rugOrange: [421, 422, 423],
  rugTeal: [394, 395, 396],
  painting: 343,
  mirror: 400,
} as const;

// ---- painted textures (floors, walls) ------------------------------------------------

export const PAINT: Record<string, Texture> = {};

// ---- people facing four ways -------------------------------------------------------------

export type Facing = "down" | "up" | "left" | "right";

const facingCache = new Map<string, Record<"down" | "up" | "side", Texture[]>>();

/**
 * One person's frames for each facing. The sheet only has front views, so:
 *   up   = the front frames with the face and collar painted over in hair and shirt
 *   side = a narrow profile built from the person's own palette (draw flipped for left)
 */
export function personFrames(look: number) {
  const hit = facingCache.get(String(look));
  if (hit) return hit;
  const ids = CITY.people[look];
  const img = cityBase.source.resource as CanvasImageSource;
  const read = (id: number) => {
    const c = document.createElement("canvas");
    c.width = c.height = 8;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(img, (id % 24) * 9, Math.floor(id / 24) * 9, 8, 8, 0, 0, 8, 8);
    return g.getImageData(0, 0, 8, 8);
  };
  const key = (d: ImageData, x: number, y: number) => {
    const i = (y * 8 + x) * 4;
    return d.data[i + 3] ? `${d.data[i]},${d.data[i + 1]},${d.data[i + 2]}` : "";
  };
  const front = read(ids[0]);
  const hair = key(front, 3, 0);
  const collar = "255,241,232";
  let skin = "";
  for (let y = 1; y < 3 && !skin; y++) for (let x = 2; x < 6 && !skin; x++) if (key(front, x, y) && key(front, x, y) !== hair) skin = key(front, x, y);
  const counts = new Map<string, number>();
  for (let y = 2; y < 6; y++)
    for (let x = 0; x < 8; x++) {
      const k = key(front, x, y);
      if (k && k !== hair && k !== skin && k !== collar) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  const shirt = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? hair;
  const pants = key(front, 2, 6) || shirt;
  const shoes = key(front, 2, 7) || hair;

  const toTexture = (d: ImageData) => {
    const c = document.createElement("canvas");
    c.width = c.height = 8;
    c.getContext("2d")!.putImageData(d, 0, 0);
    return Texture.from(c);
  };
  const recolor = (d: ImageData, map: (k: string, x: number, y: number) => string | null) => {
    const out = new ImageData(new Uint8ClampedArray(d.data), 8, 8);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const k = map(key(d, x, y), x, y);
        if (k === null) continue;
        const i = (y * 8 + x) * 4;
        if (k === "") out.data[i + 3] = 0;
        else {
          const [r, g, b] = k.split(",").map(Number);
          out.data.set([r, g, b, 255], i);
        }
      }
    return out;
  };

  const up = ids.map((id) =>
    toTexture(recolor(read(id), (k, _x, y) => (y < 3 && k === skin ? hair : k === collar ? shirt : null))),
  );

  // Side profile, facing right. Legs differ per frame so it still reads as walking.
  const legs = [
    ["..P.P...", "..F.F..."],
    ["...PP...", "...FF..."],
    ["..PP....", "..FF...."],
  ];
  const side = legs.map(([l6, l7]) => {
    const rows = ["...HH...", "..HHS...", "..HSS...", "..CCC...", "..CCCS..", "..PPP...", l6, l7];
    const pal: Record<string, string> = { H: hair, S: skin, C: shirt, P: pants, F: shoes };
    const d = new ImageData(8, 8);
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === "." || !pal[ch]) return;
        const [r, g, b] = pal[ch].split(",").map(Number);
        d.data.set([r, g, b, 255], (y * 8 + x) * 4);
      }),
    );
    return toTexture(d);
  });

  const frames = { down: ids.map((id) => city(id)), up, side };
  facingCache.set(String(look), frames);
  return frames;
}

function canvasTexture(draw: (g: CanvasRenderingContext2D) => void, w = 16, h = 16) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw(g);
  return Texture.from(c);
}

function paintTextures() {
  // Wood planks, palette sampled from the roguelike-indoors Sample.png floor.
  const planks = (base: string, seam: string, grain: string) =>
    canvasTexture((g) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 16, 16);
      g.fillStyle = seam;
      for (let y = 0; y < 16; y += 4) g.fillRect(0, y, 16, 1);
      g.fillRect(5, 1, 1, 3);
      g.fillRect(12, 5, 1, 3);
      g.fillRect(2, 9, 1, 3);
      g.fillRect(9, 13, 1, 3);
      g.fillStyle = grain;
      g.fillRect(8, 2, 2, 1);
      g.fillRect(1, 6, 3, 1);
      g.fillRect(13, 10, 2, 1);
      g.fillRect(4, 14, 2, 1);
    });
  PAINT.floor = planks("#b48355", "#9a6c43", "#a8784b");
  PAINT.floorRoom = planks("#a8794d", "#8c613b", "#9c6f45");

  // Wall seen from above: beige cap with a darker rim.
  PAINT.wallTop = canvasTexture((g) => {
    g.fillStyle = "#b4a78c";
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = "#c9bb9c";
    g.fillRect(1, 1, 14, 14);
  });
  // Wall face (the side you see when floor is south of a wall).
  PAINT.wallFace = canvasTexture((g) => {
    g.fillStyle = "#e3d5b5";
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = "#d9caa9";
    g.fillRect(0, 0, 16, 3);
    g.fillStyle = "#b4a78c";
    g.fillRect(0, 0, 16, 1);
    g.fillStyle = "#8f6a45";
    g.fillRect(0, 13, 16, 3);
  });
  // Grassy dirt road (8 px like the pico-8 tiles, drawn at 2×): two wheel ruts with
  // grass between them, and ragged grass edges.
  const pico = (draw: (g: CanvasRenderingContext2D) => void) => canvasTexture(draw, 8, 8);
  const dirt = (g: CanvasRenderingContext2D, seed: number) => {
    g.fillStyle = "#ab5236";
    g.fillRect(0, 0, 8, 8);
    g.fillStyle = "#5f574f";
    for (const [x, y] of [[(seed * 3) % 8, (seed * 5) % 8], [(seed * 7 + 3) % 8, (seed + 4) % 8]]) g.fillRect(x, y, 1, 1);
  };
  const tufts = (g: CanvasRenderingContext2D, rows: number[], seed: number) => {
    g.fillStyle = "#008751";
    for (const y of rows) for (let x = 0; x < 8; x++) if ((x * 7 + y * 3 + seed) % 5 !== 0) g.fillRect(x, y, 1, 1);
    g.fillStyle = "#00e436";
    g.fillRect((seed * 3) % 8, rows[0], 1, 1);
  };
  PAINT.roadTop = pico((g) => {
    dirt(g, 1);
    tufts(g, [0, 1], 1);
    g.fillStyle = "#008751";
    for (let x = 0; x < 8; x += 3) g.fillRect(x, 2, 1, 1);
  });
  PAINT.road = pico((g) => {
    dirt(g, 2);
    tufts(g, [3, 4], 2); // the grass strip between the ruts
  });
  PAINT.roadBottom = pico((g) => {
    dirt(g, 3);
    tufts(g, [6, 7], 3);
    g.fillStyle = "#008751";
    for (let x = 1; x < 8; x += 3) g.fillRect(x, 5, 1, 1);
  });

  // Entrance mat.
  PAINT.mat = canvasTexture((g) => {
    g.fillStyle = "#6b4a2e";
    g.fillRect(1, 3, 14, 10);
    g.fillStyle = "#8a6440";
    for (let x = 2; x < 14; x += 2) g.fillRect(x, 4, 1, 8);
  });
}
