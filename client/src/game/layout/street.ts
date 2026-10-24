// The outdoor street: one building per project along the north side of a road.
// Pure data, no rendering. Coordinates are tiles (one pico-8 tile drawn at 2× = 16px).
//
//   rows 0-1   grass + trees
//   rows 2-8   sidewalk; buildings occupy rows 3-7, doors on row 7
//   row  9     curb
//   rows 10-12 road
//   row  13    curb
//   row  14    sidewalk (player spawn)
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
  cars: { x: number; y: number; v: number }[];
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

  const cars: StreetPlan["cars"] = [
    { x: Math.floor(width * 0.7), y: 10, v: 0 },
    { x: Math.floor(width * 0.25), y: 12, v: 2 },
  ];

  return { width, height: STREET_H, lots, trees, cars, spawn: { x: Math.floor(width / 2), y: 14 } };
}
