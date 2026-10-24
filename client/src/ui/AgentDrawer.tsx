// Right-side drawer with one agent's live terminal, plus the "press E" hint.
// Agent text is rendered by React as text (escaped), never as HTML.
import { useEffect, useState } from "react";
import { agentPath, post } from "../net/api";
import { closeDrawer, useOffice } from "../state/store";
import { TerminalView } from "../term/TerminalView";
import { drawerWidth } from "./drawerLayout";

export function AgentDrawer() {
  const drawer = useOffice((s) => s.drawer);
  const agent = useOffice((s) => s.agents.find((a) => a.id === s.drawer?.agentId));
  const typing = useOffice((s) => s.typing);
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
  const where = agent ? (agent.lobby ? `${agent.project} · lobby` : `${agent.project} @ ${agent.worktree ?? "(no branch)"}`) : "";

  const focusInHerdr = () =>
    post(agentPath(id, "focus"))
      .then(() => setNote("Focused in herdr"))
      .catch((e: Error) => setNote(e.message));

  return (
    <aside className="drawer" aria-label={`Terminal for ${agent?.title || id}`}>
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
          <button type="button" disabled title="Open in a native terminal: arrives with the live herdr connection">
            Ghostty ↗
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
