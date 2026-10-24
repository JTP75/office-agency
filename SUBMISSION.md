# Hackachusetts submission: Office Agency

Copy-paste source for the submission form. `[TODO]` marks things only you can fill in, or things that wait on the Kiro session (`feat/kiro`).

---

## Project name

Office Agency

## Tagline (one line)

Your AI coding agents, as coworkers in a pixel-art office you can walk around: spatial calm for the age of agent multitasking.

## Challenge track

**Healthcare & Biotech** (mental health and cognitive well-being)

## Team

| Name | Role |
| --- | --- |
| Justin Pacella | Backend, herdr integration, live terminals, product |
| Max [TODO: last name] | Frontend: game client, office rendering (bootstrapped with Kiro) |

[TODO: add the team members' emails/handles if the form asks for them; max 4 members]

---

## The problem

Developers now run half a dozen AI coding agents at once: one fixing a bug, one writing tests, one exploring a refactor in another worktree. Every one of them lives in a near-identical terminal tab. Keeping track of them means constant context switching: cycling through tabs, rereading scrollback to remember what each one was doing, and checking anxiously whether anything is stuck waiting on you.

This is a cognitive-load problem, not a tooling one. The research on task switching is consistent: every switch costs attention, leaves "attention residue" from the previous task, and raises stress. Holding six parallel workstreams in working memory, with no visual structure to lean on, is neither healthy nor efficient. We started calling it *multitasking psychosis*: you're always half-present in every session and fully present in none. As agents get cheaper, the number of sessions per person only goes up.

## Our approach: spatial separation of concerns

People are very good at remembering *places*. We navigate offices, kitchens and cities without effort, and spatial memory is one of the most durable kinds of memory we have (it's the basis of the "memory palace" technique). Office Agency moves the mental bookkeeping of a multi-agent workflow out of working memory and into space:

- **Each project is a building** on a street.
- **Each git worktree is its own room** inside that building, so separate concerns are separate physical spaces.
- **Each agent is a person at a desk**, and their body language shows their state at a glance:
  - **working:** typing
  - **blocked / needs you:** crying, with a red "!" and a glow you can spot across the room
  - **done:** waving, with a blue ✓
  - **idle:** asleep at the desk
- From the street, the roof of each building summarises who's inside, with a pulsing badge if anyone is blocked.

Instead of asking "which tab was that, and what was it doing?", you walk to the room where that work lives. The office answers "does anything need me?" before you ask it. Then you can engage with one agent at a time, fully, and walk away.

## Value proposition

**Office Agency turns a wall of identical terminal tabs into a calm, spatial workplace. You always know where each piece of work lives and who needs you, so you can run many agents without carrying them all in your head.**

- **Less cognitive load:** state is visible at a glance, so you stop polling sessions.
- **Fewer, cheaper context switches:** a room per worktree keeps concerns physically apart; you go to the work instead of juggling it.
- **Attention where it's needed:** blocked agents are the loudest thing on screen, and **B** jumps straight to the next one.
- **A healthier rhythm:** focus on one conversation, close it, walk on. It's a deliberate, single-tasking interaction model layered on top of parallel agents.

## Who benefits, and how it scales

- **Developers running multiple AI agents.** That's a fast-growing group as agent tooling becomes the default way to write software.
- **People who struggle most with context switching,** including those with ADHD or anxiety. For them, an always-visible, spatial overview replaces the working-memory juggling that's hardest for them.
- **Teams:** the same office metaphor extends naturally to a shared floor where everyone's agents are visible. Attention can go where it's needed without anyone pinging around for status.

Scaling beyond the hackathon:
- The client is agent-agnostic. It works with Claude Code, Codex, OpenCode and any other agent herdr supports, with no per-agent code.
- It's a lightweight, zero-dependency local server, installed with one command.
- Remote machines over SSH are in progress.
- Natural next steps: wellbeing signals (time-in-session, break nudges when you've been context-switching heavily) and shared team offices.

## Accessibility and design considerations

- State is never shown by colour alone. Each status also has its own animation and symbol (! ✓ z ?), so it's readable with colour-vision deficiency.
- Fully keyboard-driven: WASD/arrows to walk, **E** to talk, **B** for the next blocked agent, **Esc** to close. Click works too.
- Runs locally in any browser. Nothing leaves your machine, and the server listens on localhost with a per-run token.
- Free and open source.

---

## Description (features and functionality)

Office Agency is a plugin for [herdr](https://herdr.dev), a terminal workspace manager for AI coding agents. It renders your whole agent fleet as a top-down, pixel-art office in the browser.

**The world**
- A street with one building per project. Roof dots show each agent's status, and a pulsing badge shows blocked agents.
- Inside, a lobby for agents on the main checkout, plus one room per git worktree. Rooms grow as agents are added, with desks in varied layouts (rows, islands, wall desks, face-to-face pods). Each agent keeps its seat for as long as its session lives.
- Animated agents that face their desks. Status-driven animations: typing, crying, waving, sleeping.

**Talking to agents**
- Walk up and press **E**, click an agent, or press **B** for the next blocked one. A drawer slides open with that agent's **live terminal**, and you type straight into its real TUI (Claude Code, Codex, OpenCode…).
- **Ctrl+]** or a click on the office returns you to walking; **Esc** closes the drawer. Opened with E, it closes when you walk away.
- A **Ghostty ↗** link-out opens the agent in a native terminal (also Kitty or Terminal.app).
- Opening an agent clears its "done" check, so the office tracks what you've actually seen.

**Managing work from the office**
- Create a new agent at an empty desk, or create a new worktree (a new room) and start an agent in it, without leaving the office.

**How it works**
- A zero-dependency Node server subscribes to herdr's socket API (push events, no polling) and streams agent state to the browser over Server-Sent Events.
- Live terminals use herdr's terminal session protocol: ANSI frames stream to xterm.js in the browser, and keystrokes go back.
- Client: TypeScript, Pixi.js v8 (rendering), React (HUD and drawer), zustand (state), xterm.js. Art is from Kenney's CC0 asset packs.
- A fixture mode with fake agents runs the whole experience without herdr.

---

## Testing instructions (for judges)

**Without herdr (quickest):**

```bash
git clone https://github.com/JTP75/office-agency.git && cd office-agency
npm run demo
```

This builds the client if needed, starts a crowded office of simulated agents and opens your browser. The fixture scenarios are `empty`, `crowded` and `churn`. The fake agents change state on their own, and their terminals accept input.

**Controls:** WASD/arrows to walk, walk into a door to enter, **E** next to a desk (or click an agent) to open its terminal, **B** for the next blocked agent, **Ctrl+]** to stop typing, **Esc** to close.

**With herdr (the real thing):** requires herdr 0.9.3+, Node 20+, macOS or Linux.

```bash
herdr plugin install JTP75/office-agency
herdr plugin action invoke office-agency.open
```

## Links

- GitHub (public): https://github.com/JTP75/office-agency
- Video: [TODO: YouTube/Vimeo link, public]
- Live demo: none; run `npm run demo` locally (no herdr needed)

---

## How we used Kiro

[DRAFT: finalise once `kiro-scout` reports back. Keep it accurate to what Kiro actually did.]

**Tools:** Kiro IDE [TODO: + Kiro CLI, if the feat/kiro session gets it working].

**Spec-driven development.** We wrote the product requirements and a detailed frontend bootstrapping plan before writing any client code. [Max] then gave that plan to Kiro as a spec, and Kiro implemented the initial frontend from it: the Vite + TypeScript + Pixi.js project, the scene structure (street and interiors), the SSE client and state store, and the first rendering of buildings, rooms and agents. The spec defined the data protocol (`PROTOCOL.md`) and the visual contract up front. That meant the frontend (Kiro) and the backend (built in parallel) could be developed independently and still integrate on the first try. That contract-first workflow is the main thing the spec approach gave us over vibe coding: two halves of the system built at the same time against one written agreement, rather than one prompt at a time.

**Steering docs.** [TODO from feat/kiro: product/tech/structure steering generated from our PRD and protocol docs, and what difference they made.]

**Specs in the repo.** [TODO from feat/kiro: `.kiro/specs/<name>/` (requirements → design → tasks) for the one-command judge demo, implemented by Kiro task by task.]

**Agent hooks.** [TODO from feat/kiro: e.g. run the server test suite automatically when server files are saved.]

**MCP / powers / property-based testing.** [TODO: include only what we actually used.]

**What we'd do next with Kiro.** [TODO, optional]

---

## Demo video plan (under 3 minutes)

Record it with fixture mode, or a real herdr session with a few agents running. Use royalty-free music or none, and show no third-party logos beyond the tools themselves.

| Time | Shot | Voiceover |
| --- | --- | --- |
| 0:00–0:25 | A grid of six terminal tabs, flicking between them | "This is what working with AI agents looks like now. Six sessions, all identical, and you're holding all of them in your head." |
| 0:25–0:45 | Press the key; the office opens on the street | "Office Agency turns that into a place. Every project is a building." |
| 0:45–1:15 | Walk into a building: lobby, worktree rooms, agents typing, sleeping, waving | "Every worktree is its own room, every agent a coworker at a desk. You can see who's working, who's done, and who needs you." |
| 1:15–1:45 | A blocked agent crying; press **B**, the drawer opens, answer its prompt in the live TUI | "When an agent is stuck, it's the loudest thing in the room. One key takes you there, and you talk to its real terminal." |
| 1:45–2:10 | Walk away and the drawer closes; the ✓ clears; create a new worktree room | "Deal with one thing, then walk on. Spinning up new work is just a new room." |
| 2:10–2:40 | Brief: the spec and steering docs in Kiro, `.kiro/` in the repo | "We built it spec-first with Kiro…" [fill from the Kiro write-up] |
| 2:40–2:55 | Pull back to the street with the roof badges | "Less juggling, more focus. Spatial calm for the age of agent multitasking." |

---

## Submission checklist

- [ ] Team members added (max 4)
- [ ] Track: Healthcare & Biotech
- [ ] Description (above)
- [ ] Video under 3 minutes, public, link added
- [ ] Public GitHub repo with build and run instructions (README)
- [ ] **`.kiro/` folder committed at the repo root** (from `feat/kiro`; must not be gitignored)
- [ ] "How we used Kiro" write-up finalised
- [ ] Testing instructions (fixture mode works without herdr)
- [ ] No copyrighted music; Kenney art is CC0

---

## Form answers

### How did you use Kiro to build your project?

We used Kiro in two places, both spec-first: the Kiro IDE to build the frontend, and the Kiro CLI to add the judge-facing demo and to set up steering and hooks for the repo.

**Spec-driven frontend (Kiro IDE).** Office Agency has two halves: a Node server that talks to herdr's socket API, and a Pixi.js game client that renders the office. We built them in parallel, and specs made that work. Before writing any client code we wrote a product requirements doc, a wire protocol (`PROTOCOL.md`: the exact shape of the agent snapshot and the SSE event stream) and a frontend plan. The plan covered the scene structure (street, building interiors), how projects map to buildings, worktrees to rooms and agents to desks, and what each status should look like. My teammate gave that plan to Kiro as a spec, and Kiro implemented the initial client from it: the Vite + TypeScript + Pixi.js project, the street and interior scenes, the SSE client and zustand store, and the first rendering of buildings, rooms and animated agents. While that was being built, the backend was developed against the same protocol. Because the spec pinned down the contract, the Kiro-built frontend and the separately built backend connected on the first try. Compared with vibe coding, the biggest gain was being able to split the work: one written agreement let two people (and their agents) build both halves at once without stepping on each other.

**Kiro CLI, headless.** For the rest of the work we installed Kiro CLI 2.34.0 and drove it non-interactively (`kiro-cli chat --no-interactive --trust-all-tools`, Claude Sonnet 4.5) from another coding agent running in its own git worktree. That made Kiro one of the parallel workers in our fleet, visible in Office Agency itself as a person at a desk in the `feat/kiro` room. The full log of what Kiro did versus what was done by hand is in `.kiro/KIRO_USAGE.md`.

**Steering docs (Kiro CLI).** We had Kiro generate steering files in `.kiro/steering/` (`product.md`, `tech.md`, `structure.md`) from our PRD and protocol docs. They capture the product rules (projects are buildings, worktrees are rooms), the tech constraints (a zero-dependency server, Pixi.js v8, the fixture source for testing without herdr) and where code lives. Every later Kiro request starts with that context, so it doesn't propose things that break the architecture, such as adding server dependencies or changing the protocol.

**A second spec, implemented task by task (Kiro CLI).** Judges won't have herdr installed, so we used Kiro's spec mode to create `.kiro/specs/one-command-demo/` for a one-command demo. `requirements.md` covers a single `npm run demo`, an automatic client build on a fresh clone, fixture mode with a crowded office, opening the browser, and no new server dependencies. Kiro wrote `design.md` (reuse the existing `server/index.mjs` fixture source and `server/browser.mjs` launcher rather than adding new code paths) and an 8-step `tasks.md`, then implemented it: `scripts/demo.mjs`, the `demo` script in `package.json`, and a "Try it without herdr" section in the README.

**Agent hooks.** Kiro added a hook (`.kiro/hooks/run-server-tests.json`) that runs the server test suite (`node --test server/test/`) whenever a file under `server/` is edited. The server handles live terminal streams and herdr's event protocol, where regressions are easy to miss by eye, so the hook gives immediate feedback on every change instead of relying on someone remembering to run tests.

**Where Kiro fit in our workflow.** We ran several AI agents in parallel across git worktrees throughout the hackathon, which is exactly the workflow Office Agency visualises. Kiro's specs and steering were the shared source of truth that kept those parallel streams consistent.

### Describe the features and functionality of your Project

Office Agency turns your fleet of AI coding agents into a pixel-art office you can walk around. Developers increasingly run many agents at once (Claude Code, Codex, OpenCode), each in a near-identical terminal tab, and keeping track of them means constant, draining context switching. Office Agency gives every piece of work a place instead, so your spatial memory does the bookkeeping that your working memory used to.

**A spatial map of your work.** Each project is a building on a street. Inside, agents on the main checkout sit in the lobby, and every git worktree gets its own room, so separate concerns are separate physical spaces. Each agent is a person at a desk, and rooms grow with varied desk layouts as agents are added. An agent keeps its seat for as long as its session lives, so you always know where to find it.

**State at a glance.** Agents show their status through body language and symbols, not colour alone: typing while working, waving with a ✓ when done, asleep when idle, and crying with a red "!" and a floor glow when blocked waiting on you. From the street, each building's roof shows a dot per agent and a pulsing badge if anyone inside is blocked.

**Talk to any agent in place.** Walk up and press E, click an agent, or press B to jump straight to the next blocked one. A drawer opens with that agent's live terminal, and you type straight into its real TUI. It works with any agent herdr supports, with no per-agent code. Ctrl+] returns you to walking and Esc closes the drawer. Opened with E, the drawer closes when you walk away. A link-out opens the agent in a native terminal (Ghostty, Kitty or Terminal.app). Opening an agent clears its "done" check, so the office reflects what you've actually seen.

**Manage work from the office.** Start a new agent at an empty desk, or create a new worktree (a new room) with an agent in it, without leaving the office.

**How it works.** A zero-dependency Node server subscribes to herdr's socket API, push-based with no polling, and streams agent state to the browser over Server-Sent Events. Live terminals stream ANSI frames from herdr's terminal sessions into xterm.js, and keystrokes go back the other way. The client is TypeScript with Pixi.js v8 for rendering, React for the HUD and drawer, and zustand for state, using Kenney's CC0 pixel-art packs. It runs entirely on your machine: the server listens on localhost with a per-run token. A fixture mode with simulated agents runs the full experience without herdr (`npm run demo`).
