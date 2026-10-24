// Shared rules for the command endpoints (PROTOCOL.md "Commands").
// Sources implement prompt/read/keys/focus; the server validates input here first.

export class CommandError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Keys the browser may press. Enough to answer approval dialogs and menus,
// nothing that can drive a shell (no ctrl chords, no free text).
export const ALLOWED_KEYS = new Set(["esc", "enter", "tab", "shift+tab", "up", "down", "left", "right", "space", "y", "n", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

export const MAX_PROMPT_CHARS = 8000;
export const MAX_READ_LINES = 200;

export function checkPrompt(body) {
  const text = body?.text;
  if (typeof text !== "string" || !text.trim()) throw new CommandError(400, "bad_request", "text must be a non-empty string");
  if (text.length > MAX_PROMPT_CHARS) throw new CommandError(400, "bad_request", `text is over ${MAX_PROMPT_CHARS} characters`);
  return text;
}

export function checkKeys(body) {
  const keys = body?.keys;
  if (!Array.isArray(keys) || !keys.length || keys.length > 10) throw new CommandError(400, "bad_request", "keys must be an array of 1-10 keys");
  const bad = keys.filter((k) => !ALLOWED_KEYS.has(k));
  if (bad.length) throw new CommandError(400, "key_not_allowed", `not allowed: ${bad.join(", ")}`);
  return keys;
}

export function checkLines(raw) {
  const n = raw == null ? 40 : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_READ_LINES) throw new CommandError(400, "bad_request", `lines must be 1-${MAX_READ_LINES}`);
  return n;
}

export const MAX_SCROLL_LINES = 50;

/** A wheel notch for `POST term/scroll`: direction plus an optional cell. */
export function checkTermScroll(body) {
  const direction = body?.direction;
  if (direction !== "up" && direction !== "down") throw new CommandError(400, "bad_request", 'direction must be "up" or "down"');
  const lines = body?.lines == null ? 1 : Number(body.lines);
  if (!Number.isInteger(lines) || lines < 1 || lines > MAX_SCROLL_LINES)
    throw new CommandError(400, "bad_request", `lines must be 1-${MAX_SCROLL_LINES}`);
  const out = { direction, lines };
  for (const k of ["column", "row"]) {
    if (body?.[k] == null) continue;
    const n = Number(body[k]);
    if (!Number.isInteger(n) || n < 0) throw new CommandError(400, "bad_request", `${k} must be a non-negative integer`);
    out[k] = n;
  }
  return out;
}

// Harnesses `herdr agent start --kind` accepts (herdr 0.9.3).
export const AGENT_KINDS = ["claude", "codex", "opencode", "gemini", "cursor", "copilot", "amp", "pi", "devin", "agy", "cline", "omp", "mastracode", "kimi", "kiro", "droid", "grok", "hermes", "kilo", "qodercli", "qwen", "letta", "maki", "muse"];

// herdr's rule for agent names: `[a-z][a-z0-9_-]{0,31}`, unique among live agents.
const AGENT_NAME = /^[a-z][a-z0-9_-]{0,31}$/;

function checkKindAndName(body) {
  const kind = body?.kind;
  if (!AGENT_KINDS.includes(kind)) throw new CommandError(400, "bad_request", `kind must be one of: ${AGENT_KINDS.join(", ")}`);
  const name = body?.name == null || body.name === "" ? null : body.name;
  if (name !== null && (typeof name !== "string" || !AGENT_NAME.test(name)))
    throw new CommandError(400, "bad_request", "name must be lowercase letters, digits, - or _, starting with a letter (max 32)");
  return { kind, name };
}

function checkProject(body) {
  if (typeof body?.project !== "string" || !body.project) throw new CommandError(400, "bad_request", "project must be a non-empty string");
  return body.project;
}

/** `POST /api/agents`: a new agent in an existing room (the lobby, or a worktree by branch). */
export function checkSpawn(body) {
  const project = checkProject(body);
  const lobby = body?.lobby === true;
  const worktree = lobby ? null : body?.worktree;
  if (!lobby && (typeof worktree !== "string" || !worktree)) throw new CommandError(400, "bad_request", "pass lobby: true or a worktree");
  return { project, lobby, worktree, ...checkKindAndName(body) };
}

// Enough to keep obviously broken names away from git; git has the final say.
function checkRef(ref, what) {
  if (typeof ref !== "string" || !ref || ref.length > 200 || /[\s~^:?*[\\]|\.\.|^[-/]|[/.]$|@\{/.test(ref))
    throw new CommandError(400, "bad_request", `${what} is not a valid git ref name`);
  return ref;
}

/** `POST /api/worktrees`: a new worktree (room) in a project, with its first agent. */
export function checkWorktree(body) {
  const project = checkProject(body);
  const branch = checkRef(body?.branch, "branch");
  const base = body?.base == null || body.base === "" ? null : checkRef(body.base, "base");
  return { project, branch, base, ...checkKindAndName(body) };
}

/** `name`, or the first free `<kind>-<n>`. */
export function pickName(kind, name, taken) {
  if (name) {
    if (taken.has(name)) throw new CommandError(409, "name_taken", `an agent named ${name} is already running`);
    return name;
  }
  for (let n = 1; ; n++) if (!taken.has(`${kind}-${n}`)) return `${kind}-${n}`;
}
