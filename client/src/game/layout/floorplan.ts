// Generates a building interior from the seat book. Pure data, no rendering.
//
//          ┌── room ──┐┌── room ──┐        rooms (one per worktree) sit north of the
//          │  bands ↑ ││  bands ↑ │        corridor and grow upward a band at a time
//          └────D─────┘└────D─────┘        (see bands.ts), so seats never move
//          ═══════════ corridor ══════════  (y = 0..2)
//          │   lobby bands ↓              │ lobby grows downward toward the exit
//          └──────────── X ───────────────┘ X = exit back to the street
//
// Coordinates are tiles. y = -1 is the wall between rooms and corridor.
import { BAND_W, bandsFor, deskTiles, monitorTile, type Face } from "./bands";
import { LOBBY_KEY, type SeatBook } from "./seats";

export type CellKind = "floor" | "roomFloor" | "wall" | "door" | "exit";

export interface Seat {
  /** Tile the agent sits on. */
  x: number;
  y: number;
  /** Which way the agent faces; its desk is in front of it (bands.ts). */
  face: Face;
}

/** One desk tile. Horizontal runs of desk tiles are drawn as one long desk. */
export interface DeskTile {
  x: number;
  y: number;
  piece: "left" | "mid" | "right" | "single";
}

export interface RoomPlan {
  key: string;
  label: string;
  /** Interior bounds, inclusive. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  door: { x: number; y: number };
  slots: (string | null)[];
  seats: Seat[];
}

export type DecorKind = "plant" | "shelf" | "painting" | "mirror" | "rug" | "mat" | "counter";

export interface Decor {
  kind: DecorKind;
  x: number;
  y: number;
  /** Variant index into the tile list for that decor kind. */
  v: number;
  solid: boolean;
}

export interface FloorPlan {
  cells: Map<string, CellKind>;
  rooms: RoomPlan[];
  lobby: RoomPlan;
  decor: Decor[];
  /** Desk tiles for occupied (or vacated) seats; solid. */
  desks: DeskTile[];
  /** A monitor on the desk in front of each seat, facing that seat. */
  monitors: { x: number; y: number; face: Face }[];
  exit: { x: number; y: number };
  spawn: { x: number; y: number };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  seatOf: Map<string, Seat>;
  /** Changes whenever walls/desks move, so the renderer knows to rebuild statics. */
  geometryKey: string;
}

const ROOM_W = BAND_W; // interior width
const LOBBY_X = 2; // lobby bands start here, leaving a walkway along the west wall
const LOBBY_TOP = 4; // first lobby band row; rows 0-3 stay open below the corridor
const LOBBY_MIN_W = LOBBY_X + BAND_W + 1;

export const cellKey = (x: number, y: number) => `${x},${y}`;

