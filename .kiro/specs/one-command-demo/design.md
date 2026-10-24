# One-Command Demo Design

## Overview

Add a `demo` npm script to the root `package.json` that orchestrates build-if-needed → start server → open browser. The script is a thin Node.js wrapper that checks for `client/dist/index.html`, conditionally runs the client build, then spawns the server with demo flags.

## Architecture

```
npm run demo
    ↓
scripts/demo.mjs (new)
    ↓
    ├─ fs.existsSync('client/node_modules') ?
    │   ├─ No  → npm --prefix client ci
    │   └─ Yes → skip install
    ↓
    ├─ fs.existsSync('client/dist/index.html') ?
    │   ├─ No  → npm --prefix client run build
    │   └─ Yes → skip build
    ↓
    └─ spawn(process.execPath, ['server/index.mjs', '--source', 'fixture', '--scenario', 'crowded', '--port-fallback'])
           ↓
           server/index.mjs (existing)
              ↓
              server/browser.mjs opens http://127.0.0.1:<port>/?t=<token>
```

## Components

### 1. `scripts/demo.mjs` (new)

A zero-dependency Node script that:

1. **Checks for dependencies**: `fs.existsSync('client/node_modules')`
   - If missing: run `npm --prefix client ci`
   - If present: skip to build check
2. **Checks for build**: `fs.existsSync('client/dist/index.html')`
   - If missing: run `npm --prefix client run build`
   - If present: skip to server start
3. **Starts server**: `child_process.spawn(process.execPath, ['server/index.mjs', '--source', 'fixture', '--scenario', 'crowded', '--port-fallback'], { stdio: 'inherit' })`
4. **Exits with server's exit code**

**Key decisions**:
- Check `node_modules` and `index.html` separately for fine-grained skipping
- Use `process.execPath` to spawn with the same Node that ran the script
- Add `--port-fallback` so the server tries ports 4567–4576 if busy
- Use `stdio: 'inherit'` so server logs appear in the terminal
- No new dependencies: only `fs`, `child_process`, `path`, `url`, and `process` from Node stdlib

### 2. Root `package.json` change

Add to `scripts`:

```json
{
  "scripts": {
    "demo": "node scripts/demo.mjs"
  }
}
```

### 3. Server behavior (no changes)

The server already supports:
- `--source fixture` → `createFixtureSource` in `server/sources/fixture.mjs`
- `--scenario crowded` → fixture scenario selection
- Browser opening via `server/browser.mjs` when not `--no-open`

No server code changes needed.

### 4. README.md addition

Add a new section after "Install":

```markdown
## Try it without herdr

No herdr installed? Run the demo with fake agents:

\`\`\`bash
git clone https://github.com/JTP75/office-agency.git
cd office-agency
npm run demo
\`\`\`

The script installs client dependencies and builds only when needed, then starts fixture mode and opens the browser. The office will open at `http://127.0.0.1:4567` with scripted agents.
```

## Edge Cases

| Case | Behavior |
| --- | --- |
| Fresh clone, no `node_modules/` | `npm ci` installs deps, then builds, then starts server |
| `client/dist/` exists but incomplete | Script assumes build is valid; user can `rm -rf client/dist` to force rebuild |
| `npm run demo` twice | Idempotent: skips install and build on second run, server restarts |
| Server already running on 4567 | Server's `--port-fallback` tries 4568–4576 (existing behavior) |
| Ctrl+C during demo | Server exits, script exits |

## Testing

1. **Fresh clone**: `rm -rf node_modules client/node_modules client/dist`, then `npm run demo`
2. **Already built**: `npm run demo` (should skip install and build)
3. **Partial build**: `rm client/dist/index.html`, then `npm run demo` (should rebuild)
4. **Browser opens**: Verify the office loads with ~42 agents in crowded mode

## Files Changed

| File | Change | Lines |
| --- | --- | --- |
| `scripts/demo.mjs` | New | ~70 |
| `package.json` (root) | Add `"demo": "node scripts/demo.mjs"` | 1 |
| `README.md` | Add "Try it without herdr" section | ~10 |

**Total**: 1 new file, 2 modifications, ~80 lines added.

## Alternatives Considered

1. **Shell script**: Would require bash, not portable to all environments Node runs on
2. **Inline package.json script**: Too complex for build-check-then-spawn logic
3. **Skip auto-build**: Judges might not realize they need to build first; bad DX
4. **New server flag `--demo`**: Unnecessary; `--source fixture --scenario crowded` already exists

## Risks

- **Build sentinel false positive**: If `client/dist/index.html` exists but the build is broken, the demo will start but fail to load. Mitigation: document `rm -rf client/dist` to force rebuild.
- **npm ci slowness**: On a fresh clone, `npm ci` takes 10–30s. Mitigation: acceptable for a one-time setup; judges run it once.
