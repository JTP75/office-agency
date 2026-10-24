// Resolve an agent's cwd to { project, worktree, lobby }.
// project = repo name (shared by all its worktrees), worktree = branch,
// lobby = true for the main checkout or a non-git directory.
// root = the repo (or plain directory) path, used only to tell apart projects
// that share a name; it is not sent to the client.

import path from "node:path";
import { execFile } from "node:child_process";

const TTL_MS = 30_000;
const cache = new Map();

function git(cwd, args) {
  return new Promise((resolve) => {
    execFile("git", ["-C", cwd, ...args], (err, stdout) => resolve(err ? null : stdout.trim().split("\n")));
  });
}

export async function placeOf(cwd) {
  const hit = cache.get(cwd);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.place;

  const out = await git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir", "--show-toplevel", "--abbrev-ref", "HEAD"]);
  let place;
  if (!out) {
    place = { project: path.basename(cwd), worktree: null, lobby: true, root: cwd };
  } else {
    const [commonDir, toplevel, branch] = out;
    const root = path.dirname(commonDir);
    place = {
      project: path.basename(root),
      worktree: branch === "HEAD" ? path.basename(toplevel) : branch,
      lobby: toplevel === root,
      root,
    };
  }
  cache.set(cwd, { at: Date.now(), place });
  return place;
}