export function buildFloorPlan(book: SeatBook): FloorPlan {
  const cells = new Map<string, CellKind>();
  const decor: Decor[] = [];
  const deskSet = new Set<string>();
  const monitors: FloorPlan["monitors"] = [];
  const seatOf = new Map<string, Seat>();
  const set = (x: number, y: number, k: CellKind) => cells.set(cellKey(x, y), k);
  const fill = (x0: number, y0: number, x1: number, y1: number, k: CellKind) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, k);
  };

  /**
   * Lay out `slots` in bands starting at column `x0`. Bands stack downward from `top`
   * (lobby) or upward from `bottom` (rooms). Returns the seats used and the rows spanned.
   */
  const seatBands = (key: string, slots: (string | null)[], x0: number, edge: number, grow: "down" | "up") => {
    const bands = bandsFor(key, slots.length);
    const seats: Seat[] = [];
    let cursor = edge; // next free row in the growth direction
    let i = 0;
    for (const band of bands) {
      const top = grow === "down" ? cursor : cursor - band.h + 1;
      cursor = grow === "down" ? cursor + band.h : cursor - band.h;
      for (const b of band.seats) {
        if (i >= slots.length) break;
        const seat: Seat = { x: x0 + b.x, y: top + b.y, face: b.face };
        seats.push(seat);
        for (const t of deskTiles(seat)) deskSet.add(cellKey(t.x, t.y));
        monitors.push({ ...monitorTile(seat), face: seat.face });
        const id = slots[i];
        if (id) seatOf.set(id, seat);
        i++;
      }
    }
    const rows = bands.reduce((n, b) => n + b.h, 0);
    return { seats, rows, bands: bands.map((b) => b.name) };
  };

  // ---- rooms ----------------------------------------------------------------------
  const rooms: (RoomPlan & { bands: string[] })[] = book.roomOrder.map((key, i) => {
    const slots = book.slots.get(key) ?? [];
    const x0 = 1 + i * (ROOM_W + 1);
    const x1 = x0 + ROOM_W - 1;
    const y1 = -2;
    const { seats, rows, bands } = seatBands(key, slots, x0, y1, "up");
    const y0 = y1 - rows; // one row of headroom above the top band
    return { key, label: key, x0, y0, x1, y1, door: { x: x0 + 5, y: -1 }, slots, seats, bands };
  });

  // ---- lobby + corridor -------------------------------------------------------------
  const lobbySlots = book.slots.get(LOBBY_KEY) ?? [];
  const width = Math.max(rooms.length * (ROOM_W + 1) - 1, LOBBY_MIN_W);
  const lobbyLaid = lobbySlots.length ? seatBands(LOBBY_KEY, lobbySlots, LOBBY_X, LOBBY_TOP, "down") : { seats: [], rows: 0, bands: [] };
  const lobbySeats = lobbyLaid.seats;
  const lobbyBottom = LOBBY_TOP + lobbyLaid.rows; // a free row below the last band for the exit
  const lobby: RoomPlan = {
    key: LOBBY_KEY,
    label: "lobby",
    x0: 1,
    y0: 0,
    x1: width,
    y1: lobbyBottom,
    door: { x: Math.floor((width + 1) / 2), y: lobbyBottom + 1 },
    slots: lobbySlots,
    seats: lobbySeats,
  };

  // Walls first, floors carve into them.
  fill(0, -1, width + 1, lobbyBottom + 1, "wall");
  for (const r of rooms) fill(r.x0 - 1, r.y0 - 1, r.x1 + 1, -1, "wall");
  fill(1, 0, width, lobbyBottom, "floor");
  for (const r of rooms) {
    fill(r.x0, r.y0, r.x1, r.y1, "roomFloor");
    set(r.door.x, r.door.y, "door");
  }
  const exit = lobby.door;
  set(exit.x, exit.y, "exit");

  // ---- decor ------------------------------------------------------------------------
  decor.push({ kind: "mat", x: exit.x, y: lobbyBottom, v: 0, solid: false });
  decor.push({ kind: "plant", x: 1, y: lobbyBottom, v: 0, solid: true });
  decor.push({ kind: "plant", x: width, y: lobbyBottom, v: 1, solid: true });
  decor.push({ kind: "plant", x: 1, y: 0, v: 1, solid: true });
  decor.push({ kind: "plant", x: width, y: 0, v: 0, solid: true });
  // Paintings on the corridor wall wherever there's no room door next to them.
  for (let x = 3; x < width - 1; x += 6) {
    if (rooms.some((r) => Math.abs(r.door.x - x) <= 3)) continue;
    decor.push({ kind: "painting", x, y: -1, v: 0, solid: false });
  }
  rooms.forEach((r, i) => {
    decor.push({ kind: "plant", x: r.x0, y: r.y0, v: i % 2, solid: true });
    decor.push({ kind: "shelf", x: r.x1, y: r.y0, v: i % 2, solid: true });
    decor.push({ kind: "painting", x: r.x0 + 5, y: r.y0 - 1, v: 0, solid: false });
  });

  const minY = Math.min(-1, ...rooms.map((r) => r.y0 - 1));
  const spawn = { x: exit.x, y: lobbyBottom };
  const geometryKey = JSON.stringify([rooms.map((r) => [r.key, r.seats.length, r.bands]), lobbySeats.length, lobbyLaid.bands]);

  // Horizontal runs of desk tiles become one long desk: left end, middles, right end.
  const desks: DeskTile[] = [];
  for (const k of deskSet) {
    const [x, y] = k.split(",").map(Number);
    const l = deskSet.has(cellKey(x - 1, y));
    const r = deskSet.has(cellKey(x + 1, y));
    desks.push({ x, y, piece: l && r ? "mid" : l ? "right" : r ? "left" : "single" });
  }

  return {
    cells,
    rooms,
    lobby,
    decor,
    desks,
    monitors,
    exit,
    spawn,
    bounds: { minX: 0, minY, maxX: width + 1, maxY: lobbyBottom + 1 },
    seatOf,
    geometryKey,
  };
}
