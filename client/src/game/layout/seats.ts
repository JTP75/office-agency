// Stable desk assignment. Agents keep their desk for as long as their session lives:
// a leaving agent leaves an empty slot, an arriving agent takes the first empty slot
// in its room (or a new one at the end). Nobody else moves.
import type { Agent } from "../../net/protocol";

export const LOBBY_KEY = "\u0000lobby";

export function roomKey(a: Agent) {
  return a.lobby ? LOBBY_KEY : (a.worktree ?? "(no branch)");
}

export class SeatBook {
  /** Room keys in first-seen order (lobby excluded). Rooms are never removed. */
  readonly roomOrder: string[] = [];
  /** room key → slots; a slot holds an agent id or null when vacated. */
  readonly slots = new Map<string, (string | null)[]>([[LOBBY_KEY, []]]);

  update(agents: Agent[]) {
    const wanted = new Map<string, string>(); // id → room key
    for (const a of agents) wanted.set(a.id, roomKey(a));

    // Vacate seats whose agent left or moved to another room.
    for (const [key, slots] of this.slots) {
      for (let i = 0; i < slots.length; i++) {
        const id = slots[i];
        if (id !== null && wanted.get(id) !== key) slots[i] = null;
      }
    }

    const seated = new Set<string>();
    for (const slots of this.slots.values()) for (const id of slots) if (id) seated.add(id);

    for (const a of agents) {
      if (seated.has(a.id)) continue;
      const key = roomKey(a);
      let slots = this.slots.get(key);
      if (!slots) {
        slots = [];
        this.slots.set(key, slots);
        this.roomOrder.push(key);
      }
      const free = slots.indexOf(null);
      if (free >= 0) slots[free] = a.id;
      else slots.push(a.id);
      seated.add(a.id);
    }

    // Trailing empty slots can go: dropping them never moves an occupied desk.
    for (const slots of this.slots.values()) while (slots.length && slots[slots.length - 1] === null) slots.pop();
  }
}
