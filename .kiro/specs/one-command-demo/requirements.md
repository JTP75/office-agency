# One-Command Demo Requirements

## Problem

Hackathon judges do not have herdr installed and need a frictionless way to see Office Agency running with realistic agent activity. The current fixture mode requires manually running build and server commands separately.

## Goal

Provide a single `npm run demo` command that works from a fresh clone and opens a browser showing a crowded office with scripted agents.

## Requirements

### Functional

1. **Single command**: `npm run demo` starts everything needed
2. **Auto-install**: Check if `client/node_modules/` exists; if missing, run `npm ci` first
3. **Auto-build**: Check if `client/dist/index.html` exists; if missing, run the client build
4. **Fixture mode**: Start the server with `--source fixture --scenario crowded --port-fallback`
5. **Browser launch**: Automatically open the browser to the running server
6. **Fresh clone support**: Work immediately after `git clone` (no setup needed)

### Non-Functional

1. **Zero server dependencies**: The demo script must not add runtime dependencies to `server/`
2. **Reuse existing code**: Use `server/index.mjs` (already supports `--source fixture --scenario crowded`) and `server/browser.mjs` (already opens browsers)
3. **No protocol changes**: `PROTOCOL.md` remains unchanged
4. **Simple documentation**: Add a short "Try it without herdr" section to `README.md`

### Constraints

- The demo script lives in the root `package.json` as `npm run demo`
- Build detection uses Node stdlib only (no new dependencies)
- The server already handles `--scenario crowded` in fixture mode
- Browser opening already works via `server/browser.mjs`

## Success Criteria

1. From a fresh clone, `npm run demo` installs dependencies if needed, builds if needed, then opens a browser showing the crowded office
2. Running `npm run demo` twice in a row works (idempotent; doesn't reinstall or rebuild if already done)
3. No new runtime dependencies in `server/package.json` or as imports in `server/`
4. README documents the demo path clearly for non-herdr users without mentioning root `npm install`

## Out of Scope

- Demo choreography changes (the `crowded` scenario is already defined)
- New fixture scenarios beyond `crowded`
- Persistent state or configuration for demo mode
- Any changes to the server's runtime behavior or API
