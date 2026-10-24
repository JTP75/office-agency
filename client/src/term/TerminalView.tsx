// The agent's live terminal (PROTOCOL.md "Terminal"): frames stream in over SSE,
// keystrokes go out over POST. The terminal is sized to fit the drawer and the
// agent's pane follows that size while we're connected.
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { agentPath, apiUrl, post } from "../net/api";
import { store } from "../state/store";
import { typedInput } from "./termInput";
import { cellAt, notchesFor, scrollCommand } from "./wheel";

type Frame = { type: "frame"; full: boolean; width: number; height: number; bytes: string };
type Closed = { type: "closed"; reason: string };

const THEME = {
  background: "#0d0e12",
  foreground: "#e6e6e6",
  cursor: "#ffd54f",
  selectionBackground: "#3a3f4b",
};

// The server will not open a session below this (POST term/resize has the same limit).
const MIN_COLS = 20;
const MIN_ROWS = 5;

function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Reads a fetch() SSE body and calls `onEvent` with each parsed `data:` payload. */
async function readEvents(res: Response, onEvent: (ev: Frame | Closed) => void) {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += value;
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (chunk.startsWith("data: ")) onEvent(JSON.parse(chunk.slice(6)));
    }
  }
}

function describe(reason: string) {
  if (reason === "agent gone") return "This agent's session ended.";
  if (/taken over/.test(reason)) return "Control moved to another window (a native terminal or another tab). Reconnect to take it back.";
  return `Terminal closed: ${reason}`;
}

export function TerminalView({ agentId }: { agentId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [ended, setEnded] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // One silent re-attach when another window takes control mid-session (e.g. the
  // pane is resized/reattached by herdr). Never loops: one retry per open.
  const retried = useRef(false);

  useEffect(() => {
    retried.current = false;
  }, [agentId]);

  useEffect(() => {
    const el = host.current!;
    setEnded(null);
    const term = new Terminal({
      fontFamily: 'ui-monospace, Menlo, "SF Mono", Consolas, monospace',
      fontSize: 13,
      // Explicit line height: block and half-block art (OpenCode's logo, its box
      // separators and the ▀ rule under the prompt) lines up cell-for-cell
      // instead of leaving a gap between rows.
      lineHeight: 1,
      letterSpacing: 0,
      theme: THEME,
      cursorBlink: true,
      scrollback: 0, // the agent's TUI owns its own history; we mirror its screen
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

    const abort = new AbortController();
    let live = true;
    const end = (reason: string) => {
      if (live) setEnded(reason);
      live = false;
    };

    // Leave the terminal (back to walking) with Ctrl+]; a click on the office works too.
    term.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.code === "BracketRight") {
        if (e.type === "keydown") term.blur();
        return false;
      }
      return true;
    });
    const onFocus = () => store.setState({ typing: true });
    const onBlur = () => store.setState({ typing: false });
    term.textarea?.addEventListener("focus", onFocus);
    term.textarea?.addEventListener("blur", onBlur);

    // Keystrokes: batch what arrives within one animation frame into one POST.
    let pending = "";
    let flushQueued = false;
    const flush = () => {
      flushQueued = false;
      const text = pending;
      pending = "";
      if (text && live) post(agentPath(agentId, "term/input"), { text }).catch(() => {});
    };
    const typed = term.onData((d) => {
      // onData also carries xterm's replies to terminal queries; those are not
      // keystrokes and must never be typed into the agent.
      const text = typedInput(d);
      if (!text) return;
      pending += text;
      if (!flushQueued) {
        flushQueued = true;
        requestAnimationFrame(flush);
      }
    });

    // The wheel scrolls the agent's TUI, not the prompt history. xterm would
    // otherwise turn it into arrow keys in the alternate screen (PROTOCOL.md
    // "Terminal": term/scroll). Always handled here, so no arrows are emitted.
    let carry = 0;
    term.attachCustomWheelEventHandler((ev) => {
      const step = notchesFor(ev.deltaY, ev.deltaMode, carry);
      carry = step.carry;
      if (step.notches && live) {
        const { column, row } = cellAt(ev.clientX, ev.clientY, el.getBoundingClientRect(), term.cols, term.rows);
        post(agentPath(agentId, "term/scroll"), scrollCommand(step.notches, column, row)).catch(() => {});
      }
      return false;
    });

    // Refit when the drawer or window changes size, and tell the agent's pane.
    let resizeTimer = 0;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const dims = fit.proposeDimensions();
        if (!dims || !live || (dims.cols === term.cols && dims.rows === term.rows)) return;
        fit.fit();
        post(agentPath(agentId, "term/resize"), { cols: term.cols, rows: term.rows }).catch(() => {});
      }, 120);
    });
    observer.observe(el);

    // Open at a size the server accepts even if the drawer has not been laid out
    // yet; a later ResizeObserver pass resizes it.
    const cols = term.cols >= MIN_COLS ? term.cols : 80;
    const rows = term.rows >= MIN_ROWS ? term.rows : 24;

    (async () => {
      try {
        const res = await fetch(apiUrl(agentPath(agentId, "term"), { cols, rows }), { signal: abort.signal });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return end(body.message ?? `couldn't open terminal (${res.status})`);
        }
        term.focus(); // control immediately
        await readEvents(res, (ev) => {
          if (ev.type === "closed") {
            if (/taken over/.test(ev.reason) && !retried.current) {
              retried.current = true;
              setAttempt((n) => n + 1); // silent: re-take control without the overlay
              return;
            }
            return end(ev.reason);
          }
          // Another viewer may have resized the shared session.
          if (ev.width !== term.cols || ev.height !== term.rows) term.resize(ev.width, ev.height);
          term.write(b64ToBytes(ev.bytes));
        });
        end("connection closed");
      } catch (err) {
        if (!abort.signal.aborted) end(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      live = false;
      abort.abort(); // closing the stream releases the session on the server
      observer.disconnect();
      clearTimeout(resizeTimer);
      typed.dispose();
      term.textarea?.removeEventListener("focus", onFocus);
      term.textarea?.removeEventListener("blur", onBlur);
      term.dispose();
      store.setState({ typing: false });
    };
  }, [agentId, attempt]);

  const reconnect = () => {
    retried.current = false;
    setAttempt((n) => n + 1);
  };

  return (
    <div className="term">
      <div className="term-host" ref={host} />
      {ended && (
        <div className="term-overlay" role="status">
          <p>{describe(ended)}</p>
          {ended !== "agent gone" && (
            <button type="button" onClick={reconnect}>
              Reconnect
            </button>
          )}
        </div>
      )}
    </div>
  );
}
