// Resolve a cwd on another machine to { project, worktree, lobby, root, checkout },
// the same shape as git.mjs's placeOf, by asking that machine's herdr
// (`worktree.list`) instead of running git here. Paths are the remote's POSIX paths.

import path from "node:path";

const TTL_MS = 30_000;
const RETRY_MS = 5_000; // after a failed lookup, so a hiccup doesn't stick for 30 s

function plain(cwd) {
  return { project: path.posix.basename(cwd) || cwd, worktree: null, lobby: true, root: cwd, checkout: cwd };
}

/** The checkout that contains `cwd`: the longest worktree path that is cwd or a parent of it. */
export function checkoutOf(cwd, worktrees) {
  let best = null;
  for (const w of worktrees) {
    if (cwd !== w.path && !cwd.startsWith(w.path.endsWith("/") ? w.path : `${w.path}/`)) continue;
    if (!best || w.path.length > best.path.length) best = w;
  }
  return best;
}

/** A worktree.list result → place. Exported for tests. */
export function placeFromWorktrees(cwd, list) {
  const root = list.source.repo_root;
  const w = checkoutOf(cwd, list.worktrees) ?? { path: list.source.source_checkout_path, branch: null, is_detached: true, is_linked_worktree: false };
  return {
    project: path.posix.basename(root),
    worktree: w.is_detached || !w.branch ? path.posix.basename(w.path) : w.branch,
    lobby: w.path === root,
    root,
    checkout: w.path,
  };
}

/** `request(method, params)` is bound to the machine's socket. */
export function createHerdrPlacer(request) {
  const cache = new Map();
  return async function placeOf(cwd) {
    const hit = cache.get(cwd);
    if (hit && Date.now() < hit.until) return hit.place;
    let place;
    let ttl = TTL_MS;
    try {
      place = placeFromWorktrees(cwd, await request("worktree.list", { cwd }));
    } catch (err) {
      place = plain(cwd);
      if (err.code !== "not_git_worktree") {
        console.error(`worktree.list ${cwd}: ${err.code ?? err.message}`);
        ttl = RETRY_MS;
      }
    }
    cache.set(cwd, { until: Date.now() + ttl, place });
    return place;
  };
}
