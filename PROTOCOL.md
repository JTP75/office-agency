# Protocol

The contract between `client/` (frontend) and `server/` (backend). Changes go through a PR both people approve. Additive fields are fine without review; the client must ignore keys it doesn't know.

## Auth

The browser is opened at `http://127.0.0.1:<port>/?t=<token>`. Every `/api/*` request carries the same `?t=<token>`; anything else gets `401`. The client reads the token from its own URL.

## Push: `GET /api/events?t=<token>`

Server-Sent Events. Each message is a full snapshot of every agent. The current snapshot is sent on connect and again whenever anything changes, so the client never fetches state separately: just replace what you have with the newest snapshot.

```js
const events = new EventSource(`/api/events?t=${token}`);
events.onmessage = (e) => {
  const msg = JSON.parse(e.data); // { type: "snapshot", source, agents }
};
```

```json
{
  "type": "snapshot",
  "source": "fixture",
  "agents": [
    {
      "id": "w1:p6",
      "kind": "claude",
      "status": "blocked",
      "project": "office-agency",
      "worktree": "fix/auth",
      "lobby": false,
      "workspace": "w1",
      "tab": "w1:t3",
      "title": "Fix flaky auth test"
    }
  ]
}
```

| Field | Type | Office meaning |
| --- | --- | --- |
| `source` | `"herdr"` \| `"fixture"` | Show "fixture" visibly in the HUD so a demo is never mistaken for real data |
| `id` | string | One agent session. Stable for the session's life; use it as the desk key |
| `kind` | string | Harness: `claude`, `codex`, `opencode`, … → character look |
| `status` | `working` \| `idle` \| `blocked` \| `done` \| `unknown` | → animation |
| `project` | string | Repo name; all worktrees of a repo share it → **building**. Unique: two different folders with the same name become `api (work)` and `api (home)` |
| `worktree` | string \| null | Branch name (or directory name if detached); `null` outside git → **room** door sign |
| `lobby` | boolean | `true` for the repo's main checkout or a non-git directory → the **lobby** instead of a room |
| `workspace`, `tab` | string | herdr layout ids. Not used for the office layout; ignore unless useful |
| `title` | string | Terminal title → name tag above the head |

Agents appear and disappear between snapshots as sessions start and end.

## Commands

All return JSON. Success is `200 { "ok": true, … }`; failure is `{ "error": "<code>", "message": "…" }` with the HTTP status below. `:id` is the agent's `id`, URL-encoded (`w1%3Ap6`). Only agents in the current snapshot can be targeted.

| Call | Body | Success | Does |
| --- | --- | --- | --- |
| `POST /api/agents/:id/prompt` | `{ "text": "…" }` (1–8000 chars) | `{ ok }` | Sends a message to the agent, as if typed + Enter |
| `GET /api/agents/:id/read?lines=40` | — | `{ ok, lines: ["…"] }` | Last N lines of its terminal, plain text (`lines` 1–200, default 40) |
| `POST /api/agents/:id/keys` | `{ "keys": ["esc"] }` (1–10 keys) | `{ ok }` | Presses keys, for answering approval dialogs and menus |
| `POST /api/agents/:id/focus` | — | `{ ok }` | Jumps herdr to the agent's real pane |

Allowed keys: `esc` `enter` `tab` `shift+tab` `up` `down` `left` `right` `space` `y` `n` `1`–`9`. Anything else is refused, so the browser can't drive a shell.

| Status | `error` | Meaning / what the UI should do |
| --- | --- | --- |
| 400 | `bad_request`, `key_not_allowed` | Client bug |
| 404 | `agent_not_found` | Agent left; it will drop out of the next snapshot |
| 409 | `agent_blocked` | Prompt refused: the agent is waiting on a dialog. Offer the quick keys instead |
| 409 | `agent_not_ready` | herdr can't type into it right now (e.g. it's not the pane's foreground process) |
| 502 | other herdr codes | herdr failed; show the message |

A prompt's effect shows up as a status change in the next snapshot (usually `working`), not in the response.

## Terminal

A live view of an agent's real terminal, so every harness's TUI works in the office. One session per agent is shared by every viewer. It opens on the first viewer; when the last one disconnects it stays open for a couple of seconds before it is released, so a drawer that closes and reopens (E, a remount, a reload) reuses the same session instead of opening a second control process. Opening takes control automatically: anyone else controlling that pane (another tab, a native terminal window) loses it.

