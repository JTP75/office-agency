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
| `project` | string | Repo name; all worktrees of a repo share it → **building** |
| `worktree` | string \| null | Branch name (or directory name if detached); `null` outside git → **room** door sign |
| `lobby` | boolean | `true` for the repo's main checkout or a non-git directory → the **lobby** instead of a room |
| `workspace`, `tab` | string | herdr layout ids. Not used for the office layout; ignore unless useful |
| `title` | string | Terminal title → name tag above the head |

Agents appear and disappear between snapshots as sessions start and end.

## Commands (not built yet; backend phase 2)

| Call | Body | Returns | Does |
| --- | --- | --- | --- |
| `POST /api/agents/:id/prompt` | `{ "text": "…" }` | `{ ok: true }` or `{ error: "agent_blocked" }` | Sends a message to the agent |
| `GET /api/agents/:id/read?lines=40` | — | `{ lines: ["…"] }` | Last N lines of its terminal |
| `POST /api/agents/:id/keys` | `{ "keys": ["esc"] }` | `{ ok: true }` | Presses keys (answering approval dialogs) |
| `POST /api/agents/:id/focus` | — | `{ ok: true }` | Jumps herdr to the real pane |

`:id` is URL-encoded (`w1%3Ap6`).
