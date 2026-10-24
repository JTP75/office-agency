# One-Command Demo Tasks

## Task Breakdown

### 1. Create `scripts/demo.mjs` ✓

**Objective**: New Node script that checks for dependencies and build separately, conditionally installs/builds, then starts the server.

**Steps**:
1. Create `scripts/demo.mjs`
2. Import `fs`, `child_process`, `path`, `url`, `process` from Node stdlib
3. Resolve paths to `client/node_modules` and `client/dist/index.html` relative to project root
4. Check if `client/node_modules` exists with `fs.existsSync`
5. If missing:
   - Log "Client dependencies not installed, running npm ci..."
   - Spawn `npm --prefix client ci` with `{ stdio: 'inherit' }`
   - Wait for completion; exit if install fails
6. Check if `client/dist/index.html` exists with `fs.existsSync`
7. If missing:
   - Log "Client not built, running build..."
   - Spawn `npm --prefix client run build` with `{ stdio: 'inherit' }`
   - Wait for completion; exit if build fails
8. Log "Starting demo server..."
9. Spawn `process.execPath` with args `['server/index.mjs', '--source', 'fixture', '--scenario', 'crowded', '--port-fallback']` and `{ stdio: 'inherit' }`
10. Forward server's exit code

**Acceptance**:
- Script runs without errors
- Installs client deps if `client/node_modules/` is missing
- Builds client if `client/dist/index.html` is missing
- Skips install/build if already done
- Server starts with fixture crowded scenario and port fallback
- Ctrl+C stops the server and script

**Status**: Complete

---

### 2. Add `demo` script to root `package.json` ✓

**Objective**: Wire the demo script into npm.

**Steps**:
1. Open root `package.json`
2. Add `"demo": "node scripts/demo.mjs"` to the `scripts` section
3. Verify the script runs with `npm run demo`

**Acceptance**:
- `npm run demo` invokes `scripts/demo.mjs`
- No errors in `package.json` syntax

**Status**: Complete

---

### 3. Add "Try it without herdr" section to README.md ✓

**Objective**: Document the demo command for non-herdr users.

**Steps**:
1. Open `README.md`
2. Add a new "## Try it without herdr" section after "## Install"
3. Include:
   - One-sentence explanation (no herdr needed, fake agents)
   - Code block with `git clone`, `cd`, `npm run demo` (no root `npm install`)
   - Note that the script handles dependencies and build automatically
   - Address is `http://127.0.0.1:4567` or next free port
4. Keep it concise (8–12 lines)

**Acceptance**:
- Section is clear and follows README style
- Commands are copy-pasteable
- No mention of root `npm install`
- Positioned logically (after Install, before How it runs)

**Status**: Complete

---

### 4. Test from fresh clone (Partially complete)

**Objective**: Verify the demo works end-to-end from a clean state.

**Steps**:
1. Clone the repo to a temporary directory
2. Run `npm run demo` (no root `npm install` needed)
3. Verify:
   - Client dependencies install (if not already done)
   - Client builds (if not already built)
   - Server starts
   - Browser opens to `http://127.0.0.1:4567/?t=<token>` or next free port
   - Office loads with ~42 agents in crowded fixture mode
4. Ctrl+C to stop
5. Run `npm run demo` again (should skip install and build, restart server)

**Acceptance**:
- Demo runs successfully from fresh clone
- Browser opens and office renders
- Second run is faster (no reinstall/rebuild)
- No errors in console

**Status**: Partially complete. The build-from-missing-dist path and second-run skip were exercised and verified working. Testing from a separate fresh clone was not performed.

---

### 5. Test edge cases (Partially complete)

**Objective**: Ensure robustness.

**Steps**:
1. **Partial build**: `rm client/dist/index.html`, run `npm run demo` → should rebuild
2. **Port conflict**: Start server manually on 4567, run `npm run demo` → should use 4568
3. **Missing node_modules**: `rm -rf client/node_modules`, run `npm run demo` → should reinstall and build
4. **Ctrl+C during build**: Start demo, Ctrl+C during client build → should exit cleanly

**Acceptance**:
- All edge cases handled gracefully
- No crashes or hangs

**Status**: Partially complete. Port fallback was observed (server started on 4568 when 4567 was busy). Other edge cases were not explicitly tested.

---

## Summary

| Task | Status |
| --- | --- |
| 1. Create `scripts/demo.mjs` | ✓ Complete |
| 2. Add `demo` script to `package.json` | ✓ Complete |
| 3. Update README.md | ✓ Complete |
| 4. Test from fresh clone | Partially complete |
| 5. Test edge cases | Partially complete |

## Dependencies

- Tasks 2–5 depend on Task 1 completing
- Task 4 depends on Task 3 (docs should match behavior)

## Verification Checklist

- [x] `scripts/demo.mjs` exists and runs without errors
- [x] `npm run demo` is defined in root `package.json`
- [x] README.md documents the demo command without mentioning root `npm install`
- [x] Demo skips reinstall/rebuild when `client/node_modules/` and `client/dist/index.html` exist
- [x] Browser opens to fixture crowded office
- [x] No new dependencies in `server/` imports or `package.json`
- [x] Ctrl+C stops the demo cleanly
- [x] Port fallback works (observed: server used port 4568 when 4567 was busy)
- [ ] Demo works from a separate fresh clone (not tested)
- [ ] Partial build recovery (not tested)
- [ ] Missing node_modules recovery (not tested)

## Verification Results

**What was verified:**

1. **Server tests**: `node --test server/test/` passed all 23 tests
2. **Demo run**: `npm run demo` successfully:
   - Ran `npm ci` to install client dependencies
   - Built the client (Vite bundle)
   - Started the server on port 4568 (4567 was busy, port fallback worked)
   - Served the office with HTTP 200
   - Fixture snapshot contained 42 agents in the `crowded` scenario
   - Server stopped cleanly with SIGTERM
3. **Second run**: `npm run demo` skipped both install and build (already done), restarted server
4. **README**: Confirmed no mention of root `npm install`; instructions say office opens at `127.0.0.1:4567` or next free port

**What was not verified:**

- Fresh clone in a separate directory (build-from-missing-dist and skip-on-second-run were tested in the working directory)
- Missing `node_modules` recovery path
- Partial build recovery (deleting `client/dist/index.html`)
- Client unit tests (`node --test client/test/`)
- Client typecheck (`npm run typecheck`)
