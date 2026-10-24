import { Container, Graphics, Sprite } from "pixi.js";
import { CITY, city } from "./assets";
import { moveAxis } from "./input";
import { TILE, type Scene } from "./scenes/Scene";

const SPEED = 80; // px per second (5 tiles/s)
const HALF_W = 5; // feet hitbox, px
const HEIGHT = 5;
const FRAMES = CITY.people[3];

export class Player {
  readonly root = new Container();
  private body: Sprite;
  private marker: Graphics;
  /** Feet position in world px. */
  x = 0;
  y = 0;
  private walkTime = 0;

  constructor() {
    this.body = new Sprite(city(FRAMES[0]));
    this.body.anchor.set(0.5, 1);
    this.body.scale.set(2);
    // A small yellow arrow so "you" reads apart from the agents.
    this.marker = new Graphics().poly([-3, 0, 3, 0, 0, 3]).fill(0xffd54f).stroke({ width: 0.5, color: 0x1b1d23 });
    this.root.addChild(this.body, this.marker);
  }

  placeAtTile(tx: number, ty: number) {
    this.x = tx * TILE + TILE / 2;
    this.y = ty * TILE + TILE - 2;
    this.sync(0);
  }

  get tileX() {
    return Math.floor(this.x / TILE);
  }
  get tileY() {
    return Math.floor((this.y - 1) / TILE);
  }

  private blocked(scene: Scene, x: number, y: number) {
    const pts = [
      [x - HALF_W, y - HEIGHT],
      [x + HALF_W, y - HEIGHT],
      [x - HALF_W, y - 1],
      [x + HALF_W, y - 1],
    ];
    return pts.some(([px, py]) => scene.isSolid(Math.floor(px / TILE), Math.floor(py / TILE)));
  }

  update(scene: Scene, dt: number, time: number, frozen: boolean) {
    const { x: ax, y: ay } = frozen ? { x: 0, y: 0 } : moveAxis();
    const moving = ax !== 0 || ay !== 0;
    if (moving) {
      const len = Math.hypot(ax, ay);
      const step = (SPEED * dt) / len;
      // Resolve each axis separately so the player slides along walls.
      if (!this.blocked(scene, this.x + ax * step, this.y)) this.x += ax * step;
      if (!this.blocked(scene, this.x, this.y + ay * step)) this.y += ay * step;
      if (ax !== 0) this.body.scale.x = ax < 0 ? -2 : 2;
      this.walkTime += dt;
    } else {
      this.walkTime = 0;
    }
    this.body.texture = city(FRAMES[moving ? 1 + (Math.floor(this.walkTime * 8) % 2) : 0]);
    this.sync(time);
  }

  private sync(time: number) {
    this.root.position.set(Math.round(this.x), Math.round(this.y));
    this.root.zIndex = this.y;
    this.marker.position.set(0, -21 + Math.round(Math.sin(time * 4)));
  }
}
