# How Kiro was used

This branch (`feat/kiro`) exists to show Kiro's spec, steering, and hook
features on a real, small change: a one-command demo for judges who do not have
herdr. This note separates what Kiro did from what was done by hand.

Date: 2026-10-24

## Environment and authentication

- **Kiro IDE 1.4.26** was already installed (`/Applications/Kiro.app`, with
  `kiro` on `PATH`). It was running during this work but was **not** driven; all
  agent work went through the CLI.
- **Kiro CLI 2.34.0** was installed with the Homebrew cask `kiro-cli`
  (`brew install --cask kiro-cli`), no sudo required.
- The cask linked `/opt/homebrew/bin/kiro-cli`, but not its helper binaries.
  `kiro-cli chat` initially failed with `failed to launch
  ~/.local/bin/kiro-cli-chat`. Two symlinks were added by hand:

  ```bash
  ln -sf "/Applications/Kiro CLI.app/Contents/MacOS/kiro-cli-chat" ~/.local/bin/kiro-cli-chat
  ln -sf "/Applications/Kiro CLI.app/Contents/MacOS/kiro-cli-term" ~/.local/bin/kiro-cli-term
  ```

  `kiro-cli setup` was not used because it itself requires a login first.
- **Sign-in:** `kiro-cli login` (Google social login). The browser step was
  completed by the human. No credentials or tokens are stored in this repo.
- **Headless use:** every agent turn was run as

  ```bash
  kiro-cli chat --model claude-sonnet-4.5 --no-interactive \
    --trust-all-tools --trust-workspace "<prompt>"
  ```

  `--trust-all-tools` let Kiro read files, write files, and run shell commands
  without interactive approvals. `--trust-workspace` skipped the workspace-trust
  prompt. `claude-haiku-4.5` was used only for two tiny smoke tests.

## Features used

### 1. Workspace steering (`.kiro/steering/`)

Kiro read the existing repo docs and code and wrote three steering files:

| File | What it covers | Sources Kiro read |
| --- | --- | --- |
| `product.md` | Product, users, core experience, goals, non-goals, demo constraints | `README.md`, `PRD.md`, `HANDOFF.md` |
| `tech.md` | Stack, commands, architecture seams, conventions, hard constraints | `PROTOCOL.md`, `PRD.md`, `HANDOFF.md`, manifest and code |
| `structure.md` | Directory map, where new files go, client/server ownership seam | repo tree, `PRD.md`, code |

The prompt required every statement to be traceable to a repo doc or file and
forbade inventing roadmap items. Kiro's tool log showed it reading the files,
then creating each document. No frontmatter or inclusion modes were used; plain
workspace steering files are included automatically.

### 2. Spec (`.kiro/specs/one-command-demo/`)

Created with Kiro's spec mode:

```bash
kiro-cli chat --mode spec --model claude-sonnet-4.5 --no-interactive \
  --trust-all-tools --trust-workspace "<feature brief>"
```

Kiro produced all three spec documents in one turn:
`requirements.md`, `design.md`, and `tasks.md`. Because the run was
non-interactive, Kiro's usual per-document review/approval gates did not appear;
it wrote the three files in a single pass rather than pausing between
requirements, design, and tasks.

The first pass contained one wrong assumption (telling judges to run a root
`npm install`, which installs nothing because the root has no dependencies).
That was corrected during implementation, and a later Kiro session **reconciled
the spec with the shipped code and the actual verification results**. The spec
files were therefore written and revised by Kiro, not hand-authored.

### 3. Implementation

Kiro implemented tasks 1-3 from `tasks.md`:

- created `scripts/demo.mjs`
- added `"demo": "node scripts/demo.mjs"` to the root `package.json`
- added the "Try it without herdr" section to `README.md`

The prompt asked for several refinements over the first spec pass: check
`client/node_modules` separately from `client/dist/index.html`, run `npm ci`
only when dependencies are missing, build only when the bundle is missing, pass
`--port-fallback`, spawn the server with `process.execPath`, and avoid claiming
a root `npm install` does anything. Kiro's tool log showed it reading the spec,
creating/editing the three files, and running `git diff` to show its work. Kiro
did not run the demo; the human ran the verification below.

### 4. Agent hook (`.kiro/hooks/run-server-tests.json`)

Kiro created one workspace hook with its file-creation tool:

```json
{
  "enabled": true,
  "name": "Run Server Tests",
  "description": "Automatically run the server test suite when any JavaScript module under server/ is modified",
  "version": "1.0.0",
  "tags": ["test", "server", "validation"],
  "when": {
    "type": "fileEdited",
    "patterns": ["server/**/*.mjs", "server/**/*.js"]
  },
  "then": {
    "type": "runCommand",
    "command": "node --test server/test/"
  }
}
```

This follows Kiro's current workspace-hook schema (`when.type: fileEdited` +
`then.type: runCommand`). **It was not triggered end-to-end:** no file under
`server/` was edited through Kiro after the hook was installed, and the headless
CLI sessions (engine v2, plus one v3 smoke test) did not report loading workspace
hooks. It is installed and schema-shaped, not proven to fire. Opening this
workspace in the Kiro IDE is the quickest way to exercise it.

### Not used

- MCP servers (none configured or called)
- Kiro Powers, custom agents, or skills
- Kiro Web / cloud sessions
- The Kiro IDE GUI for edits or spec generation

## Division of work

**Kiro (via Kiro CLI):**

- read the repo docs and code
- wrote `.kiro/steering/{product,tech,structure}.md`
- wrote and later reconciled `.kiro/specs/one-command-demo/*`
- wrote `scripts/demo.mjs`, the `package.json` demo entry, and the README section
- wrote `.kiro/hooks/run-server-tests.json`

**Human (the agent running this task):**

- installed the Kiro CLI cask and added the two helper symlinks
- started `kiro-cli login`; the human completed the browser sign-in
- chose the feature, wrote the prompts/constraints, and reviewed Kiro's output
- ran every verification command and stopped the servers
- made one README wording fix (`or the next free port, up to 4576`)
- wrote this note and created the commit

## Verification (run by hand, not by Kiro)

- `node --test server/test/` -> **23/23 pass**
- `npm run demo`, first run (no `client/node_modules`, no `client/dist`):
  - ran `npm ci`, then the client build
  - started fixture mode on **port 4568** (4567 was busy; `--port-fallback` worked)
  - `curl` of the printed URL -> **HTTP 200**, `text/html`
  - `/api/ping` -> `{"source":"fixture"}`
  - `/api/events` snapshot -> **42 agents** (crowded scenario)
  - stopped with `SIGTERM`; the demo process exited
- `npm run demo`, second run:
  - skipped install and build ("Starting demo server..." only)
  - served **HTTP 200**
  - stopped with `SIGTERM`
- No changes were made to `server/` or `PROTOCOL.md`.
