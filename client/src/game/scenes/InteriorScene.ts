// Inside one project's building, drawn with roguelike-indoors furniture.
// The floor plan is regenerated from the seat book on every snapshot; statics are only
// rebuilt when the geometry actually changes, and agents keep their desks throughout.
import { Container, Sprite, Texture } from "pixi.js";
import type { Agent } from "../../net/protocol";
import { INDOOR, PAINT, indoor } from "../assets";
import { AgentView } from "../AgentView";
import { buildFloorPlan, cellKey, type CellKind, type Decor, type FloorPlan } from "../layout/floorplan";
import type { SeatBook } from "../layout/seats";
import { makePlaque, truncate } from "../text";
import { Scene, TILE, type Trigger } from "./Scene";

const WALKABLE: ReadonlySet<CellKind> = new Set(["floor", "roomFloor", "door", "exit"]);

export class InteriorScene extends Scene {
  readonly name: string;
  plan!: FloorPlan;
  private solids = new Set<string>();
  private statics = new Container(); // floor tiles + wall tiles
  private staticActors: Container[] = []; // y-sorted furniture
  private signs = new Container();
  private views = new Map<string, AgentView>();

  constructor(
    readonly project: string,
    private book: SeatBook,
  ) {
    super();
    this.name = project;
    this.floor.addChild(this.statics);
    this.under.addChild(this.signs);
  }

  bounds() {
    const b = this.plan.bounds;
    return { x: b.minX * TILE, y: b.minY * TILE, w: (b.maxX - b.minX + 1) * TILE, h: (b.maxY - b.minY + 1) * TILE };
  }

  isSolid(tx: number, ty: number) {
    const k = cellKey(tx, ty);
    const cell = this.plan.cells.get(k);
    return !cell || !WALKABLE.has(cell) || this.solids.has(k);
  }

  triggerAt(tx: number, ty: number): Trigger | null {
    return this.plan.exit.x === tx && this.plan.exit.y === ty ? { kind: "exit" } : null;
  }

  get spawn() {
    return this.plan.spawn;
  }

  /** The seat book must already be updated with these agents. */
  setAgents(all: Agent[]) {
    const agents = all.filter((a) => a.project === this.project);
    const prevKey = this.plan?.geometryKey;
    this.plan = buildFloorPlan(this.book);
    if (this.plan.geometryKey !== prevKey) this.rebuildStatics();
    this.refreshSigns(agents);

    const live = new Set(agents.map((a) => a.id));
    for (const [id, view] of this.views) {
      if (!live.has(id)) {
        view.destroy();
        this.views.delete(id);
      }
    }
    for (const a of agents) {
      let view = this.views.get(a.id);
      if (!view) {
        view = new AgentView(a);
        this.views.set(a.id, view);
        this.actors.addChild(view.body);
        this.under.addChild(view.glow);
        this.overlay.addChild(view.top);
      } else {
        view.set(a);
      }
      const seat = this.plan.seatOf.get(a.id);
      if (seat) view.setSeat(seat);
    }
  }

  update(time: number) {
    for (const v of this.views.values()) v.update(time);
  }

  // ---- statics ------------------------------------------------------------------------

  private tile(tex: Texture, tx: number, ty: number, parent: Container) {
    const s = new Sprite(tex);
    s.position.set(tx * TILE, ty * TILE);
    parent.addChild(s);
    return s;
  }

  private rebuildStatics() {
    this.statics.removeChildren().forEach((c) => c.destroy());
    for (const c of this.staticActors) c.destroy({ children: true });
    this.staticActors = [];
    this.solids.clear();
    const { cells, desks, decor, rooms } = this.plan;

    const isOpen = (x: number, y: number) => {
      const c = cells.get(cellKey(x, y));
      return !!c && WALKABLE.has(c);
    };

    for (const [k, kind] of cells) {
      const [x, y] = k.split(",").map(Number);
      if (kind === "wall") {
        // A wall with open floor south of it shows its face; otherwise its top.
        this.tile(isOpen(x, y + 1) ? PAINT.wallFace : PAINT.wallTop, x, y, this.statics);
      } else {
        const inRoom = kind === "roomFloor" || (kind === "door" && rooms.length > 0);
        this.tile(inRoom ? PAINT.floorRoom : PAINT.floor, x, y, this.statics);
      }
    }

    // Desks: a 3-tile desk with a monitor; the seat tile above it holds the chair.
    for (const d of desks) {
      const desk = new Container();
      INDOOR.desk.forEach((id, i) => this.tile(indoor(id), i, 0, desk));
      // Monitor off to the side so it never hides the agent's face.
      const mon = this.tile(indoor(INDOOR.monitor), 2, 0, desk);
      mon.y = -9;
      desk.position.set(d.x * TILE, d.y * TILE);
      desk.zIndex = (d.y + 1) * TILE;
      this.actors.addChild(desk);
      this.staticActors.push(desk);
      for (let i = 0; i < 3; i++) this.solids.add(cellKey(d.x + i, d.y));
      this.solids.add(cellKey(d.x + 1, d.y - 1)); // the chair
    }

    for (const d of decor) this.placeDecor(d);
  }

  private placeDecor(d: Decor) {
    const tex: Record<Decor["kind"], Texture | undefined> = {
      plant: indoor(INDOOR.plants[d.v % 2]),
      shelf: indoor(INDOOR.shelves[d.v % 2]),
      painting: indoor(INDOOR.painting),
      mirror: indoor(INDOOR.mirror),
      counter: indoor(INDOOR.counter[d.v % 3]),
      rug: indoor(INDOOR.rugTeal[d.v % 3]),
      mat: PAINT.mat,
    };
    const t = tex[d.kind];
    if (!t) return;
    if (d.kind === "mat" || d.kind === "rug" || d.kind === "painting" || d.kind === "mirror") {
      // Flat things live on the floor/wall layer.
      const s = this.tile(t, d.x, d.y, this.statics);
      if (d.kind === "painting") s.y -= 2;
      return;
    }
    const c = new Container();
    this.tile(t, 0, 0, c);
    c.position.set(d.x * TILE, d.y * TILE);
    c.zIndex = (d.y + 1) * TILE;
    this.actors.addChild(c);
    this.staticActors.push(c);
    if (d.solid) this.solids.add(cellKey(d.x, d.y));
  }

  /** Door signs: the branch name and head-count, on the corridor side of each room's wall. */
  private refreshSigns(agents: Agent[]) {
    this.signs.removeChildren().forEach((c) => c.destroy({ children: true }));
    for (const r of this.plan.rooms) {
      const n = agents.filter((a) => !a.lobby && (a.worktree ?? "(no branch)") === r.key).length;
      const sign = makePlaque(`${truncate(r.label, 20)} · ${n}`, {
        size: 5,
        fg: 0x2b2116,
        bg: n ? 0xf4e7c5 : 0xcfc4a8,
        border: 0x6b4a2e,
        alpha: 1,
      });
      // Hangs over the doorway, on the wall face the corridor sees.
      sign.position.set((r.door.x + 0.5) * TILE, r.door.y * TILE + 9);
      this.signs.addChild(sign);
    }
    const lobbyN = agents.filter((a) => a.lobby).length;
    const lobbySign = makePlaque(`${truncate(this.project, 20)} · lobby · ${lobbyN}`, {
      size: 5,
      fg: 0xffffff,
      bg: 0x3a2a1c,
      alpha: 0.9,
    });
    lobbySign.position.set((this.plan.exit.x + 0.5) * TILE, (this.plan.exit.y + 1) * TILE + 10);
    this.signs.addChild(lobbySign);
  }

  destroy() {
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    super.destroy();
  }
}
