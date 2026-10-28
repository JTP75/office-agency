// Right-side drawer with one agent's live terminal, plus the "press E" hint.
// Agent text is rendered by React as text (escaped), never as HTML.
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { agentPath, post } from "../net/api";
import { closeDrawer, useOffice } from "../state/store";
import { TerminalView } from "../term/TerminalView";
import { drawerWidth } from "./drawerLayout";

export function AgentDrawer() {
  const drawer = useOffice((s) => s.drawer);
  const agent = useOffice((s) => s.agents.find((a) => a.id === s.drawer?.agentId));
  const typing = useOffice((s) => s.typing);
  const nativeTerminal = useOffice((s) => s.nativeTerminal);
  const [note, setNote] = useState<string | null>(null);

  // Publish the drawer width for CSS (HUD centering); the camera reads the same function.
  useEffect(() => {
    const apply = () => document.documentElement.style.setProperty("--drawer-w", `${drawerWidth(drawer !== null)}px`);
    apply();
    addEventListener("resize", apply);
    return () => removeEventListener("resize", apply);
  }, [drawer !== null]);

  useEffect(() => setNote(null), [drawer?.agentId]);

  if (!drawer) return <NearHint />;
  const id = drawer.agentId;
  const room = agent ? (agent.lobby ? `${agent.project} · lobby` : `${agent.project} @ ${agent.worktree ?? "(no branch)"}`) : "";
  const where = agent?.machine ? `${agent.machine} · ${room}` : room;

  const openNative = () =>
    post(agentPath(id, "open-native"))
      .then(() => setNote(`Opened in ${nativeTerminal}; it now has control`))
      .catch((e: Error) => setNote(e.message));

  const focusInHerdr = () =>
    post(agentPath(id, "focus"))
      // A machine's herdr focuses the pane there; the herdr window shows it once that machine is selected.
      .then((res: { machine?: string }) => setNote(res.machine ? `Focused on ${res.machine}; select it in herdr's sidebar` : "Focused in herdr"))
      .catch((e: Error) => setNote(e.message));

  // The drawer is mounted on E/click before the effect below runs, and while it
  // was closed `--drawer-w` is `0px`. Setting the width here as well means the
  // terminal is laid out (and fitted) at its real size on the first frame
  // instead of opening at xterm's default and resizing the agent's pane a tick
  // later — that mid-open resize is what leaves the TUI reflowing/ghosting.
  const width = { "--drawer-w": `${drawerWidth(true)}px` } as CSSProperties;

  return (
    <aside className="drawer" style={width} aria-label={`Terminal for ${agent?.title || id}`}>
      <header className="action-strip">
        <div className="who">
          <div className="row">
            {agent && <span className={`status-pill ${agent.status}`}>{agent.status}</span>}
            <strong className="title">{agent?.title || id}</strong>
          </div>
          <div className="muted">
            {agent?.kind ?? "agent"} · {where || "session ended"}
          </div>
        </div>
        <div className="actions">
          <button type="button" onClick={focusInHerdr} title="Jump to this agent's pane in herdr">
            herdr ↗
          </button>
          <button
            type="button"
            disabled={!nativeTerminal}
            onClick={openNative}
            title={nativeTerminal ? `Open this agent in ${nativeTerminal} (takes control from the drawer)` : "Native terminals need herdr mode"}
          >
            {nativeTerminal ?? "Native"} ↗
          </button>
          <button type="button" className="close" onClick={closeDrawer} aria-label="Close drawer">
            ✕
          </button>
        </div>
      </header>
      <div className={`typing-bar ${typing ? "on" : ""}`}>
        {typing ? "Typing into the terminal · Ctrl+] or click the office to leave" : "Click the terminal to type · Esc closes"}
        {note && <span className="note"> · {note}</span>}
      </div>
      <TerminalView key={id} agentId={id} />
    </aside>
  );
}

function NearHint() {
  const near = useOffice((s) => s.agents.find((a) => a.id === s.nearAgent));
  if (!near) return null;
  return (
    <div className="hud panel near-hint" role="status">
      Press <kbd>E</kbd> to talk to <strong>{near.title || near.id}</strong>
    </div>
  );
}
