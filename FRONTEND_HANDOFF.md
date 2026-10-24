# Frontend handoff: start here, Max

You own `client/`: everything the player sees. Justin owns `server/` and the herdr plugin. The two sides only meet at [`PROTOCOL.md`](PROTOCOL.md), a stream of JSON describing every agent.

You never need herdr installed. The server has a **fixture mode** that sends fake but realistic agents, and everything you build should work against it.

Read in this order: this file → [`PROTOCOL.md`](PROTOCOL.md) → [`PRD.md`](PRD.md) (who builds what, milestones). [`HANDOFF.md`](HANDOFF.md) is deep background; skim it once.

---

## 1. Run it (5 minutes)

You need Node 20 or newer (`node --version`) and git.

```bash
git clone git@github.com:JTP75/office-agency.git
cd office-agency
node server/index.mjs --source fixture
```

A browser tab opens (if not, copy the URL the terminal prints). Walk with WASD or the arrow keys. The box in the top-left says `fixture · 13 agents` with colored dots that change every few seconds. That's the live data feed. Stop the server with `Ctrl+C`.

What's in `client/` today is a throwaway: one HTML file and one JS file drawing colored squares on a canvas. It exists only to prove the pipe works. Replace any or all of it.

---

## 2. What we're building

Gather.town, but the people at the desks are coding agents. One person supervises dozens of them. Instead of scanning a list of terminals, they look at an office and *see* who's working, who's stuck, and who's done, then walk over to talk to one.

**The test for everything you build:** if a screenshot doesn't say "three working, one stuck, one done" in a glance, the metaphor has failed. Legibility beats polish.

## 3. The office model (decided)

| Real thing | In the office | From the data |
| --- | --- | --- |
| Project (a git repo) | **A building** | `project` |
| Main checkout of the repo | **The lobby**, an open-plan floor | `lobby: true` |
| Worktree (a branch checked out in its own folder) | **A room**, with the branch name as plain text on the door sign | `worktree` |
| Agent session | **A person at a desk** | `id` (one desk per id) |
| Which harness (Claude, Codex, …) | Character look | `kind` |
| What it's doing | Name tag above the head | `title` |
| Lifecycle state | Animation | `status` |

### Rooms must expand

Many agents can share one worktree (e.g. several read-only agents researching while one edits). The fixture's `fix/auth` room has 6. So **don't hand-draw rooms with a fixed number of desks.** Generate the floor plan from the data: a room's size comes from how many agents are in it, and it grows (more desk rows) as agents arrive. The lobby works the same way.

Agents should keep their desk while their session lives. Don't reshuffle everyone when one agent arrives or leaves: people build "the auth guy sits there" memory, and reshuffling breaks it.

### Animations

| `status` | Animation | Why |
| --- | --- | --- |
| `working` | Typing at the keyboard | Busy, leave it alone |
| `blocked` | Crying, with a "!" bubble | Needs your input. Must be findable from across the map |
| `done` | Raising a hand / waving | Finished, and you haven't looked yet. Come check |
| `idle` | Sleeping at the desk | Nothing to see |
| `unknown` | Greyed out with a "?" | herdr can't tell; don't pretend |

`blocked` matters most. That's the one the user has to act on, so make it the loudest thing on screen.

### Multiple projects

One building on screen at a time, with a **building switcher** (tabs or a dropdown) rather than a street to walk down. Rule from the PRD: never make the user walk to something urgent. A small badge on each building's tab showing how many agents are blocked inside is a good early win.

### Not decided yet (your input welcome)

- Worktrees are text-only signs for now. Ideas for making them richer are welcome later.
- Room = worktree is decided; whether a role (planner, reviewer) shows up as a desk prop is open.
- How big the map gets at 40+ agents (scrolling floor? second floor?).

---

## 4. Your first milestones

Each step should leave something you can run and see. Order matters; don't skip ahead to art.

