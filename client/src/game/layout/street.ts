// The outdoor street: one building per project along the north side of a road.
// Pure data, no rendering. Coordinates are tiles (one pico-8 tile drawn at 2× = 16px).
//
//   rows 0-1   grass + trees
//   rows 2-9   grass; buildings occupy rows 3-7, doors on row 7; bushes between them
//   rows 10-12 grassy dirt road
//   rows 13-14 grass (player spawn on 14); bushes along the road
//   rows 15-17 grass + trees

export const BUILDING_W = 6;
export const LOT_W = 9;
export const STREET_H = 18;
const MIN_W = 32;
const FIRST_LOT_X = 3;

export interface Lot {
  project: string;
  x: number; // left tile of the building
  y: number; // top tile (roof)
  door: { x: number; y: number };
}

export interface StreetPlan {
  width: number;
  height: number;
  lots: Lot[];
  trees: { x: number; y: number; v: number }[]; // y = top tile; trunk at y+1
  /** One-tile bushes (solid). */
  bushes: { x: number; y: number }[];
  spawn: { x: number; y: number };
}

export function buildStreet(projects: string[]): StreetPlan {
  const width = Math.max(MIN_W, FIRST_LOT_X + projects.length * LOT_W + 2);
  const lots = projects.map((project, i) => {
    const x = FIRST_LOT_X + i * LOT_W;
    return { project, x, y: 3, door: { x: x + 2, y: 7 } };
  });

  // Deterministic scatter so the street doesn't reshuffle between rebuilds.
  const trees: StreetPlan["trees"] = [];
  for (let x = 1; x < width - 1; x += 3) trees.push({ x, y: 0, v: (x * 7) % 3 === 0 ? 1 : 0 });
  for (let x = 2; x < width - 1; x += 4) trees.push({ x, y: 16, v: (x * 5) % 4 === 0 ? 2 : 0 });

  const spawn = { x: Math.floor(width / 2), y: 14 };
  // Bushes in the gaps between buildings, at both ends of the street, and along the
  // road's south side, never on a door's column or the spawn.
  const doors = new Set(lots.map((l) => l.door.x));
  const bushes: StreetPlan["bushes"] = [];
  for (const l of lots) bushes.push({ x: l.x + BUILDING_W + 1, y: 7 }, { x: l.x + BUILDING_W, y: 9 });
  bushes.push({ x: 1, y: 6 }, { x: 1, y: 8 }, { x: width - 2, y: 6 }, { x: width - 2, y: 8 });
  for (let x = 3; x < width - 2; x += 5) if (Math.abs(x - spawn.x) > 2 && !doors.has(x)) bushes.push({ x, y: 13 });

  return { width, height: STREET_H, lots, trees, bushes, spawn };
}
