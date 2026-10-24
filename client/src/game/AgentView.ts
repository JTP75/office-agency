// One agent at its desk. Status drives the animation (FRONTEND_HANDOFF §3):
//   working  typing at the keyboard
//   blocked  crying with a "!" bubble — the loudest thing on screen
//   done     waving a raised hand, "✓" bubble
//   idle     asleep at the desk, floating "z"
//   unknown  greyed out with a "?"
import { Container, Graphics, Sprite } from "pixi.js";
import type { Agent, AgentStatus } from "../net/protocol";
import { CITY, INDOOR, city, indoor } from "./assets";
import { TILE } from "./scenes/Scene";
import type { Seat } from "./layout/floorplan";
import { makePlaque, makeText, truncate } from "./text";

export const STATUS_COLOR: Record<AgentStatus, number> = {
  working: 0x4caf50,
  idle: 0x9e9e9e,
  blocked: 0xf44336,
  done: 0x2196f3,
  unknown: 0x7e57c2,
};

const KIND_LOOK: Record<string, number> = { claude: 0, opencode: 1, codex: 2 };

function lookFor(kind: string) {
  if (kind in KIND_LOOK) return KIND_LOOK[kind];
  let h = 0;
  for (const ch of kind) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 3;
}

export class AgentView {
  /** Y-sorted body + chair; lives in the scene's actors layer. */
  readonly body = new Container();
  /** Glow on the floor; lives in the scene's under layer. */
  readonly glow = new Graphics();
  /** Tag, bubble, effects; lives in the scene's overlay layer. */
  readonly top = new Container();

  private chair = new Sprite(indoor(INDOOR.chairBack));
  private person: Sprite;
  private frames: readonly number[];
  private tag = new Container();
  private bubble = new Container();
  private fx = new Graphics();
  private zText = makeText("z", 6, 0xe0e6ff, true);
  private status: AgentStatus = "unknown";
  private title = "";
  private cx = 0;
  private feet = 0;
  private phase = Math.random() * 10;

  constructor(agent: Agent) {
    this.frames = CITY.people[lookFor(agent.kind)];
    this.person = new Sprite(city(this.frames[0]));
    this.person.anchor.set(0.5, 1);
    this.person.scale.set(2);
    this.chair.anchor.set(0.5, 1);
    this.body.addChild(this.chair, this.person);
    this.top.addChild(this.tag, this.fx, this.zText, this.bubble);
    this.set(agent);
  }

  setSeat(seat: Seat) {
    this.cx = seat.x * TILE + TILE / 2;
    // Feet sink into the desk below so the desk hides the legs: "sitting at the desk".
    this.feet = seat.y * TILE + TILE + 5;
    this.body.position.set(this.cx, this.feet);
    this.chair.position.set(0, -3);
    // Just in front of the chair, just behind the desk (desk zIndex = its bottom edge).
    this.body.zIndex = (seat.y + 2) * TILE - 1;
    this.layoutTop();
  }

  set(agent: Agent) {
    if (agent.status !== this.status) {
      this.status = agent.status;
      this.buildBubble();
    }
    // Desks are 48px apart; keep tags inside their own slot.
    const title = truncate(agent.title || agent.id, 11);
    if (title !== this.title) {
      this.title = title;
      this.tag.removeChildren().forEach((c) => c.destroy({ children: true }));
      this.tag.addChild(makePlaque(title, { size: 5 }));
    }
    this.layoutTop();
  }

  private buildBubble() {
    this.bubble.removeChildren().forEach((c) => c.destroy({ children: true }));
    const spec: Partial<Record<AgentStatus, [string, number, number]>> = {
      blocked: ["!", 0xffffff, STATUS_COLOR.blocked],
      done: ["✓", 0xffffff, STATUS_COLOR.done],
      unknown: ["?", 0xffffff, 0x616161],
    };
    const s = spec[this.status];
    if (!s) return;
    const big = this.status === "blocked";
    const r = big ? 7 : 5;
    const g = new Graphics()
      .circle(0, 0, r)
      .fill(s[2])
      .stroke({ width: 1, color: 0xffffff })
      .poly([-2, r - 1, 2, r - 1, 0, r + 3])
      .fill(s[2]);
    const t = makeText(s[0], big ? 10 : 7, s[1], true);
    t.anchor.set(0.5, 0.5);
    t.position.set(0, big ? 0 : 0);
    this.bubble.addChild(g, t);
  }

  private layoutTop() {
    const headTop = this.feet - 16;
    this.tag.position.set(this.cx, headTop - 1);
    this.bubble.position.set(this.cx, headTop - 16);
    this.glow.position.set(this.cx, this.feet + 6);
  }

  update(time: number) {
    const t = time + this.phase;
    const p = this.person;
    const fx = this.fx.clear();
    this.glow.clear();
    this.zText.visible = false;
    p.tint = 0xffffff;
    p.alpha = 1;
    p.x = 0;
    p.y = 0;
    this.bubble.scale.set(1);
    this.bubble.y = this.feet - 32;

    switch (this.status) {
      case "working": {
        p.texture = city(this.frames[Math.floor(t * 10) % 2 === 0 ? 1 : 2]);
        p.y = Math.floor(t * 10) % 2 === 0 ? 0 : -1;
        break;
      }
      case "blocked": {
        p.texture = city(this.frames[0]);
        p.x = Math.round(Math.sin(t * 40) * 0.8);
        if (Math.floor(t * 3) % 2 === 0) p.tint = 0xffb3b3;
        const pulse = 1 + 0.25 * Math.abs(Math.sin(t * 4));
        this.bubble.scale.set(pulse);
        this.bubble.y = this.feet - 34 - Math.abs(Math.sin(t * 4)) * 2;
        // Tears: two drops falling from the eyes.
        for (const [dx, off] of [[-2, 0], [2, 0.3]] as const) {
          const k = (t * 1.6 + off) % 1;
          fx.rect(this.cx + dx, this.feet - 11 + k * 7, 1, 2).fill({ color: 0x29adff, alpha: 1 - k });
        }
        // Red floor glow: findable from across the room.
        const a = 0.18 + 0.2 * Math.abs(Math.sin(t * 4));
        this.glow.ellipse(0, 0, 26, 12).fill({ color: STATUS_COLOR.blocked, alpha: a });
        break;
      }
      case "done": {
        p.texture = city(this.frames[0]);
        p.y = -Math.round(Math.abs(Math.sin(t * 5)) * 2);
        // Raised, waving hand.
        const wave = Math.round(Math.sin(t * 10));
        fx.rect(this.cx + 6 + wave, this.feet - 20 + p.y, 2, 5).fill(0xffccaa);
        this.bubble.y = this.feet - 32 + p.y;
        break;
      }
      case "idle": {
        p.texture = city(this.frames[0]);
        p.tint = 0xa8a8c0;
        p.y = 2; // slumped onto the desk
        const k = (t * 0.5) % 1;
        this.zText.visible = true;
        this.zText.alpha = 1 - k;
        this.zText.position.set(this.cx + 4 + k * 4, this.feet - 20 - k * 8);
        break;
      }
      case "unknown": {
        p.texture = city(this.frames[0]);
        p.tint = 0x777777;
        p.alpha = 0.55;
        break;
      }
    }
  }

  destroy() {
    this.body.destroy({ children: true });
    this.glow.destroy();
    this.top.destroy({ children: true });
  }
}
