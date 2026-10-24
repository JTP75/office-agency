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

## Ping: `GET /api/ping?t=<token>`

`200 { "ok": true, "source": "herdr" }` with a valid token, `401` with a stale one. Use it when the event stream errors: a network error means the server is down (keep retrying); a `401` means the server restarted with a new token, so this tab is dead. Tell the user to reopen the office from herdr.

## Fixture scenarios

`node server/index.mjs --source fixture --scenario <name>` (or `OFFICE_SCENARIO=<name>`):

| Scenario | What it shows |
| --- | --- |
| `default` | 13 agents, 2 projects, 5 worktrees, a random status change every 3 s |
| `empty` | No agents at all |
| `crowded` | 40 agents in one worktree room (`swarm/research`) plus 2 in the lobby |
| `churn` | `default`, plus agents arriving and leaving every 5 s and the `tts` project disappearing and coming back |

In fixture mode the commands are simulated too. A prompt sets the agent `working`, then `done` after 4 s. `enter`, `y`, `n`, `1` or `2` answers a blocked agent's dialog; `esc` cancels it to `idle`. `read` returns a fake transcript including what you sent.
