// Desk arrangements. A room (or the lobby) is a stack of bands; each band is one of the
// patterns below, picked per room from a hash so every room looks different but the
// same room always looks the same. Seats fill bands in order and bands are only ever
// added, so an agent's seat never moves while its session lives.
//
// Patterns are 11 tiles wide (a room's interior). Each seat faces its desk; the desk
// is the tile(s) in front of it:
//   down  → 3 tiles below          up    → 3 tiles above
//   left  → 1 tile to the left     right → 1 tile to the right
// Every pattern keeps its bottom row empty as a walkway, so bands stack without
// walling anyone in, and seats are always reachable for E.

export type Face = "down" | "up" | "left" | "right";

export interface BandSeat {
  x: number;
  y: number;
  face: Face;
}

export interface Band {
  name: string;
  h: number;
  seats: BandSeat[];
}

export const BAND_W = 11;

const s = (x: number, y: number, face: Face): BandSeat => ({ x, y, face });

export const BANDS: Band[] = [
  // A row of desks, everyone facing the room (desk in front, toward the viewer).
  { name: "row-down", h: 3, seats: [s(2, 0, "down"), s(5, 0, "down"), s(8, 0, "down")] },
  // A row of desks against the wall above, everyone with their back to the viewer.
  { name: "row-up", h: 3, seats: [s(2, 1, "up"), s(5, 1, "up"), s(8, 1, "up")] },
  // Desks along both side walls, plus one in the middle.
  {
    name: "walls",
    h: 3,
    seats: [s(1, 0, "left"), s(9, 0, "right"), s(1, 1, "left"), s(9, 1, "right"), s(5, 0, "down")],
  },
  // An island in the middle with people on all four sides.
  {
    name: "island",
    h: 5,
    seats: [s(4, 0, "down"), s(6, 3, "up"), s(2, 1, "right"), s(8, 2, "left"), s(6, 0, "down"), s(4, 3, "up")],
  },
  // Two rows of desks pushed together, facing each other.
  {
    name: "face-to-face",
    h: 5,
    seats: [s(2, 0, "down"), s(2, 3, "up"), s(5, 0, "down"), s(5, 3, "up"), s(8, 0, "down"), s(8, 3, "up")],
  },
];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The band pattern for band `i` of the room with this key. */
export function bandFor(roomKey: string, i: number) {
  return BANDS[hash(`${roomKey}#${i}`) % BANDS.length];
}

/** Bands needed to seat `n` agents (at least one, so an empty room still has a shape). */
export function bandsFor(roomKey: string, n: number) {
  const bands: Band[] = [];
  let capacity = 0;
  while (bands.length === 0 || capacity < n) {
    const b = bandFor(roomKey, bands.length);
    bands.push(b);
    capacity += b.seats.length;
  }
  return bands;
}

/** The desk tiles in front of a seat. */
export function deskTiles(seat: { x: number; y: number; face: Face }) {
  switch (seat.face) {
    case "down":
      return [-1, 0, 1].map((d) => ({ x: seat.x + d, y: seat.y + 1 }));
    case "up":
      return [-1, 0, 1].map((d) => ({ x: seat.x + d, y: seat.y - 1 }));
    case "left":
      return [{ x: seat.x - 1, y: seat.y }];
    case "right":
      return [{ x: seat.x + 1, y: seat.y }];
  }
}

/** The desk tile the seat's monitor sits on (straight in front of the agent). */
export function monitorTile(seat: { x: number; y: number; face: Face }) {
  const d = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[seat.face];
  return { x: seat.x + d[0], y: seat.y + d[1] };
}
