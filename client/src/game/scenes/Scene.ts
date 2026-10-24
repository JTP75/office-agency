import { Container } from "pixi.js";
import type { Agent } from "../../net/protocol";

export const TILE = 16;

export type Trigger = { kind: "enter"; project: string } | { kind: "exit" };

/** A self-contained map: the street, or one building's interior. Only one is on stage at a time. */
export abstract class Scene {
  readonly root = new Container();
  /** Ground tiles. */
  readonly floor = new Container();
  /** Things painted on the ground or walls (glows, signs). Below every actor. */
  readonly under = new Container();
  /** Y-sorted: furniture, agents and the player. zIndex = bottom edge in px. */
  readonly actors = new Container({ sortableChildren: true });
  /** Labels and bubbles, always on top. */
  readonly overlay = new Container();

  constructor() {
    this.root.addChild(this.floor, this.under, this.actors, this.overlay);
  }

  abstract readonly name: string;
  /** World bounds in px, for camera clamping. */
  abstract bounds(): { x: number; y: number; w: number; h: number };
  abstract isSolid(tx: number, ty: number): boolean;
  abstract triggerAt(tx: number, ty: number): Trigger | null;
  abstract setAgents(agents: Agent[], projects: string[]): void;
  abstract update(time: number): void;

  destroy() {
    this.root.destroy({ children: true });
  }

  /** Nearest walkable tile to (tx, ty), searching outward. */
  nearestFree(tx: number, ty: number) {
    for (let r = 0; r < 12; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.isSolid(tx + dx, ty + dy)) return { x: tx + dx, y: ty + dy };
        }
    return { x: tx, y: ty };
  }
}
