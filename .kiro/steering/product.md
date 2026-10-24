# Product

## What it is

Office Agency is a herdr plugin that renders your fleet of coding agents as a 2D
top-down office you can walk around. Projects are buildings, worktrees are rooms,
and every agent session is a person at a desk, animated by its herdr lifecycle
state. The user is a player who walks over to an agent to talk to it, instead of
jumping between terminal panes.

It runs as a herdr plugin: an action starts a small background server and opens
the office in the browser (plugin v1 has no native non-terminal UI, so a 2D
canvas must be a web app served over HTTP). The server listens on `127.0.0.1`
only, with a per-run token in the URL.

## Who it is for

Engineers (and others) who supervise several dozen coding agents at once, where a
sidebar or list view stops scaling: states blur together and the only interaction
is "jump to a pane and read a terminal."

## Core experience

- Walk the office with WASD / arrow keys, stopping at walls and desks.
- See at a glance who is working, who is stuck, and who is done, from agent state
  animations:
  - `working` — typing at the keyboard (busy, leave it alone)
  - `blocked` — crying with a "!" bubble (needs input; the loudest thing on screen)
  - `done` — raising a hand / waving (finished, come check)
  - `idle` — sleeping at the desk (nothing to see)
  - `unknown` — greyed out with a "?" (herdr can't tell; don't pretend)
- Walk up to an agent and press **E**, click it, or press **B** for the next
  blocked one to open a drawer with that agent's live terminal; type straight into
  its TUI. **Ctrl+]** or a click on the office goes back to walking; **Esc** closes
  the drawer. The drawer's **Ghostty ↗** button opens the agent in a native
  terminal instead.
- The office model maps real things to places:
  - Project (git repo) → a building (`project`)
  - Main checkout → the lobby, an open-plan floor (`lobby: true`)
  - Worktree (branch in its own folder) → a room, branch name on the door sign
    (`worktree`)
  - Agent session → a person at a desk, one desk per `id`
  - Harness (Claude, Codex, …) → character look (`kind`)
  - What it's doing → name tag above the head (`title`)
  - Lifecycle state → animation (`status`)
- One building on screen at a time, with a building switcher rather than a street
  to walk down; never make the user walk to something urgent.
- Fast paths: minimap, "jump to next blocked agent," click-to-walk.

## Goals

- Ambient legibility: the central bet is that a screenshot must say "three
  working, one stuck, one done" at a glance. If it can't, the metaphor has failed.
- Ambient awareness and in-place interaction, not navigation: walking is slower
  than a list, so never require walking to something urgent.
- Truth over polish: in herdr mode, nothing on screen is faked; the live terminal
  is the "it's a real terminal" proof.
- Local-first: the office for *your* agents on *your* machine — your
  subscriptions, repos, credentials, PTYs.

## Non-goals (MVP anti-goals)

- No map editor / mapmaker.
- No multiplayer, spatial audio, or video.
- No auth beyond the token gate; no persistence beyond the plugin state dir.
- No cloud multi-tenancy; a cloud deployment is treated as a different product,
  acceptable only as a clearly labeled fixture-mode shell.
- Agent "personalities" are not a core feature.

## Hackathon / demo constraints

- Early hackathon build; the thesis (spatial presence beats a list for ambient
  awareness and interaction) is the thing to test, not assume.
- Deployment strategy: build local-first (A), demo via a token-gated tunnel (D),
  design the seam for a docker/hybrid packaging (C). Treat cloud (B) as optional.
- Demo choreography is code: pre-seed agents mid-work, rehearse the blocked-agent
  interaction, keep a recording as fallback.
- Fixture mode exists so the demo and client never depend on a live herdr, and it
  is labeled as "fixture" in the HUD so a demo is never mistaken for real data.
- Gate 2 (walk to an agent, prompt it, watch it start working) is the real test;
  if Gate 1 or Gate 2 feels worse than herdr's sidebar, the metaphor is rethought
  before building fast paths or doing art.

## Requirements (to run)

- herdr 0.9.3 or newer
- Node 20 or newer and npm on herdr's `PATH` (install builds the client)
- macOS or Linux
