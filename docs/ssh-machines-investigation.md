# SSH machines in Office Agency: investigation

2026-10-24 · investigation only, no code changed

**Goal:** show agents on herdr's saved SSH machines in the office, next to local ones, with the same commands and terminal.

> **Built on this branch** (`feat/ssh-machines`): the recommended approach below, as `server/sources/machines.mjs` (connections), `office.mjs` (merge + routing) and `place.mjs` (remote places). Decisions on the open questions are at the end. `PROTOCOL.md` and the README describe the result.

**Short answer:** it works. Open one SSH unix-socket forward per saved machine, then run one more copy of our existing `HerdrSource` against each forwarded socket. Push events, every command, create, and the live terminal all work this way against a real machine. Three things have to change: agent ids need a machine prefix, `git.mjs` has to be replaced by herdr's `worktree.list` for remote agents, and the snapshot needs a `machine` field. Backend effort is about 2 days.

## What herdr gives us (local 0.9.3, remotes 0.9.1)

- **The docs didn't change between versions.** `connecting-machines.mdx` is byte-identical in v0.9.3 and v0.9.5. In `cli-reference.mdx` only the plugin-update and fish sections changed, not the machine sections.
- **`herdr machine list --json`** returns `[{ id, label, target, session, enabled, selected }]`. We have two machines, `pacel-pc` and `pacel-orin`, both on session `default`. `herdr machine status --json` runs the same checks without asking for authentication and reports `reachable`. `add`, `remove`, `enable`, `disable`, `rename` and `reconnect` change the catalog, so I didn't run them.
- **`herdr --machine <label|id> <cmd>`** sends one API command per call over a fresh non-interactive SSH connection (`agent list` took about 0.5–0.9 s). It covers `agent` (except `attach`), `pane`, `tab`, `workspace`, `worktree`, `api snapshot` and `status server`. It does **not** cover `terminal session …` or `terminal attach`: both fail with `not an API-backed machine command`. There's no `events.subscribe` through it either, and the docs say: "combined listings … are not included."
- **The socket API has nothing about machines.** `herdr api schema --json` (protocol 22) has no `machine.*` method or field. The TUI merges machines on the client side; the server we talk to never sees them.
- **`herdr --remote <target>`** is an interactive TUI attach, so it's no use to a daemon.
- **The client keeps a per-machine cache** at `~/.local/state/herdr/client/ssh-metadata/<id>.json`, holding the remote OS and executable path (`/home/pacel/.local/bin/herdr`).

## (2) Do local `agent.list` and the event stream include remote agents?

**No.** The local `agent.list` returned only the 11 local agents (all under `/Users/pacel/...`), with no machine field. `pacel-pc` has 12 more agents, which only show up through that machine. **So we need one connection per machine.**

Ids collide across machines. `pacel-pc` has `w1:p1`, `w1:p6C` and so on, and so do we. Agent names are also unique only within one server.

## What works: forwarding the remote sockets over SSH

```
ssh -o BatchMode=yes -o ExitOnForwardFailure=yes -o StreamLocalBindUnlink=yes -N \
  -L <dir>/m-<id>.sock:<remote $HOME>/.config/herdr/herdr.sock \
  -L <dir>/m-<id>-client.sock:<remote $HOME>/.config/herdr/herdr-client.sock  <target>
```

I ran these against `pacel-pc`, using only read-only calls:

| Check | Result |
| --- | --- |
| `ping` over the forwarded socket | 128 ms, protocol 22, compatible |
| `agent.list` | 12 agents, 161 ms |
| `events.subscribe` | `subscription_started` (a long-lived push stream, as it is locally) |
| `worktree.list { cwd }` | returns `repo_root`, `repo_name`, and `branch`/`path`/`is_linked_worktree` per checkout; a non-git dir gives `not_git_worktree` |
| Local 0.9.3 `HERDR_SOCKET_PATH=<fwd> herdr terminal session observe w1:p1` | full `terminal.frame` 120×40, the same NDJSON our `herdr-term.mjs` parses |
| Methods we use, checked in the 0.9.1 schema | all present (0.9.1 lacks only `pane.clear` and `server.ssh_agent.register`) |