| Call | Body | Does |
| --- | --- | --- |
| `GET /api/agents/:id/term?cols=C&rows=R` | — | SSE stream of the terminal (below). `cols` 20–300, `rows` 5–120: size it to fit your view; the agent's pane is resized to match while the session is open. Errors (404, 400, 501) come back as JSON before the stream starts |
| `POST /api/agents/:id/term/input` | `{ "text": "…" }` or `{ "bytes": "<base64>" }` | Keystrokes, exactly as typed (xterm.js `onData` output, minus the emulator's own replies to terminal queries). Not filtered by the server |
| `POST /api/agents/:id/term/resize` | `{ "cols": C, "rows": R }` | The view changed size. The newest viewer's size wins |
| `POST /api/agents/:id/term/scroll` | `{ "direction": "up"\|"down", "lines": N, "column"?: C, "row"?: R }` | One wheel notch: scrolls the TUI at cell `(column, row)` (zero-based, default the pane's first cell). `lines` 1–50, default 1 |

`term/input`, `term/resize` and `term/scroll` need an open stream for that agent, otherwise `409 no_session`.

Send the wheel here instead of letting xterm.js turn it into arrow keys: a full-screen TUI in the alternate screen has no scrollback for xterm, so its wheel handling degrades to `Up`/`Down`, which most agents read as prompt history. herdr delivers `term/scroll` as a mouse-wheel event to apps that enabled mouse reporting and drops it for apps that didn't — so it scrolls chat views and never steps through history.

Stream events:

```json
{ "type": "frame", "full": true, "width": 80, "height": 24, "bytes": "<base64 ANSI>" }
{ "type": "closed", "reason": "agent gone" }
```

- **`frame`**: write the decoded bytes to the terminal emulator. A `full` frame redraws the whole screen and is always sent first, including to a viewer joining an open session. If `width`/`height` differ from your terminal's (another viewer resized it), resize to match.
- **`closed`**: the session is over (`agent gone`, `detached`, `terminal attach taken over`, …). The stream then ends; offer Reconnect unless the agent is gone.

**Fixture mode** runs a small fake agent TUI per agent: a transcript, a `❯` prompt line, and a numbered dialog while blocked. Typing echoes; Enter sends through the same path as `prompt` (status goes working → done); `1`/`y`/Enter or `2`/`n` answers a dialog; Esc cancels it. The wheel pages the transcript (`term/scroll`), and typing jumps back to the prompt.

**herdr mode** streams the agent's real terminal (`herdr terminal session control --takeover`), so every harness's TUI works, menus and dialogs included. While the stream is open, the agent's pane takes your `cols`×`rows`; when the last viewer leaves, control is released and an attached herdr window gets its own size back.

### Native terminal: `POST /api/agents/:id/open-native`

Opens the agent in a native terminal window (`herdr terminal attach <terminal_id> --takeover`). That window takes control, so an open stream gets `closed` with `terminal attach taken over`; opening the stream again takes it back. Returns `{ ok, terminal: "Ghostty" }`; `501 not_supported` in fixture mode or with no supported app.

The app comes from `config.json` in the plugin's config directory (`herdr plugin config-dir office-agency`): `{ "terminal": "ghostty" | "kitty" | "terminal" }`, default `ghostty` (`terminal` = macOS Terminal.app).

## Ping: `GET /api/ping?t=<token>`

`200 { "ok": true, "source": "herdr", "nativeTerminal": "Ghostty" }` with a valid token (`nativeTerminal` is null when the link-out isn't available), `401` with a stale one. Use it when the event stream errors: a network error means the server is down (keep retrying); a `401` means the server restarted with a new token, so this tab is dead. Tell the user to reopen the office from herdr.

## Fixture scenarios

`node server/index.mjs --source fixture --scenario <name>` (or `OFFICE_SCENARIO=<name>`):

| Scenario | What it shows |
| --- | --- |
| `default` | 13 agents, 2 projects, 5 worktrees, a random status change every 3 s |
| `empty` | No agents at all |
| `crowded` | 40 agents in one worktree room (`swarm/research`) plus 2 in the lobby |
| `churn` | `default`, plus agents arriving and leaving every 5 s and the `tts` project disappearing and coming back |

In fixture mode the commands are simulated too. A prompt sets the agent `working`, then `done` after 4 s. `enter`, `y`, `n`, `1` or `2` answers a blocked agent's dialog; `esc` cancels it to `idle`. `read` returns a fake transcript including what you sent.
