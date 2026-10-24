# Tech

## Stack

- **Server** (`server/`): Node (ES modules, `.mjs`), **zero runtime
  dependencies** — only the Node standard library (`http`, `fs`, `net`,
  `crypto`, `child_process`, …). It runs from a raw checkout. Serves the built
  client and relays agent state over Server-Sent Events.
- **Client** (`client/`): TypeScript, React 19, Pixi.js 8 for the canvas,
  Zustand for state, xterm.js (`@xterm/xterm` + `@xterm/addon-fit`) for the
  terminal drawer. Built with Vite; typechecked with `tsc --noEmit`.
- **Plugin manifest** (`herdr-plugin.toml`): declares build steps, the open/stop
  actions, and the logs pane. `min_herdr_version = "0.9.3"`, platforms
  `linux` and `macos`.

## Runtime, build, and test commands

```bash
# Server, real agents from herdr (default when HERDR_ENV is set):
node server/index.mjs

# Server, fake agents, no herdr needed:
node server/index.mjs --source fixture
#   --scenario default|empty|crowded|churn   (fixture only)
#   --no-open            don't open a browser
#   --port-fallback      try the next ports if busy (the daemon uses this)

# Tests (server node:test + client's pure helpers):
npm test            # node --test server/test client/test

# Client build (typecheck + bundle) and typecheck:
npm run build       # npm --prefix client run build -> tsc --noEmit && vite build
npm run typecheck

# Client dev (server + Vite side by side; Vite proxies /api):
OFFICE_TOKEN=dev node server/index.mjs --source fixture --no-open
cd client && npm run dev     # open http://localhost:5173/?t=dev
```

- `herdr plugin link .` registers a checkout but does **not** run the build;
  run `npm --prefix client ci && npm --prefix client run build` yourself.
- `herdr plugin install` runs the build steps from the manifest automatically, so
  keep `npm run build` passing on `main`.
- The server only serves the **built** client (`client/dist/`); without a build it
  shows a "not built yet" page.

## Architecture seams

```
browser (Pixi canvas + React)  ──HTTP/SSE──▶  server (zero-dep Node)  ──unix socket/CLI──▶  herdr
  map, avatars, drawer            token-gated proxy, SSE relay         events.subscribe, agent.*
```

- **`AgentSource`** is the core seam, with two implementations behind one
  interface: `createHerdrSource` (`server/sources/herdr.mjs`, real) and
  `createFixtureSource` (`server/sources/fixture.mjs`, scripted). Both expose the
  same `subscribe` / `has` / `prompt` / `read` / `keys` / `focus` / `spawn` /
  `createWorktree` surface, so the server and client run identically against
  either. The source is chosen in `server/index.mjs` from `--source` (defaults to
  `herdr` when `HERDR_ENV` is set, else `fixture`).
- **herdr relay** (`server/herdr.mjs`): minimal newline-delimited JSON client over
  the unix socket at `HERDR_SOCKET_PATH`. `HerdrSource` is push-fed: herdr events
  are treated as invalidation signals that trigger a fresh `agent.list` read; if
  the lifecycle subscription drops and herdr doesn't return, `onDead` triggers
  shutdown.
- **Terminal hub** (`server/term/`): one shared terminal session per agent across
  all viewers (`hub.mjs`), with a herdr-backed implementation (`herdr-term.mjs`,
  `terminal session control --takeover`, native link-out) and a fake TUI
  (`fake.mjs`) for fixture mode.
- **Command validation** (`server/sources/commands.mjs`): shared input checks and
  the `CommandError` type; the server validates before dispatching to a source.
- **Lifecycle** (`server/lifecycle.mjs`): one office per machine, port selection,
  `office.json` / `office.log` in the state dir, and a single shutdown path.
- **Client/server contract**: `PROTOCOL.md` is canonical. The client consumes a
  single SSE stream of full snapshots and issues commands over POST; it replaces
  its whole state with each snapshot.

## Coding conventions

- Server is ES modules, no transpile step, no third-party runtime deps. Keep it
  that way: new server code uses only the Node stdlib.
- Each HTTP handler returns JSON as `200 { ok: true, … }` on success and
  `{ error: "<code>", message: "…" }` with the documented status on failure, via
  `CommandError`.
- `/api/agents/:id/<verb>` routes are allowlisted: only the verbs in the
  `COMMANDS` map in `server/index.mjs` reach herdr.
- Only keys in the `ALLOWED_KEYS` set (esc, enter, tab, shift+tab, arrows, space,
  y, n, 1–9) may be pressed; anything else is refused so the browser can't drive a
  shell.
- Client never renders agent text as HTML (no `innerHTML` with `title`); use
  `textContent` or draw on the canvas. Agent titles come from terminals and can
  contain anything.
- Client reads the token from its own URL (`?t=<token>`) and sends it on every
  `/api/*` call.

## Hard constraints

- **Zero-dependency server.** No runtime npm dependencies in `server/`; it must
  run from a raw checkout with plain Node.
- **`127.0.0.1` + token gate.** The server binds `127.0.0.1` only. Every `/api/*`
  request must carry the per-run token (`?t=<token>`); anything else is `401`.
  The browser never touches the herdr socket; the proxy is allowlisted.
- **Fixture-first.** Every client feature must work with `--source fixture`. Every
  new backend field appears in the fixture the same day. The fixture's shape
  matches `PROTOCOL.md` exactly, including the command endpoints.
- **Protocol changes need both owners.** `PROTOCOL.md` is the only thing both
  sides touch; renaming or removing a field, or changing a status value, is a PR
  both people approve. Additive fields are fine without review, and the client
  must ignore keys it doesn't know.
- **No faked state in herdr mode.** In herdr mode nothing on screen is invented;
  fixture mode is labeled "fixture" in the HUD. `source` in each snapshot is
  `"herdr"` or `"fixture"`.
- **Main always runs.** Short-lived branches; merge to `main` only when your side
  still works against the other side's current `main`.
