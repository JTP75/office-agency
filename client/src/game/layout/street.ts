// The outdoor street: one building per project along the north side of a road.
// Pure data, no rendering. Coordinates are tiles (one pico-8 tile drawn at 2× = 16px).
//
//   rows 0-1   grass + trees
//   rows 2-9   grass; buildings occupy rows 3-7, doors on row 7; bushes between them
//   rows 10-12 grassy dirt road
//   rows 13-14 grass (player spawn on 14); bushes along the road
//   rows 15-17 grass + trees
//
// With saved SSH machines the street is split into districts, one per machine
// (local first), each with a sign. A hedge runs north-south between districts on
// both sides of the road, so the road is the one way between them.

export const BUILDING_W = 6;
export const LOT_W = 9;
export const STREET_H = 18;
const MIN_W = 32;
const FIRST_LOT_X = 3;
/** Extra tiles between two districts, with the hedge in the middle. */
const DISTRICT_GAP = 4;
/** Room for a district with no buildings (an offline machine): just its sign. */
const EMPTY_DISTRICT_W = 7;
const ROAD_ROWS = new Set([10, 11, 12]);

/** What buildStreet needs to know about one district (see districtsOf in the store). */
export interface DistrictInput {
  machine: string | null;
  label: string;
  status: string | null;
  message: string | null;
  projects: string[];
}

export interface Lot {
  project: string;
  x: number; // left tile of the building
  y: number; // top tile (roof)
  door: { x: number; y: number };
}

export interface DistrictArea extends DistrictInput {
  /** Tile columns [x0, x1) the district covers, hedge excluded. */
  x0: number;
  x1: number;
  /** Center column of its buildings (or of its empty plot), for the sign. */
  cx: number;
}

export interface StreetPlan {
  width: number;
  height: number;
  lots: Lot[];
  /** Empty when there's only the local district: no signs, no hedges. */
  districts: DistrictArea[];
  trees: { x: number; y: number; v: number }[]; // y = top tile; trunk at y+1
  /** One-tile bushes (solid), hedges included. */
  bushes: { x: number; y: number }[];
  spawn: { x: number; y: number };
}

export function buildStreet(districtsIn: DistrictInput[]): StreetPlan {
  const split = districtsIn.length > 1;

  const lots: Lot[] = [];
  const districts: DistrictArea[] = [];
  const hedges: number[] = [];
  let x = FIRST_LOT_X;
  districtsIn.forEach((d, i) => {
    if (i > 0) {
      // Previous district's last lot left 3 tiles after its building; the hedge sits mid-gap.
      const gapStart = x - (LOT_W - BUILDING_W);
      const hedge = gapStart + Math.floor((LOT_W - BUILDING_W + DISTRICT_GAP) / 2);
      hedges.push(hedge);
      districts[i - 1].x1 = hedge;
      x += DISTRICT_GAP;
    }
    const start = x;
    if (d.projects.length === 0 && split) x += EMPTY_DISTRICT_W + (LOT_W - BUILDING_W);
    for (const project of d.projects) {
      lots.push({ project, x, y: 3, door: { x: x + 2, y: 7 } });
      x += LOT_W;
    }
    const end = x - (LOT_W - BUILDING_W); // one past the last building
    districts.push({ ...d, x0: i === 0 ? 0 : hedges[i - 1] + 1, x1: 0, cx: (start + end) / 2 });
  });

  const width = Math.max(MIN_W, x + 2);
  if (districts.length) districts[districts.length - 1].x1 = width;

  const hedgeCols = new Set(hedges);
  // Deterministic scatter so the street doesn't reshuffle between rebuilds.
  const trees: StreetPlan["trees"] = [];
  for (let tx = 1; tx < width - 1; tx += 3) if (!hedgeCols.has(tx)) trees.push({ x: tx, y: 0, v: (tx * 7) % 3 === 0 ? 1 : 0 });
  for (let tx = 2; tx < width - 1; tx += 4) if (!hedgeCols.has(tx)) trees.push({ x: tx, y: 16, v: (tx * 5) % 4 === 0 ? 2 : 0 });

  let spawn = { x: Math.floor(width / 2), y: 14 };
  if (hedgeCols.has(spawn.x)) spawn = { x: spawn.x + 1, y: 14 };
  // Bushes in the gaps between buildings, at both ends of the street, and along the
  // road's south side, never on a door's column or the spawn.
  const doors = new Set(lots.map((l) => l.door.x));
  const bushes: StreetPlan["bushes"] = [];
  for (const l of lots) bushes.push({ x: l.x + BUILDING_W + 1, y: 7 }, { x: l.x + BUILDING_W, y: 9 });
  bushes.push({ x: 1, y: 6 }, { x: 1, y: 8 }, { x: width - 2, y: 6 }, { x: width - 2, y: 8 });
  for (let tx = 3; tx < width - 2; tx += 5) if (Math.abs(tx - spawn.x) > 2 && !doors.has(tx) && !hedgeCols.has(tx)) bushes.push({ x: tx, y: 13 });
  // Hedges: every row but the road's.
  for (const hx of hedges) for (let y = 1; y < STREET_H; y++) if (!ROAD_ROWS.has(y)) bushes.push({ x: hx, y });

  const seen = new Set<string>();
  const unique = bushes.filter((b) => {
    const k = `${b.x},${b.y}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { width, height: STREET_H, lots, districts: split ? districts : [], trees, bushes: unique, spawn };
}