1. **Pick an engine and set up a build.** Recommendation: **[Phaser](https://phaser.io)** with **[Vite](https://vite.dev)**. Phaser has tilemaps, sprite animation, cameras and collision built in, and AI coding tools know it very well. Pixi is the alternative if you want more control. Your call, but decide before step 3. *Done when:* the walkable map from today runs inside your new setup.
2. **Group the data.** Turn the agent list into buildings → lobby + rooms → agents. *Done when:* switching buildings shows the right rooms with the right number of agents, as plain boxes.
3. **Generated floor plan.** Rooms sized by agent count, door signs with the branch name, stable desks. *Done when:* an agent appearing in `fix/auth` grows that room without moving anyone else.
4. **State animations.** Even crude ones (a color + an emoji bubble) first, real sprites later. *Done when:* someone who has never seen it can point at the stuck agent in 3 seconds. **This is Gate 1 in the PRD; show Justin.**
5. **Proximity.** Walk near an agent, press E, a panel opens with its name and status. The panel's contents (terminal lines, prompt box) come once the backend has the command endpoints.

Free art that's safe to use: [Kenney](https://kenney.nl/assets) (CC0, no attribution needed). Check the license on anything else before committing it.

### Using Vite with the server

During development, run the server and Vite side by side; Vite forwards `/api` to the server (already set up in `client/vite.config.ts`):

```bash
# terminal 1: data server with a fixed dev token (add --scenario empty|crowded|churn to test edge cases)
OFFICE_TOKEN=dev node server/index.mjs --source fixture --no-open

# terminal 2: your client
cd client && npm run dev
```

Open `http://localhost:5173/?t=dev`. The data server always uses port 4567 in dev. If that port is busy, it exits with a clear error instead of silently moving, so the Vite proxy never points at nothing.

The server only serves the **built** client (`client/dist/`, from `npm run build`); without a build it shows a "not built yet" page. `herdr plugin install` builds it automatically, so keep `npm run build` passing on `main`.

---

## 5. Vibe coding: how to work with an AI coding agent

You'll write most of this by describing what you want to an AI coding agent (Claude Code, Cursor, Codex, etc.). These habits matter more than which tool you use.

**Give it context before asking for code.** Start each new session by having it read the docs. A good opener:

> Read FRONTEND_HANDOFF.md and PROTOCOL.md. I own only the `client/` folder; don't edit anything outside it. Today I want to [one specific goal]. Before writing code, tell me your plan in a few bullets.

**One small step at a time.** "Add a building switcher" is a good request. "Build the whole office" is not. After each step, **run it and look at the browser** yourself. The agent can't see your screen, and "it compiles" is not "it works."

**Ask for the plan first** on anything bigger than a small tweak. Plans are cheap to change; code is not.

**Commit whenever something works.** Git is your undo button. When an agent goes off the rails, you can throw its changes away and get back to the last good state:

```bash
git add -A && git commit -m "rooms grow with agent count"   # save a working state
git diff                                                       # see what changed since the last save
git restore .                                                  # throw away all changes since the last save
```

Work on a branch (`git switch -c max/rooms`) and merge to `main` when it works. `main` must always run.

**When something breaks, give it the evidence.** Paste the exact error from the terminal or from the browser's console (right-click → Inspect → Console). Describe what you see versus what you expected. A screenshot helps. "It doesn't work" gets a guess back.

**Watch for these.**
- It edits files outside `client/`. Say no, or ask Justin.
- It invents data fields that aren't in `PROTOCOL.md`. If you need a new field, ask Justin; it's a quick change on his side.
- It says something is done without you having run it. Verify.
- It keeps "fixing" the same bug in circles. Stop, `git restore .`, and describe the problem fresh in a new session.

**Don't be afraid to ask it to explain.** "Explain what this file does like I'm new to this" is a perfectly good prompt, and the fastest way to learn the codebase.

---

## 6. Ground rules

- **You own `client/`.** Edit freely. For `server/`, ask Justin.
- **Fixture first.** Everything works with `--source fixture`. If the fixture is missing a case you need (an empty project, 40 agents in one room), ask Justin to add it.
- **Protocol changes go through `PROTOCOL.md`.** Need a field? Ask; don't fake it on the client.
- **Never put agent text into the page as HTML** (no `innerHTML` with `title`). Agent titles come from terminals and could contain anything. Use `textContent` or draw it on the canvas.
- **Truth over polish.** In herdr mode, nothing on screen is invented.
