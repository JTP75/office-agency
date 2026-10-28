// The outdoor street, drawn with pico-8-city tiles at 2×. One building per project,
// grouped into one district per machine when there are saved SSH machines.
// Interiors are separate scenes; from out here you only see each building's facade,
// its name, and a roof-top summary of who's inside.
import { Container, Graphics, Sprite } from "pixi.js";
import type { Agent } from "../../net/protocol";
import { CITY, PAINT, city } from "../assets";
import { STATUS_COLOR } from "../AgentView";
import { BUILDING_W, STREET_H, buildStreet, type DistrictInput, type StreetPlan } from "../layout/street";
import { makePlaque, makeText, truncate } from "../text";
import { Scene, TILE, type Trigger } from "./Scene";

const key = (x: number, y: number) => `${x},${y}`;

/** District sign colors: local, then a machine by connection status. */
const DISTRICT_BG: Record<string, number> = {
  local: 0x37474f,
  online: 0x2e7d32,
  connecting: 0x9a7b0a,
  offline: 0x5f6368,
  attention: 0xc62828,
};
/** Ground tint over a machine's district; offline ones read as dimmed. */
const DISTRICT_TINT: Record<string, { color: number; alpha: number }> = {
  online: { color: 0x3b6ea5, alpha: 0.16 },
  connecting: { color: 0x3b6ea5, alpha: 0.16 },
  offline: { color: 0x000000, alpha: 0.28 },
  attention: { color: 0x7a1f1f, alpha: 0.18 },
};

export class StreetScene extends Scene {
  readonly name = "street";
  plan: StreetPlan = buildStreet([]);
  private layoutKey = "\u0000";
  private districts: DistrictInput[] = [];
  private tints = new Graphics();
  private solids = new Set<string>();
  private doors = new Map<string, string>(); // tile → project
  private staticActors: Container[] = [];
  private roofs = new Container();
  private badges: { g: Container; baseY: number }[] = [];

  constructor() {
    super();
    this.overlay.addChild(this.roofs);
  }

  bounds() {
    return { x: 0, y: 0, w: this.plan.width * TILE, h: this.plan.height * TILE };
  }

  isSolid(tx: number, ty: number) {
    if (tx < 0 || ty < 0 || tx >= this.plan.width || ty >= this.plan.height) return true;
    return this.solids.has(key(tx, ty));
  }

  triggerAt(tx: number, ty: number): Trigger | null {
    const project = this.doors.get(key(tx, ty));
    return project ? { kind: "enter", project } : null;
  }

  doorOf(project: string) {
    return this.plan.lots.find((l) => l.project === project)?.door ?? null;
  }

  setAgents(agents: Agent[], districts: DistrictInput[]) {
    // Only which buildings sit in which district moves tiles; a status change just repaints.
    const k = JSON.stringify(districts.map((d) => [d.machine, d.projects]));
    this.districts = districts;
    if (k !== this.layoutKey) {
      this.layoutKey = k;
      this.plan = buildStreet(districts);
      this.rebuild();
    }
    this.paintTints();
    this.refreshRoofs(agents);
  }

  /** The current status of a planned district (the plan is only rebuilt when layout changes). */
  private live(i: number) {
    return this.districts[i] ?? this.plan.districts[i];
  }

  private paintTints() {
    this.tints.clear();
    this.plan.districts.forEach((d, i) => {
      const status = this.live(i).status;
      const tint = status ? DISTRICT_TINT[status] : null;
      if (!tint) return;
      const w = (d.x1 - d.x0) * TILE;
      // North side and south side; the road stays shared.
      this.tints.rect(d.x0 * TILE, 0, w, 10 * TILE).fill(tint);
      this.tints.rect(d.x0 * TILE, 13 * TILE, w, (STREET_H - 13) * TILE).fill(tint);
    });
  }

  update(time: number) {
    for (const b of this.badges) {
      const s = 1 + 0.2 * Math.abs(Math.sin(time * 4));
      b.g.scale.set(s);
      b.g.y = b.baseY - Math.abs(Math.sin(time * 4)) * 2;
    }
  }

  // ---- statics ------------------------------------------------------------------------

  private sprite(index: number, tx: number, ty: number, parent: Container) {
    const s = new Sprite(city(index));
    s.scale.set(2);
    s.position.set(tx * TILE, ty * TILE);
    parent.addChild(s);
    return s;
  }

  /** A grass tile everywhere but the road (which is painted, see below). */
  private grassAt(x: number, y: number) {
    const h = (x * 73 + y * 151) % 11;
    return h === 0 ? CITY.grassFlowers : h < 3 ? CITY.grassDots : CITY.grass;
  }

  private roadAt(y: number) {
    return y === 10 ? PAINT.roadTop : y === 11 ? PAINT.road : y === 12 ? PAINT.roadBottom : null;
  }

  private rebuild() {
    this.floor.removeChildren().forEach((c) => c.destroy());
    for (const c of this.staticActors) c.destroy({ children: true });
    this.staticActors = [];
    this.solids.clear();
    this.doors.clear();
    const { width, height, lots, trees, bushes } = this.plan;

    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const road = this.roadAt(y);
        if (!road) {
          this.sprite(this.grassAt(x, y), x, y, this.floor);
          continue;
        }
        const s = new Sprite(road);
        s.scale.set(2);
        s.position.set(x * TILE, y * TILE);
        this.floor.addChild(s);
      }
    this.tints = new Graphics();
    this.floor.addChild(this.tints);

