# office-agency — handoff

**Status:** pre-ideation. Nothing built. This doc exists so a fresh session (human or
agent) can pick up the full thread without re-deriving it.

**Date:** 2026-10-24
**Repo:** `~/misc/office-agency` (initialized, one initial commit, no code)

---

## 1. The pitch

Gather.town, but for agents.

Engineers (and others) now supervise several dozen coding agents at once. The
sidebar/list view doesn't scale: states blur together, and the only interaction
is "jump to pane and read a terminal." The idea is to render the agent fleet as a
2D top-down office. Each agent is a person, animated by its lifecycle state
(working / idle / needs help / done). The user is a player who walks around and
talks to agents to give direction — Gather-style proximity interaction instead of
pane-jumping.

**Thesis (explicit, from the originator):** this is admittedly a toy and is being
built first as a demo. But Gather.town is also "a toy" that won on *interface
psychology* — presence turns a dashboard into a place, and places change how
people behave. The bet is that the same effect applies to agent supervision:
ambient legibility plus spatial proximity is a better mental model than a list of
terminals.

This is the thing to test, not assume. If it turns out to be true, the demo
becomes the wedge for a real product; if not, we learn that cheaply.

---

## 2. Base platform: herdr (verified, herdr 0.9.3 installed locally)

Herdr is a terminal workspace manager / runtime for coding agents: real PTYs in
panes, a TUI, a CLI, and a socket API. It already solves cross-harness support,
agent lifecycle detection, and inter-agent messaging. The plan is to build this
as a **herdr plugin** on top of that.

What was actually verified (herdr.dev docs @ 0.9.5 + local `herdr --help`,
`herdr api schema`):

- **Plugins are argv commands, not UI.** A plugin is a directory with
  `herdr-plugin.toml` plus commands Herdr launches. Explicitly: *"Runtime action
  registration and native non-terminal plugin UI are not part of plugin v1."*
  → a 2D canvas **cannot** be a herdr pane. It must be a web app served over
  HTTP and opened in a browser. This is architectural, not a preference.
- **Manifest surface:** `[[build]]`, `[[startup]]`, `[[actions]]` (with
  `contexts`), `[[events]]` (`on = "..."`), `[[panes]]` (placement `overlay` |
  `popup` | `split` | `tab` | `zoomed`; terminal panes only), `[[link_handlers]]`.
- **Startup hooks are one-shot, not supervised daemons.** Panes must stop
  detached children before exiting. → the web server belongs in a `[[panes]]`
  entrypoint (lifetime = pane, logs visible) or a pidfile-managed action, *not* a
  startup hook.
- **Runtime env injected:** `HERDR_BIN_PATH`, `HERDR_SOCKET_PATH`, `HERDR_ENV=1`,
  `HERDR_PLUGIN_ID`, `HERDR_PLUGIN_ROOT`, `HERDR_PLUGIN_CONFIG_DIR`,
  `HERDR_PLUGIN_STATE_DIR`, `HERDR_PLUGIN_CONTEXT_JSON`, plus
  `HERDR_WORKSPACE_ID` / `HERDR_TAB_ID` / `HERDR_PANE_ID` when available.
- **No storage API in v1.** Plugin owns its files (`STATE_DIR`).
- **Distribution:** GitHub repo + `herdr-plugin` topic → auto-indexed marketplace;
  install with `herdr plugin install owner/repo[/subdir]`; local dev with
  `herdr plugin link <path>`. Keybindings are declared in the user's
  `config.toml` (`type = "plugin_action"`).
- **Socket API has a real event stream.** `herdr api schema` exposes
  `event` / `subscription_event` schemas, `EventsSubscribeParams {subscriptions}`
  and `EventsWaitParams`. `EventKind` includes `pane_agent_status_changed`,
  `pane_agent_detected`, `pane_created`, `pane_closed`, `pane_output_changed`,
  `pane_focused`, `workspace_*`, `layout_updated`. `AgentStatus` is
  `idle | working | blocked | done | unknown`. → **realtime is push-fed, not
  polled.** The browser view is one relay away from real truth.
