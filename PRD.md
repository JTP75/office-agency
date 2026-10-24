# Office Agency — PRD & Work Split

2026-10-24 · Justin

## Summary

We're building a 2D top-down office where each coding agent is a person at a desk, animated by its herdr lifecycle state, and the user walks over to talk to them. Two people, one seam: **frontend owns the game, backend owns everything between the game and the agent harnesses.** The protocol between them is the only thing both sides touch.

We work in two phases:

1. **Walking skeleton.** One deployment working end to end with no features: herdr launches the plugin, the server starts, a browser opens, and the player walks around a map while a live agent feed shows in the HUD.
2. **Split.** Both people build out their side in parallel against the protocol. Frontend runs against the fixture source so it never waits on backend.

Background, deployment analysis and architecture live in `HANDOFF.md`; this doc covers only who builds what.

## Ownership

Each directory has one owner. The owner merges freely there; changes to the other person's directory go through them.

| Area | Owner | Paths | Responsible for |
| --- | --- | --- | --- |
| Game interface | Frontend | `client/` | Map, avatars, state animations, camera, movement, proximity, interaction panel, minimap, HUD, any build tooling (Vite, Phaser/Pixi) |
| Harness integration | Backend (Justin) | `server/`, `scripts/`, `herdr-plugin.toml` | Plugin lifecycle, HTTP + token gate, `AgentSource` (herdr + fixture), event relay, prompt/read/keys proxy, tunnel, install path |
| Contract | Both | `PROTOCOL.md` | Message shapes over the wire. Changed only by a PR both people approve |
| Demo | Both | `docs/demo.md` | Scripted fixture day, runbook, recording |

The frontend never talks to herdr directly, and the backend never draws pixels. If a feature needs both (e.g. "show the agent's live terminal"), it starts as a protocol change.

## The contract

`PROTOCOL.md` is the canonical, up-to-date version of this section (it adds `project`, `worktree`, `lobby` and `source`).

The server pushes full snapshots over Server-Sent Events and accepts commands over POST. Every `/api/*` call carries the page's token as `?t=<token>`; the client reads it from its own URL.

**Push (v0):** `GET /api/events?t=…` streams one JSON message per change. The server sends the current snapshot on connect, so the client never needs a separate fetch.

```json
{ "type": "snapshot", "agents": [ { "id": "w1:p3", "kind": "claude", "status": "working", "workspace": "w1", "tab": "w1:t2", "title": "Fix flaky auth test" } ] }
```

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | herdr pane id; stable for the agent's life, use it as the desk key |
| `kind` | string | harness: `claude`, `codex`, `opencode`, … |
| `status` | enum | `working` · `idle` · `blocked` · `done` · `unknown` |
| `workspace` | string | herdr workspace id → room |
| `tab` | string | herdr tab id → wing / desk cluster |
| `title` | string | terminal title; display above the head |

**Commands (v1, backend builds in phase 2):**

| Call | Body | Returns | herdr primitive |
| --- | --- | --- | --- |
| `POST /api/agents/:id/prompt` | `{ "text": "…" }` | `{ ok }` or `{ error: "agent_blocked" }` | `agent prompt` |
| `GET /api/agents/:id/read?lines=40` | — | `{ lines: ["…"] }` | `agent read --source recent-unwrapped` |
| `POST /api/agents/:id/keys` | `{ "keys": ["esc"] }` | `{ ok }` | `agent send-keys` (approval dialogs) |
| `POST /api/agents/:id/focus` | — | `{ ok }` | `agent focus` (jump to the real pane) |

Additive fields are fine without a review (the client ignores unknown keys). Renaming or removing a field, or changing a status value, needs both people.

## Phase 1: walking skeleton

Backend builds the skeleton alone, then hands `client/` over. It's done when every box below is ticked on one laptop, from a fresh clone.

- [x] `herdr plugin link .` registers the plugin with no warnings
- [x] Running the **Open office** action starts the server in the background and opens the browser, adding nothing to the herdr layout
- [ ] The player walks the map with WASD / arrow keys and stops at walls and desks
- [x] The HUD shows the real agent count and colored status dots, and they change when an agent changes state
- [x] `node server/index.mjs --source fixture` runs the same page with no herdr installed
- [x] Stopping herdr (or the **Stop office** action) stops the server and removes `office.json`