    lots.forEach((lot, i) => {
      const b = new Container();
      const row = (y: number, ids: readonly number[]) => ids.forEach((id, x) => this.sprite(id, x, y, b));
      const span = (l: number, m: number, r: number) => [l, ...Array(BUILDING_W - 2).fill(m), r];
      CITY.roof.forEach(([l, m, r], y) => row(y, span(l, m, r)));
      row(3, Array(BUILDING_W).fill(CITY.awnings[i % CITY.awnings.length]));
      row(4, [CITY.facadeLeft, CITY.facadeWindow, CITY.facadeDoor, CITY.facadeWindowAlt, CITY.facadeWindow, CITY.facadeRight]);
      b.position.set(lot.x * TILE, lot.y * TILE);
      b.zIndex = (lot.y + 5) * TILE;
      this.actors.addChild(b);
      this.staticActors.push(b);
      for (let y = lot.y; y < lot.y + 5; y++)
        for (let x = lot.x; x < lot.x + BUILDING_W; x++) if (x !== lot.door.x || y !== lot.door.y) this.solids.add(key(x, y));
      this.doors.set(key(lot.door.x, lot.door.y), lot.project);
    });

    for (const t of trees) {
      const [top, trunk] = CITY.trees[t.v % CITY.trees.length];
      const c = new Container();
      this.sprite(top, 0, 0, c);
      this.sprite(trunk, 0, 1, c);
      c.position.set(t.x * TILE, t.y * TILE);
      c.zIndex = (t.y + 2) * TILE;
      this.actors.addChild(c);
      this.staticActors.push(c);
      this.solids.add(key(t.x, t.y + 1));
    }

    for (const b of bushes) {
      const c = new Container();
      this.sprite(CITY.bush, 0, 0, c);
      c.position.set(b.x * TILE, b.y * TILE);
      c.zIndex = (b.y + 1) * TILE;
      this.actors.addChild(c);
      this.staticActors.push(c);
      this.solids.add(key(b.x, b.y));
    }
  }

  /**
   * The district's sign, on the verge just south of the road where you walk past it:
   * machine label and, for a saved machine, its connection. A district with no
   * buildings also shows why (the message often names the command that fixes it).
   */
  private districtSign(area: StreetPlan["districts"][number], d: DistrictInput) {
    const text = d.status ? `${truncate(d.label, 24)} · ${d.status}` : truncate(d.label, 24);
    const sign = makePlaque(text, { size: 7, bg: DISTRICT_BG[d.status ?? "local"], border: 0xffffff, alpha: 0.95 });
    sign.position.set(area.cx * TILE, 13 * TILE + 12);
    this.roofs.addChild(sign);
    if (!d.projects.length) {
      const note = makeText(truncate(d.message ?? (d.status === "online" ? "no agents" : "no buildings yet"), 40), 5, 0xffffff, true);
      note.anchor.set(0.5, 0);
      note.position.set(area.cx * TILE, 13 * TILE + 14);
      this.roofs.addChild(note);
    }
  }

  /** Name sign above each building, status dots on the roof, a pulsing badge if anyone is blocked. */
  private refreshRoofs(agents: Agent[]) {
    this.roofs.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.badges = [];
    this.plan.districts.forEach((d, i) => this.districtSign(d, this.live(i)));
    for (const lot of this.plan.lots) {
      const inside = agents.filter((a) => a.project === lot.project);
      const cx = (lot.x + BUILDING_W / 2) * TILE;

      const sign = makePlaque(`${truncate(lot.project, 22)} · ${inside.length}`, { size: 6 });
      sign.position.set(cx, lot.y * TILE - 2);
      this.roofs.addChild(sign);

      // Roof-top dots: one per agent, blocked first so they're never hidden by overflow.
      const order = { blocked: 0, done: 1, working: 2, idle: 3, unknown: 4 } as const;
      const sorted = [...inside].sort((a, b) => order[a.status] - order[b.status]);
      const perRow = 8;
      const max = perRow * 3;
      const dots = new Graphics();
      sorted.slice(0, max).forEach((a, i) => {
        const x = lot.x * TILE + 12 + (i % perRow) * 9;
        const y = lot.y * TILE + 11 + Math.floor(i / perRow) * 9;
        dots.circle(x, y, 3).fill(STATUS_COLOR[a.status]).stroke({ width: 1, color: 0x1b1d23 });
      });
      this.roofs.addChild(dots);
      if (sorted.length > max) {
        const more = makeText(`+${sorted.length - max}`, 5, 0xffffff, true);
        more.position.set(lot.x * TILE + 12, lot.y * TILE + 36);
        this.roofs.addChild(more);
      }

      const blocked = inside.filter((a) => a.status === "blocked").length;
      if (blocked) {
        const g = new Container();
        const circle = new Graphics().circle(0, 0, 7).fill(STATUS_COLOR.blocked).stroke({ width: 1, color: 0xffffff });
        const t = makeText(`!${blocked}`, 7, 0xffffff, true);
        t.anchor.set(0.5);
        g.addChild(circle, t);
        const baseY = lot.y * TILE - 2;
        g.position.set((lot.x + BUILDING_W) * TILE - 2, baseY);
        this.roofs.addChild(g);
        this.badges.push({ g, baseY });
      }
    }
  }
}
