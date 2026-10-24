// Generates a building interior from the seat book. Pure data, no rendering.
//
//          ┌── room ──┐┌── room ──┐        rooms (one per worktree) sit north of the
//          │  desks ↑ ││  desks ↑ │        corridor and grow upward, so adding a row
//          └────D─────┘└────D─────┘        never moves the desks nearest the door
//          ═══════════ corridor ══════════  (y = 0..2)
//          │   lobby desks ↓              │ lobby grows downward toward the exit
//          └──────────── X ───────────────┘ X = exit back to the street
//
// Coordinates are tiles. y = -1 is the wall between rooms and corridor.
import { LOBBY_KEY, type SeatBook } from "./seats";

export type CellKind = "floor" | "roomFloor" | "wall" | "door" | "exit";

export interface Seat {
  /** Tile the agent sits on. The desk is the 3 tiles below-left..below-right. */
  x: number;
  y: number;
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
  /** Desk tiles (3 wide) as their left tile; solid. */
  desks: Seat[];
  exit: { x: number; y: number };
  spawn: { x: number; y: number };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  seatOf: Map<string, Seat>;
  /** Changes whenever walls/desks move, so the renderer knows to rebuild statics. */
  geometryKey: string;
}

export const SLOT_W = 3;
export const SLOT_H = 3;
export const ROOM_COLS = 3;
export const LOBBY_COLS = 4;
const ROOM_W = ROOM_COLS * SLOT_W + 2; // interior width
const LOBBY_MIN_W = LOBBY_COLS * SLOT_W + 2;

export const cellKey = (x: number, y: number) => `${x},${y}`;

export function buildFloorPlan(book: SeatBook): FloorPlan {
  const cells = new Map<string, CellKind>();
  const decor: Decor[] = [];
  const desks: Seat[] = [];
  const seatOf = new Map<string, Seat>();
  const set = (x: number, y: number, k: CellKind) => cells.set(cellKey(x, y), k);
  const fill = (x0: number, y0: number, x1: number, y1: number, k: CellKind) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, k);
  };

  const seatAt = (slots: (string | null)[], i: number, seat: Seat) => {
    const id = slots[i];
    if (id) seatOf.set(id, seat);
  };

  // ---- rooms ----------------------------------------------------------------------
  const rooms: RoomPlan[] = book.roomOrder.map((key, i) => {
    const slots = book.slots.get(key) ?? [];
    const rows = Math.max(1, Math.ceil(slots.length / ROOM_COLS));
    const x0 = 1 + i * (ROOM_W + 1);
    const x1 = x0 + ROOM_W - 1;
    const y1 = -2;
    const y0 = -2 - SLOT_H * rows; // one row of headroom above the top desks
    const seats: Seat[] = [];
    for (let s = 0; s < rows * ROOM_COLS; s++) {
      const r = Math.floor(s / ROOM_COLS);
      const c = s % ROOM_COLS;
      const seat = { x: x0 + 1 + c * SLOT_W + 1, y: -4 - r * SLOT_H };
      if (s < slots.length) {
        seats.push(seat);
        desks.push({ x: seat.x - 1, y: seat.y + 1 });
        seatAt(slots, s, seat);
      }
    }
    return { key, label: key, x0, y0, x1, y1, door: { x: x0 + 5, y: -1 }, slots, seats };
  });

  // ---- lobby + corridor -------------------------------------------------------------
  const lobbySlots = book.slots.get(LOBBY_KEY) ?? [];
  const lobbyRows = Math.ceil(lobbySlots.length / LOBBY_COLS);
  const width = Math.max(rooms.length * (ROOM_W + 1) - 1, LOBBY_MIN_W);
  const lobbyBottom = 4 + SLOT_H * lobbyRows;
  const lobbySeats: Seat[] = [];
  lobbySlots.forEach((_, s) => {
    const r = Math.floor(s / LOBBY_COLS);
    const c = s % LOBBY_COLS;
    const seat = { x: 2 + c * SLOT_W + 1, y: 4 + r * SLOT_H };
    lobbySeats.push(seat);
    desks.push({ x: seat.x - 1, y: seat.y + 1 });
    seatAt(lobbySlots, s, seat);
  });
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
  const geometryKey = JSON.stringify([
    rooms.map((r) => [r.key, r.seats.length]),
    lobbySeats.length,
  ]);

  return {
    cells,
    rooms,
    lobby,
    decor,
    desks,
    exit,
    spawn,
    bounds: { minX: 0, minY, maxX: width + 1, maxY: lobbyBottom + 1 },
    seatOf,
    geometryKey,
  };
}
