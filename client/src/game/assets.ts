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
  cars: [275, 276, 299, 300],
  // Characters: 4 people × 3 walk frames.
  people: [
    [283, 284, 285],
    [307, 308, 309],
    [331, 332, 333],
    [355, 356, 357],
  ],
} as const;

export const INDOOR = {
  desk: [112, 113, 114],
  chairBack: 55,
  monitor: 129,
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
  // Entrance mat.
  PAINT.mat = canvasTexture((g) => {
    g.fillStyle = "#6b4a2e";
    g.fillRect(1, 3, 14, 10);
    g.fillStyle = "#8a6440";
    for (let x = 2; x < 14; x += 2) g.fillRect(x, 4, 1, 8);
  });
}
