// A small fake agent TUI for fixture mode, so the terminal drawer can be built
// and demoed without herdr. Every change re-renders the whole screen as one
// full frame; that's plenty for a fixture.
//
//   claude · office-agency @ fix/auth · blocked     ← header (inverse)
//   ───────────────────────────────────────────
//   > Fix flaky auth test                           ← transcript (the agent's history)
//   Reading files…
//   ╭ Allow edit to src/auth.ts? ──────────╮        ← dialog, only while blocked
//   │ ❯ 1. Yes   2. No   Esc to cancel     │
//   ───────────────────────────────────────────
//   ❯ what you are typing▌                          ← prompt line
//   fixture terminal · Enter sends · Ctrl+] leaves  ← footer (dim)

const ESC = "\x1b";
const STATUS_SGR = { working: "32", idle: "90", blocked: "31", done: "34", unknown: "35" };

export class FakeTerm {
  constructor({ cols, rows, agent, history, prompt, keys, onFrame, onClosed }) {
    Object.assign(this, { cols, rows, agent, history, prompt, keys, onFrame, onClosed });
    this.buffer = "";
    this.closed = false;
    setImmediate(() => this.render()); // after the hub has stored our handle
  }

  // ---- terminal contract ----------------------------------------------------------

  input({ text, bytes }) {
    const s = text ?? Buffer.from(bytes ?? "", "base64").toString("utf8");
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === ESC) {
        if (s[i + 1] === "[" || s[i + 1] === "O") {
          // Skip arrow keys and other escape sequences.
          let j = i + 2;
          while (j < s.length && !/[A-Za-z~]/.test(s[j])) j++;
          i = j;
        } else this.key("esc");
      } else if (ch === "\r" || ch === "\n") this.key("enter");
      else if (ch === "\x7f" || ch === "\b") this.buffer = this.buffer.slice(0, -1);
      else if (ch === "\x03") this.buffer = "";
      else if (ch >= " ") this.typed(ch);
    }
    this.render();
  }

  resize(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.render();
  }

  release() {
    this.closed = true;
  }

  // ---- fixture hooks ----------------------------------------------------------------

  /** The agent changed (status, title) or left (null). */
  refresh(agent) {
    if (this.closed) return;
    if (!agent) {
      this.closed = true;
      this.onClosed("agent gone");
      return;
    }
    this.agent = agent;
    this.render();
  }

  // ---- input handling -------------------------------------------------------------

  typed(ch) {
    if (this.agent.status === "blocked" && ["1", "2", "y", "n"].includes(ch)) return this.answer(ch === "1" || ch === "y" ? "1" : "2");
    this.buffer += ch;
  }

  key(name) {
    if (this.agent.status === "blocked") {
      if (name === "enter") this.answer("1");
      else if (name === "esc") this.answer("esc");
      return;
    }
    if (name !== "enter" || !this.buffer.trim()) return;
    const text = this.buffer;
    this.buffer = "";
    this.prompt(text).catch((err) => this.history().push(`! ${err.message}`));
  }

  answer(key) {
    this.keys([key]).catch(() => {});
  }

  // ---- rendering ------------------------------------------------------------------

  render() {
    if (this.closed) return;
    const { cols, rows, agent } = this;
    const fit = (s) => [...s].slice(0, cols).join("");
    const pad = (s) => fit(s) + " ".repeat(Math.max(0, cols - [...fit(s)].length));
    const rule = "─".repeat(cols);

    const where = agent.lobby ? agent.project : `${agent.project} @ ${agent.worktree}`;
    const header = `${ESC}[7m${pad(` ${agent.kind} · ${where} · `)}${ESC}[0m`;
    const statusTag = `${ESC}[1;${STATUS_SGR[agent.status] ?? "37"}m${agent.status}${ESC}[0m`;

    const dialog =
      agent.status === "blocked"
        ? [`╭ Allow edit to src/auth.ts? `, `│ ${ESC}[1m❯ 1. Yes${ESC}[0m   2. No   Esc to cancel`, "╰"]
        : agent.status === "working"
          ? [`${ESC}[33m✻ Working…${ESC}[0m`]
          : [];
    const bodyRows = Math.max(1, rows - 5 - dialog.length);
    const transcript = this.history()
      .flatMap((line) => wrap(line, cols))
      .slice(-bodyRows);
    while (transcript.length < bodyRows) transcript.unshift("");

    const promptLine = `${ESC}[1m❯${ESC}[0m ${this.buffer}`;
    const footer = `${ESC}[2m${fit("fixture terminal · Enter sends · Ctrl+] leaves")}${ESC}[0m`;

    const lines = [header, `${ESC}[90m${rule}${ESC}[0m`, ...transcript.map(fit), ...dialog.map((d) => fit(d)), `${ESC}[90m${rule}${ESC}[0m`, promptLine, footer];
    // Status sits at the end of the header line.
    const headerCol = [...` ${agent.kind} · ${where} · `].length + 1;

    let out = `${ESC}[?2026h${ESC}[?25l${ESC}[2J${ESC}[H`;
    out += lines.slice(0, rows).join("\r\n");
    if (headerCol < cols) out += `${ESC}[1;${headerCol}H${ESC}[7m${statusTag}${ESC}[0m`;
    const cursorRow = Math.min(rows, lines.length - 1);
    const cursorCol = Math.min(cols, 3 + [...this.buffer].length);
    out += `${ESC}[${cursorRow};${cursorCol}H${ESC}[?25h${ESC}[?2026l`;

    this.onFrame({ full: true, width: cols, height: rows, bytes: Buffer.from(out, "utf8").toString("base64") });
  }
}

function wrap(line, cols) {
  const chars = [...line];
  if (chars.length <= cols) return [line];
  const out = [];
  for (let i = 0; i < chars.length; i += cols) out.push(chars.slice(i, i + cols).join(""));
  return out;
}
