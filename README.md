# Office Agency

Your [herdr](https://herdr.dev) agent fleet as a 2D office you can walk around. Projects are buildings, worktrees are rooms, every agent session is a person at a desk, animated by its state.

Early hackathon build. See [`PRD.md`](PRD.md) for scope and [`FRONTEND_HANDOFF.md`](FRONTEND_HANDOFF.md) for the client.

## Requirements

- herdr 0.9.3 or newer
- Node 20 or newer on the `PATH` herdr runs with
- macOS or Linux

## Install

```bash
herdr plugin install JTP75/office-agency
```

Bind a key in your herdr `config.toml`:

```toml
[[keys.command]]
key = "prefix+o"
type = "plugin_action"
command = "office-agency.open"
description = "open office"
```

Press it: a small server starts in the background and your browser opens the office. Nothing is added to your herdr layout.

## How it runs

| | |
| --- | --- |
| Open | `office-agency.open` starts the server if needed, then opens the browser |
| Stop | `office-agency.stop`, or just quit herdr: the server exits on its own about 10 s after herdr's socket goes away |
| Logs | `herdr plugin pane open --plugin office-agency --entrypoint logs` |
| Address | `http://127.0.0.1:4567` (next free port up to 4576), with a per-run token in the URL |
| State | `office.json` and `office.log` in the plugin's state directory |

The server listens on `127.0.0.1` only, and every API call needs the token.

## Uninstall

```bash
herdr plugin uninstall office-agency
```

## Development

```bash
git clone git@github.com:JTP75/office-agency.git && cd office-agency
herdr plugin link .                         # register this checkout
herdr plugin action invoke office-agency.open
# after server changes:
herdr plugin action invoke office-agency.stop && herdr plugin action invoke office-agency.open
```

Without herdr, `node server/index.mjs --source fixture` serves the same page with fake agents.