Two gotchas came up:

- **Terminal streams need a second socket.** The CLI connects to `<socket>-client.sock`, which it derives from `HERDR_SOCKET_PATH`, so both sockets have to be forwarded.
- **macOS caps unix socket paths at 104 bytes.** A long path fails with `sun_path` capacity errors. The plugin config dir (`~/.config/herdr/plugins/config/office-agency`, 55 chars) plus `m-<8 hex>-client.sock` fits.

I didn't test `terminal session control --takeover` against a remote. It takes over the pane and resizes it, so it changes remote state. It uses the same socket and code path as `observe`, which did work.

## (3) What breaks in our server today

| Area | What happens with a remote agent | Fix |
| --- | --- | --- |
| `server/herdr.mjs` | `SOCKET_PATH` is a single module constant | Pass the socket path in (`request(sock, …)`, `subscribe(sock, …)`) |
| `sources/herdr.mjs` | One source, local ids, `onDead` shuts the whole server down | Instantiate it once per machine with `{ socketPath, machine }`. For a remote source, `onDead` marks that machine offline and doesn't shut down |
| `sources/git.mjs` | Runs local `git -C /home/pacel/...`. That fails silently, and the agent turns into a non-git **lobby** with the wrong project. It's wrong, not an error | Remote sources resolve the place through `worktree.list` on that machine's socket: pick the longest `path` that's a prefix of the cwd; `lobby = !is_linked_worktree`; `project = repo_name`. Cache per repo. (Could also replace git locally, optional.) |
| `uniqueProjects` | `vettd` on two machines would get the parent-dir label `(agentic-highway)` | Group by machine first; disambiguate only within a machine |
| prompt / read / keys | Fine once routed to the right socket | Route by id prefix |
| `focus` | `agent.focus` focuses inside the *remote* server; the local TUI won't switch machines | Unknown whether that can be fixed (open question). Maybe hide focus for remote agents |
| Terminal (`term/herdr-term.mjs`) | Spawns `herdr` with the local socket | Spawn with `env: { HERDR_SOCKET_PATH: <forwarded> }`. Fallback: `ssh <target> <remote herdr> terminal session control …` over stdio |
| `open-native` | `terminal attach` against the local socket | Same env trick, since the native window runs the local CLI against the forward. Or launch `ssh -t <target> herdr terminal attach …` |
| Create agent / worktree | `tab.create`, `agent.start` and `worktree.create` work over the socket with remote absolute paths. `names` and `pickName` have to be per machine | The room lookup must match on machine too, so `spawn`/`createWorktree` bodies need `machine` |
| Lifecycle | Only local herdr liveness matters | Unchanged; the forwards are child processes, killed on shutdown |

## (4) Proposed protocol change (additive)