- **Control primitives:** `agent list | get | read | send-keys | prompt | rename |
  focus | wait | attach | start | explain`. `agent prompt --wait` submits text +
  Enter and waits on lifecycle state; `agent prompt` refuses a `blocked` agent
  (`agent_blocked`); `agent send-keys` is the deliberate way to answer approval
  dialogs. `agent read --source recent-unwrapped --lines N` walks alternate-screen
  history for idle full-screen agents (Claude Code, OpenCode).
- **Live terminal bytes:** `herdr terminal session observe <target>` emits
  newline-delimited JSON `terminal.frame` records (base64 ANSI, read-only,
  multi-observer); `... session control` is the writable variant. This is the
  lever for showing the *actual* terminal inside the 2D UI.
- **Topology is already spatial:** workspace → tab → pane, IDs `w1`, `w1:t1`,
  `w1:p1`. Agent names match `[a-z][a-z0-9_-]{0,31}` and are unique per live set.
- **Metadata for display:** `pane report-metadata --token summary=...` gives a
  display-only `$summary` per pane; `report-agent --state` sets semantic state.
  Useful for showing "what is this agent currently doing" above its head.
- **Persistence / remote:** agents live in a background server; `herdr server`
  runs headless; `herdr --remote <ssh>` and saved SSH machines attach from
  elsewhere; named sessions exist.

**Unverified / must check early:**

- `herdr agent list --json` failed locally with a usage error → confirm the actual
  JSON output path (`herdr api snapshot`, or the socket method directly).
- Whether a headless `herdr server` inside a container can open plugin panes with
  no client attached (the docker/hybrid path hinged on this).
- Exact subscription payload shape and whether `pane_output_changed` is throttled
  enough to relay directly to a browser.

---

## 3. Deployment analysis (already done; don't redo it)

The originator proposed three options: (A) localhost as a herdr plugin, (B) cloud,
(C) hybrid — plugin plus a docker image of herdr+plugin.

Core finding: **A and B are not two deployments of one product. They're two
different products.**

- A = "the office for *your* agents on *your* machine": your subscriptions, repos,
  credentials, PTYs. This is the only version that works on day 2 of real use.
- B = "a cloud agent workspace drawn as an office": needs a box running headless
  herdr, agent CLIs authenticated with **API keys** (OAuth device flows kill
  demos), token budget, per-user sandboxing, auth. That's a different company.

Missing fourth option: **D — local engine + tunnel.** Same plugin, same real
agents, plus `cloudflared`/ngrok in front of the localhost server, token-gated.
Judges get a public link; agents remain real and free; zero new infra. Cost: wifi
and laptop sleep.

**Verdict:** build A. Design the seam for C. Demo with D. Treat B as an optional
fixture-mode shell, clearly labeled, not a real target.

| Option | What it really is | Hackathon value | Real-product value |
|---|---|---|---|
| A localhost plugin | the product | low alone (judges must install herdr) | high |
| B cloud | a different product | high if it demos, high risk | low for now |
| C hybrid docker | A's code, B's packaging | medium | medium ("office that never sleeps") |
| D local + tunnel | A, demoed | high | n/a (demo scaffolding) |

Still open: whether the demo must be reachable by remote judges, whether demo
agents may use existing subscription logins, and whether multiplayer human
presence is in scope.

---

## 4. Architecture sketch

```
browser (canvas app)  ──WS──▶  plugin server (bun/node)  ──socket/CLI──▶  herdr
   Phaser/Pixi                  token-gated proxy            events.subscribe
   map, avatars                 AgentSource adapter          agent.* methods
   proximity UI
```

**The seam that makes every deployment cheap — one interface, two impls:**

