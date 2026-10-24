// The agent's live terminal (PROTOCOL.md "Terminal"): frames stream in over SSE,
// keystrokes go out over POST. The terminal is sized to fit the drawer and the
// agent's pane follows that size while we're connected.
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { agentPath, apiUrl, post } from "../net/api";
import { store } from "../state/store";

type Frame = { type: "frame"; full: boolean; width: number; height: number; bytes: string };
type Closed = { type: "closed"; reason: string };

const THEME = {
  background: "#0d0e12",
  foreground: "#e6e6e6",
  cursor: "#ffd54f",
  selectionBackground: "#3a3f4b",
};

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

export function TerminalView({ agentId }: { agentId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [ended, setEnded] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const el = host.current!;
    setEnded(null);
    const term = new Terminal({
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
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
      pending += d;
      if (!flushQueued) {
        flushQueued = true;
        requestAnimationFrame(flush);
      }
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

    (async () => {
      try {
        const res = await fetch(apiUrl(agentPath(agentId, "term"), { cols: term.cols, rows: term.rows }), { signal: abort.signal });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return end(body.message ?? `couldn't open terminal (${res.status})`);
        }
        term.focus(); // control immediately
        await readEvents(res, (ev) => {
          if (ev.type === "closed") return end(ev.reason);
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

  return (
    <div className="term">
      <div className="term-host" ref={host} />
      {ended && (
        <div className="term-overlay" role="status">
          <p>{ended === "agent gone" ? "This agent's session ended." : `Terminal closed: ${ended}`}</p>
          {ended !== "agent gone" && (
            <button type="button" onClick={() => setAttempt((n) => n + 1)}>
              Reconnect
            </button>
          )}
        </div>
      )}
    </div>
  );
}
