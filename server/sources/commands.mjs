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