```ts
interface AgentSource {
  subscribe(cb): void      // herdr: events.subscribe relay → WS; fixture: scripted timer
  list(): Agent[]          // herdr: agent/pane list
  prompt(agent, text)      // herdr: agent prompt
  read(agent, lines)       // herdr: agent read --source recent-unwrapped
  keys(agent, keys)        // herdr: agent send-keys (approval dialogs)
}
```

- `HerdrSource` — real.
- `FixtureSource` — scripted ~40-agent day with a blocked prompt at t=20s. Drives
  the same state machine and rendering path. Becomes the no-install demo, the test
  harness, and the "try it at the booth" page. Legitimate as long as it's labeled
  and shares the renderer.

**Map = herdr topology.** workspace → room, tab → wing, pane/agent → desk.
Hand-authored Tiled JSON or ASCII tilemap. No map editor.

**Animation = state mapping** (this is 80% of the demo's legibility):
`working` typing at desk · `idle` sitting / coffee · `blocked` standing + "!"
bubble · `done` hand raised · `unknown` asleep with "?". Name + `$summary` above
the head.

**Interaction = proximity + E.** Panel shows last ~40 lines
(`agent read`), a prompt box (`agent prompt`), quick keys (`esc`, `enter`, 1/2/3)
for blocked dialogs. Stretch: `terminal session observe` → xterm.js for the
"it's a real terminal" beat.

**Fast path, non-negotiable:** minimap, "jump to next agent needing help", and
click-to-walk. Keybinding action opens the office focused on the current pane.

**Security:** bind `127.0.0.1`, write `{url, token}` to
`HERDR_PLUGIN_STATE_DIR/office.json`, open `http://127.0.0.1:PORT/?t=…`. The
browser never touches the herdr socket; the server proxy is allowlisted. XSS in
the canvas must not equal arbitrary terminal control.

---

## 5. Design principles / anti-goals

1. **Ambient awareness + in-place interaction, not navigation.** 2D walking is
   slower than a list. Never require walking to something urgent.
2. **Truth over polish.** Every agent's state comes from herdr; have the
   "terminal behind the curtain" beat ready to prove it isn't a mock.
3. **Small map, big legibility.** 12–20 desks on one screen. Don't build a map
   editor, multiplayer, voice, or auth in the MVP.
4. **The state animation is the product.** If a screenshot doesn't communicate
   "three working, one stuck, one done," the metaphor has failed.

Anti-goals for MVP: mapmaker, spatial audio/video, avatars for humans beyond
maybe one, agent "personalities" as a core feature, cloud multi-tenancy.

Explicitly unresolved: whether 2D beats a well-designed list for *triage*. The
honest pitch is "it beats a list for *ambient awareness* and *interaction*"; if
the demo can't show that in 30 seconds, rethink.

---

## 6. Risks

1. **Potemkin risk.** 2D offices are easy to fake and judges know it. Always show
   the real pane.
2. **Cloud path eats the build.** Agent auth, PTYs in containers, cold start,
   cost, auth, sandboxing — each a half-day. Timebox any docker spike to 2h.
3. **Headless plugin panes in a container are unverified.** Spike before
   believing the hybrid story.
4. **Metaphor tax.** Power users may triage faster in the sidebar. Mitigate with
   minimap / next-blocked / click-to-walk.
5. **Demo choreography is code.** Pre-seed agents mid-work; rehearse the
   blocked-agent interaction; have a recording as fallback.

---

## 7. Open ideation threads (next round)

These are the questions this repo is meant to answer next:

1. **Interface psychology.** What *specifically* makes Gather feel like a place —
   and which of those levers are available for agents? (proximity permission,
   ambient state, "walking over" as intent, embodiment, shared space, ritual.)
   Which are impossible without video/audio?
2. **The 30-second screenshot test.** What exactly must be visible for the
   metaphor to land? What's the one frame that sells it?
3. **The wedge.** Onboarding/hiring demo? Ambient triage for 40 agents? Debugging
   multi-agent runs? Teaching non-engineers what agents do? Each implies a
   different product.
4. **Space semantics.** Is the map herdr's topology (honest, auto-generated) or a
   curated office (expressive, fictional)? What happens at 60 agents — floors?
   A "hot" wing? Building out as you grow?
5. **Agent identity.** Do agents get names, faces, persistent desks, roles? Does a
   "desk" outlive a session? Does moving desks mean anything?
6. **Interaction verb.** "Talk" = prompt box? terminal? voice? Is there a
   non-text interaction that only works spatially (gathering agents in a room,
   standing next to two agents to compare them, leaving a note on a desk)?
7. **Multiplayer.** Is another human walking around a feature or a distraction?
   (Biggest scope fork after deployment.)
8. **Failure modes.** What does the office look like when everything is on fire?
   When nothing is running? When an agent is wedged in `unknown`?

---

## 8. Proposed split

Four tracks, one critical path. Suggested owner split assumes two people; a solo
builder does T1 → T2 → T3 and skips T4's docker half.

**T1 — Product & interface design (the ideation track)**
Answer §7, especially 1–4. Outputs: a one-page metaphor spec, the 30-second
frame, an interaction script (walk → talk → answer → resume), and a paper map.
No code. This track decides what T2/T3 build.

**T2 — Runtime bridge (herdr plugin + server)**
`herdr-plugin.toml` (pane entrypoint serving the app), `AgentSource` interface,
`HerdrSource` over the socket (`events.subscribe` → WS, `agent.*` → allowlisted
proxy), token + port + pidfile handling in `STATE_DIR`, keybinding action to open
the office. Deliverable: a WS feed of real agent state and a working prompt round
trip.

**T3 — Client (the office itself)**
Map loader, avatar rendering, state→animation mapping, camera, proximity
detection, interaction panel, minimap / next-blocked / click-to-walk. Consumes
`AgentSource` over WS; must run against `FixtureSource` from day one so it isn't
blocked on T2.

**T4 — Demo & distribution**
`FixtureSource` + scripted demo day, tunnel script, install path
(`herdr plugin install`), a 2-hour docker/headless spike (keep or kill),
recording + demo runbook.

**First 24h, in order (each is a gate):**

1. `herdr api schema` → subscribe to `pane_agent_status_changed` from a throwaway
   node script and print states. *(Gate: realtime state in <2h?)*
2. Minimal `herdr-plugin.toml` + pane entrypoint serving a static page that lists
   live agents as colored dots. *(Gate: plugin lifecycle + browser path works?)*
3. Canvas with 20 dots moving around; hardcode state colors from the feed.
   *(Gate: does the spatial view already feel better than the list?)*
4. Proximity + prompt round trip on one agent. *(Gate: is "walk over and talk"
   actually pleasant?)*

If gate 3 or 4 fails, that's the real finding — pivot the metaphor before
polishing anything.

**Explicitly deferred:** docker/cloud (T4 spike only), multiplayer, voice,
map editor, auth, persistence beyond `STATE_DIR`.

---

## 9. Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-10-24 | Build as a herdr plugin; UI served over localhost HTTP, opened in a browser | Plugin v1 has no native non-terminal UI; browser is the only path to a 2D canvas |
| 2026-10-24 | Target local-first (A), demo via tunnel (D), design the seam for docker (C) | Local is the real product; cloud is a different product with auth/cost/sandboxing cost |
| 2026-10-24 | Single `AgentSource` seam with `HerdrSource` + `FixtureSource` | Keeps demo mode honest (same renderer) and unblocks client work from runtime work |
| 2026-10-24 | Map derives from herdr topology (workspace→room, pane→desk) | Free, honest, and auto-updates as agents are added/removed |
| 2026-10-24 | MVP is single-player | Multiplayer presence is the biggest scope fork; defer until the metaphor is validated |