Built and pushed: the plugin manifest, a zero-dependency Node server with token gate and SSE, `HerdrSource` (push-fed from `events.subscribe`, resolves each agent's project and worktree from git) and `FixtureSource` (13 agents across 2 projects and 5 worktrees, random status every 3 s), the open action, and a plain-canvas client with a tile map, movement and collision. The server runs as a background daemon started by the open action; it is push-fed from herdr's event stream and exits when herdr stops. Plugin path (link → open → stop) verified against a throwaway herdr session.

The client is deliberately throwaway: no framework, no build step. Frontend picks the engine and tooling in phase 2; the only requirement is that the server can serve the built output from `client/` (or `client/dist/`).

## Phase 2: parallel tracks

Both backlogs are in priority order; the top three on each side are the demo's minimum.

**Frontend: game interface**

1. Pick the engine (Phaser or Pixi) and build setup; keep fixture mode working.
2. Desks from topology: one desk per agent `id`, grouped by `tab` into clusters and by `workspace` into rooms.
3. State animations: working = typing, idle = sitting, blocked = standing with a "!" bubble, done = hand raised, unknown = asleep with "?". Name and `title` above the head.
4. Proximity + E opens the interaction panel: last ~40 lines, a prompt box, quick keys (esc, enter, 1/2/3).
5. Fast paths: minimap, "jump to next blocked agent", click-to-walk.
6. Art pass: tileset, character sprites, room labels.
7. Stretch: live terminal in the panel via xterm.js.

**Backend: harness integration**

1. Replace polling with `events.subscribe` on the herdr socket (`pane_agent_status_changed`, `pane_created`, `pane_closed`).
2. Command endpoints from the contract: prompt, read, keys, focus, with an allowlist so the browser can't reach other herdr calls.
3. Scripted `FixtureSource`: a ~40-agent day with a blocked prompt at t = 20 s, the same shape as real data.
4. `$summary` from `pane report-metadata` added to the snapshot, so heads show what an agent is doing rather than its terminal title.
5. Tunnel script (cloudflared or ngrok) with the token gate for remote judges.
6. Install path: `herdr plugin install` from GitHub, keybinding snippet for `config.toml`.
7. Stretch: live terminal frames via `terminal session observe`, relayed over a WebSocket.
8. Timeboxed spike (2 h): headless herdr in Docker. Keep or kill.

## Milestones and gates

Each gate needs both lanes landed; nothing moves past a gate on one side alone. Gate 2 is where the metaphor passes or fails.

```
        Frontend · client/                     Backend · server/
 ┌───────────────────────────────┐     ┌───────────────────────────────┐
 │ Engine pick + protocol read   │     │ Walking skeleton              │
 │ Phaser or Pixi, build, fixture│     │ Plugin, server, SSE, fixture  │
 └───────────────┬───────────────┘     └───────────────┬───────────────┘
 ◆ Gate 0 · Skeleton runs from a fresh clone; client/ handed over
 ┌───────────────┴───────────────┐     ┌───────────────┴───────────────┐
 │ Desks + state animations      │     │ Push-fed state                │
 │ Desk per agent id, rooms      │     │ events.subscribe, no polling  │
 └───────────────┬───────────────┘     └───────────────┬───────────────┘
 ◆ Gate 1 · A real agent changes state and its sprite changes
 ┌───────────────┴───────────────┐     ┌───────────────┴───────────────┐
 │ Interaction panel             │     │ Command endpoints             │
 │ Proximity + E, lines, prompt  │     │ prompt/read/keys/focus        │
 └───────────────┬───────────────┘     └───────────────┬───────────────┘
 ◆ Gate 2 · Walk to an agent, prompt it, watch it start working   ◀ the real test
 ┌───────────────┴───────────────┐     ┌───────────────┴───────────────┐
 │ Fast paths                    │     │ Demo plumbing                 │
 │ Minimap, next blocked, click  │     │ 40-agent fixture day, tunnel  │
 └───────────────┬───────────────┘     └───────────────┬───────────────┘
 ◆ Gate 3 · Rehearsal: three working, one stuck, one done reads at a glance
```

We check in together at each gate. If Gate 1 or Gate 2 feels worse than herdr's sidebar, that's the real finding: we rethink the metaphor before building fast paths or doing art.

## Working agreements

- **Main always runs.** Short-lived branches, merge to `main` when your side still works against the other side's current `main`.
- **Fixture first.** Every client feature must work with `--source fixture`. Every new backend field shows up in the fixture the same day.
- **Protocol changes start as a PR to `PROTOCOL.md`** before either side writes code against them.
- **Truth over polish.** Nothing on screen is faked in herdr mode. Fixture mode is labeled as such in the HUD.
- **Security floor:** server binds `127.0.0.1`, every `/api/*` call is token-gated, the client never renders agent text as HTML.

## Open questions

- [ ] Does the demo need to reach remote judges (tunnel), or is it in the room on our laptop?
- [ ] May demo agents use our existing subscription logins, or do we need API keys?
- [ ] Phaser or Pixi? Frontend's call; decide before starting desks.
- [ ] Is the map generated from topology, or a hand-drawn office with desks assigned in order?
