// Owns the Pixi application, the active scene, the player, the camera and scene transitions.
import { Application, Container, Graphics } from "pixi.js";
import { closeDrawer, districts, store, type Location, type OfficeState } from "../state/store";
import { drawerWidth } from "../ui/drawerLayout";
import { loadAssets } from "./assets";
import { installInput } from "./input";
import { SeatBook } from "./layout/seats";
import { Player } from "./Player";
import { InteriorScene } from "./scenes/InteriorScene";
import type { Scene } from "./scenes/Scene";
import { StreetScene } from "./scenes/StreetScene";

const FADE_S = 0.18;
/** E works within this many tiles of an agent's seat (desks sit between you and them). */
const NEAR_TILES = 2.3;
/** An E-opened drawer closes once you walk this far from the agent. */
const LEAVE_TILES = 3.5;

type Fade = { phase: "out" | "in"; t: number; to: Location };

export class Game {
  private app = new Application();
  private world = new Container();
  private curtain = new Graphics();
  private street = new StreetScene();
  private scene: Scene = this.street;
  private player!: Player; // created after textures load
  private books = new Map<string, SeatBook>();
  private fade: Fade | null = null;
  /** The building the player most recently left, so we exit onto its doorstep. */
  private lastBuilding: string | null = null;
  private time = 0;
  private zoom = 3;

  async init(host: HTMLElement) {
    await this.app.init({
      preference: "webgpu", // falls back to WebGL2 when WebGPU is unavailable
      resizeTo: window,
      background: 0x0b0c10,
      antialias: false,
      roundPixels: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    host.appendChild(this.app.canvas);
    await loadAssets();
    this.player = new Player();
    installInput();

    store.setState({ renderer: this.app.renderer.name });
    this.app.stage.addChild(this.world, this.curtain);
    this.mount(this.street);
    this.street.setAgents(store.getState().agents, districts(store.getState()));
    this.player.placeAtTile(this.street.plan.spawn.x, this.street.plan.spawn.y);

    store.subscribe((s, prev) => {
      if (s.agents !== prev.agents || s.projects !== prev.projects || s.machines !== prev.machines) this.onAgents(s);
      if (s.travelRequest && s.travelRequest !== prev.travelRequest) {
        store.setState({ travelRequest: null });
        this.travel(s.travelRequest);
      }
    });
    this.onAgents(store.getState());

    addEventListener("resize", () => this.layout());
    this.layout();
    this.app.ticker.add((tk) => this.tick(Math.min(tk.deltaMS / 1000, 0.05)));
  }

  private book(project: string) {
    let b = this.books.get(project);
    if (!b) {
      b = new SeatBook();
      this.books.set(project, b);
    }
    return b;
  }

  private onAgents(s: OfficeState) {
    const { agents, projects } = s;
    // Seat every project's agents in arrival order, even for buildings we're not inside.
    for (const p of projects) this.book(p).update(agents.filter((a) => a.project === p));
    this.street.setAgents(agents, districts(s));
    if (this.scene instanceof InteriorScene) {
      this.scene.setAgents(agents);
      this.unstick();
    }
  }

  /** If the layout grew under the player, step to the nearest free tile. */
  private unstick() {
    const { tileX, tileY } = this.player;
    if (!this.scene.isSolid(tileX, tileY)) return;
    const free = this.scene.nearestFree(tileX, tileY);
    this.player.placeAtTile(free.x, free.y);
  }

  private mount(scene: Scene) {
    this.world.removeChildren();
    this.scene = scene;
    this.world.addChild(scene.root);
    scene.actors.addChild(this.player.root);
  }

  travel(to: Location) {
    if (this.fade) return;
    const here = store.getState().location;
    if (here.kind === to.kind && (to.kind === "street" || (here.kind === "building" && here.project === to.project))) return;
    this.fade = { phase: "out", t: 0, to };
  }

  private arrive(to: Location) {
    const leaving = this.scene;
    leaving.actors.removeChild(this.player.root);
    if (leaving instanceof InteriorScene) {
      this.lastBuilding = leaving.project;
      leaving.destroy();
    }

    if (to.kind === "street") {
      this.mount(this.street);
      const door = this.lastBuilding ? this.street.doorOf(this.lastBuilding) : null;
      const at = door ? { x: door.x, y: door.y + 1 } : this.street.plan.spawn;
      this.player.placeAtTile(at.x, at.y);
    } else {
      const inside = new InteriorScene(to.project, this.book(to.project));
      inside.setAgents(store.getState().agents);
      this.mount(inside);
      this.player.placeAtTile(inside.spawn.x, inside.spawn.y);
      this.lastBuilding = to.project;
    }
    store.setState({ location: to });
  }

  private tick(dt: number) {
    this.time += dt;
    const frozen = this.fade !== null;
    this.player.update(this.scene, dt, this.time, frozen);
    this.scene.update(this.time);

    if (!frozen) {
      const trig = this.scene.triggerAt(this.player.tileX, this.player.tileY);
      if (trig?.kind === "enter") this.travel({ kind: "building", project: trig.project });
      else if (trig?.kind === "exit") this.travel({ kind: "street" });
    }

    this.trackAgents();
    this.stepFade(dt);
    this.camera();
  }

  /** Who's in reach for E, and close an E-opened drawer when we walk away. */
  private trackAgents() {
    const s = store.getState();
    const inside = this.scene instanceof InteriorScene ? this.scene : null;
    const { tileX, tileY } = this.player;
    const near = inside && !this.fade ? inside.agentNear(tileX, tileY, NEAR_TILES) : null;
    if (near !== s.nearAgent) store.setState({ nearAgent: near });
    if (s.drawer?.openedBy === "e" && !this.fade) {
      const d = inside?.distanceTo(s.drawer.agentId, tileX, tileY) ?? null;
      if (d === null || d > LEAVE_TILES) closeDrawer();
    }
  }

  private stepFade(dt: number) {
    const f = this.fade;
    let alpha = 0;
    if (f) {
      f.t += dt / FADE_S;
      if (f.phase === "out") {
        alpha = Math.min(f.t, 1);
        if (f.t >= 1) {
          this.arrive(f.to);
          f.phase = "in";
          f.t = 0;
        }
      } else {
        alpha = 1 - Math.min(f.t, 1);
        if (f.t >= 1) this.fade = null;
      }
      if (f.phase === "in" && f.t === 0) alpha = 1;
    }
    const { width, height } = this.app.screen;
    this.curtain.clear();
    if (alpha > 0) this.curtain.rect(0, 0, width, height).fill({ color: 0x000000, alpha });
  }

  private layout() {
    const { width, height } = this.app.screen;
    // Integer zoom keeps pixel art crisp; aim for roughly 22×13 tiles on screen.
    this.zoom = Math.max(2, Math.min(5, Math.round(Math.min(width / (16 * 22), height / (16 * 13)))));
    this.world.scale.set(this.zoom);
  }

  private camera() {
    // Center on the part of the screen the agent drawer doesn't cover.
    const width = this.app.screen.width - drawerWidth(store.getState().drawer !== null);
    const { height } = this.app.screen;
    const z = this.zoom;
    const b = this.scene.bounds();
    const axis = (view: number, start: number, size: number, focus: number) => {
      if (size * z <= view) return Math.round(view / 2 - (start + size / 2) * z); // fits: center it
      const p = view / 2 - focus * z;
      return Math.round(Math.min(-start * z, Math.max(view - (start + size) * z, p)));
    };
    this.world.position.set(axis(width, b.x, b.w, this.player.x), axis(height, b.y, b.h, this.player.y - 8));
  }
}
