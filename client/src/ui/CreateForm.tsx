// "New agent" and "new worktree" forms for the building you're in (PROTOCOL.md "Create").
// Starting an agent can take a few seconds (the server waits until herdr detects it);
// on success the new agent's drawer opens as soon as it shows up in a snapshot.
import { useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { post } from "../net/api";
import { closeCreateForm, roomKey, roomsIn, store, useOffice, type Room } from "../state/store";

const LAST_KIND = "office.lastKind";

function rememberedKind(kinds: string[]) {
  try {
    const k = localStorage.getItem(LAST_KIND);
    if (k && kinds.includes(k)) return k;
  } catch {}
  return kinds[0] ?? "claude";
}

/** The room you're standing in (or looking at), so "new agent" defaults to it. */
function currentRoom(project: string, rooms: Room[]) {
  const { agents, nearAgent, drawer } = store.getState();
  const here = agents.find((a) => a.project === project && (a.id === nearAgent || a.id === drawer?.agentId));
  const key = here ? roomKey(here) : null;
  return rooms.find((r) => roomKey(r) === key) ?? rooms[0];
}

const roomLabel = (r: Room) => (r.lobby ? `Lobby${r.worktree ? ` (${r.worktree})` : ""}` : r.worktree);

export function CreateForm() {
  const form = useOffice((s) => s.createForm);
  if (!form) return null;
  // Keyed so switching building or form type starts fresh.
  return <CreateFormBody key={`${form.kind}:${form.project}`} kind={form.kind} project={form.project} />;
}

function CreateFormBody({ kind: formKind, project }: { kind: "agent" | "worktree"; project: string }) {
  const agents = useOffice((s) => s.agents);
  const kinds = useOffice((s) => s.kinds);
  const rooms = roomsIn(agents, project);
  const [room, setRoom] = useState(() => {
    const r = currentRoom(project, rooms);
    return r ? roomKey(r) : "";
  });
  const [kind, setKind] = useState(() => rememberedKind(kinds));
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [base, setBase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRepo = rooms.some((r) => r.worktree !== null);
  const target = rooms.find((r) => roomKey(r) === room);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(LAST_KIND, kind);
    } catch {}
    try {
      const agent = { kind, name: name.trim() || undefined };
      const res =
        formKind === "agent"
          ? await post("agents", { project, lobby: target?.lobby ?? false, worktree: target?.worktree ?? null, ...agent })
          : await post("worktrees", { project, branch: branch.trim(), base: base.trim() || undefined, ...agent });
      if (typeof res.agent === "string") store.setState({ openWhenSeen: res.agent });
      closeCreateForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && !busy) {
      e.stopPropagation();
      closeCreateForm();
    }
  }

  const title = formKind === "agent" ? `New agent in ${project}` : `New worktree in ${project}`;
  const blocked = formKind === "worktree" && !isRepo;

  return (
    <div className="hud panel create-form" role="dialog" aria-label={title} onKeyDown={onKeyDown}>
      <form onSubmit={submit}>
        <strong>{title}</strong>
        {formKind === "agent" ? (
          <label>
            Room
            <select value={room} onChange={(e) => setRoom(e.target.value)} disabled={busy}>
              {rooms.map((r) => (
                <option key={roomKey(r)} value={roomKey(r)}>
                  {roomLabel(r)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              Branch
              <input
                autoFocus
                required
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="feat/my-change"
                disabled={busy || blocked}
                spellCheck={false}
              />
            </label>
            <label>
              <span>
                Base <span className="muted">(optional)</span>
              </span>
              <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="current HEAD" disabled={busy || blocked} spellCheck={false} />
            </label>
          </>
        )}
        <label>
          Harness
          <select value={kind} onChange={(e) => setKind(e.target.value)} disabled={busy || blocked} autoFocus={formKind === "agent"}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>
            Name <span className="muted">(optional)</span>
          </span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`automatic (${kind}-N)`} disabled={busy || blocked} spellCheck={false} />
        </label>
        {blocked && <div className="error">{project} isn't a git repo, so it can't have worktrees.</div>}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="row buttons">
          <button type="button" onClick={closeCreateForm} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || blocked || !kinds.length || (formKind === "agent" && !target)}>
            {busy ? "Starting…" : formKind === "agent" ? "Start agent" : "Create worktree"}
          </button>
        </div>
      </form>
    </div>
  );
}