- **Agent:** add `"machine": null | "<label>"` (`null` = local). Remote ids get a prefix: `<machineId8>/w1:p1`. Local ids stay exactly as they are, so nothing breaks. Clients already treat `id` as opaque and URL-encode it.
- **Snapshot:** add `"machines": [{ "id", "label", "status": "online" | "connecting" | "attention" | "offline", "message"? }]`. A dropped machine keeps its last agents with `stale: true` (herdr's TUI does the same: "dimmed … cached information, not live state"). Or drop them. Deciding this is open question 4.
- **Create:** `POST /api/agents` and `/api/worktrees` accept `"machine": null | "<label>"`, defaulting to local.
- **`/api/ping`:** no change.
- **Fixture:** add a `machines` scenario with one remote machine, one offline machine, and a colliding `w1:p1`.

**In the office:** a machine is a **campus**, a fenced block or street of buildings with a sign showing the machine label and status light. Local is the home campus. Buildings keep meaning projects, so `vettd` on `pacel-pc` is its own building on the `pacel-pc` campus. An offline campus is greyed out, with a "reconnect: `herdr machine reconnect pacel-pc`" sign. The minimap and "next blocked" span every campus. This is the frontend's call; the protocol above supports other layouts too.

## Recommended approach and effort

1. **`MachineManager`:** read `herdr machine list --json` at start and on a slow poll (about 30 s), keep one `ssh -N -L … -L …` child per enabled machine, restart it with backoff, and expose a socket path and status per machine. *About 0.5 day.*
2. **Parameterize the socket in `herdr.mjs` and `createHerdrSource`, and add `CompositeSource`.** `CompositeSource` keeps the current source interface (`subscribe`, `has`, `prompt`, …, `spawn`), merges snapshots, prefixes ids, and routes calls. `index.mjs` and `term/hub.mjs` stay almost unchanged. *About 0.5–0.75 day.*
3. **Place resolution through `worktree.list`** for remote sources. *About 0.25 day.*
4. **Terminal and native link-out** using the per-machine `HERDR_SOCKET_PATH`. *About 0.25 day, plus a takeover test on a real remote pane.*
5. **`PROTOCOL.md` PR, fixture scenario, tests.** *About 0.5 day.* The frontend work (campuses, offline state) is separate.

**Fallback if socket forwarding is blocked** (`AllowStreamLocalForwarding no` on the host): poll `herdr --machine X agent list` every 2–3 s for status. Commands go through `herdr --machine X agent prompt/read/send-keys/start`, and the terminal goes through `ssh X herdr terminal session control` over stdio. This costs more latency and an SSH handshake per call unless ControlMaster is on, and there are no push events.

## Decisions (as built)

1. **Auth:** plain `ssh -o BatchMode=yes` with the user's SSH config. Failures are classified: auth and host-key problems are `attention`, with `herdr machine reconnect <label>` in the message. Everything is retried with backoff (2 s doubling to 2 min, and fast again after a minute of health). Reusing herdr's ControlPath is still open.
2. **`--takeover` remotely:** tested on a throwaway pane on `pacel-orin`. It takes over, frames arrive, input echoes, and resize works.
3. **Focus:** focuses the pane on that machine and returns `machine`. The drawer tells the user to select the machine in herdr's sidebar.
4. **Stale agents:** dropped from the snapshot while a machine isn't `online`. The district and buildings stay, and the sign shows the status ("truth over polish").
5. **Scope:** every enabled machine, the same as herdr's sidebar. `herdr machine disable` hides one.
6. **Security:** the forwarded sockets live in a 0700 dir (the plugin state dir, or a short temp dir when that path is too long for a unix socket) that is removed on shutdown. Only agents in the snapshot can be targeted.
7. **Windows remotes:** not supported (named pipes). The forward fails and the machine shows `offline` with ssh's error.

## Unknowns and open questions (pre-build)

1. **Auth.** Our `ssh` uses the user's ordinary SSH config and works here because keys are loaded (`BatchMode=yes` succeeded). For MFA or passphrase hosts, can we reuse herdr's managed ControlPath (`remote.manage_ssh_config`)? Where does herdr put it? If we can't reuse it, we show `attention` with `herdr machine reconnect <label>` and never prompt.
2. **`--takeover` remotely.** I haven't tested this, to avoid changing remote state. It needs one supervised test on a throwaway remote pane.
3. **Focus.** Is there any API that makes the local TUI select a machine and workspace? I found none in the schema. Without one, `focus` for remote agents is a no-op or gets hidden.
4. **Stale agents.** When a machine drops, do we keep its desks dimmed or remove them? Dimmed matches herdr, but the PRD's "truth over polish" rule argues for a clear `stale` marker.
5. **Scope.** Do we show every enabled machine, or only the ones that are currently `selected` or opt in through `config.json`? Twelve idle `vettd` agents on `pacel-pc` would crowd the office.
6. **Security.** A forwarded socket gives full herdr control of the remote. Keep the forwards in a 0700 dir and remove them on shutdown. The browser can still only reach agents in the snapshot, as it can locally.
7. **Windows remotes.** These use a named pipe, not a unix socket, so the forward won't work. Out of scope unless needed.
