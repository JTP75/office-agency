// Screen-fixed UI over the canvas. Agent text is rendered by React as text (escaped), never as HTML.
import type { MouseEvent } from "react";
import { STATUSES, type AgentStatus } from "../net/protocol";
import { districtsOf, nextBlocked, openAgent, openCreateForm, requestTravel, useOffice, type Location } from "../state/store";

const STATUS_CSS: Record<AgentStatus, string> = {
  working: "#4caf50",
  idle: "#9e9e9e",
  blocked: "#f44336",
  done: "#2196f3",
  unknown: "#7e57c2",
};

function same(a: Location, b: Location) {
  return a.kind === b.kind && (a.kind === "street" || (b.kind === "building" && a.project === b.project));
}

function blur(e: MouseEvent<HTMLButtonElement>) {
  // Hand the keyboard back to the game after clicking a tab.
  e.currentTarget.blur();
}

export function Hud() {
  const agents = useOffice((s) => s.agents);
  const projects = useOffice((s) => s.projects);
  const projectMachine = useOffice((s) => s.projectMachine);
  const machines = useOffice((s) => s.machines);
  const source = useOffice((s) => s.source);
  const connection = useOffice((s) => s.connection);
  const location = useOffice((s) => s.location);
  const renderer = useOffice((s) => s.renderer);

  const counts = Object.fromEntries(STATUSES.map((st) => [st, 0])) as Record<AgentStatus, number>;
  for (const a of agents) counts[a.status]++;

  const here = location.kind === "street" ? "On the street" : `Inside ${location.project}`;
  const districts = districtsOf(projects, projectMachine, machines);

  const projectTab = (p: string) => {
    const inside = agents.filter((a) => a.project === p);
    const blocked = inside.filter((a) => a.status === "blocked").length;
    const to: Location = { kind: "building", project: p };
    const active = same(location, to);
    return (
      <span key={p} className="tab-group">
        <button
          type="button"
          aria-pressed={active}
          className={active ? "active" : ""}
          onClick={(e) => {
            blur(e);
            requestTravel(to);
          }}
          aria-label={`${p}: ${inside.length} agents${blocked ? `, ${blocked} blocked` : ""}`}
        >
          {p} <span className="n">{inside.length}</span>
        </button>
        {blocked > 0 && (
          <button
            type="button"
            className="blocked-badge"
            title={`Open the next blocked agent in ${p}`}
            aria-label={`Open the next blocked agent in ${p}`}
            onClick={(e) => {
              blur(e);
              const next = nextBlocked(p);
              if (next) openAgent(next.id, "hud");
            }}
          >
            !{blocked}
          </button>
        )}
      </span>
    );
  };

  return (
    <>
      <section className="hud panel status" aria-label="Agent status summary">
        <div className="row">
          {source === "fixture" && <span className="badge fixture">FIXTURE</span>}
          {source && source !== "fixture" && <span className="badge live">{source}</span>}
          <span>{agents.length} agents</span>
          <span className={`conn ${connection}`}>{connection === "live" ? "● live" : connection}</span>
        </div>
        <ul className="counts">
          {STATUSES.map((st) => (
            <li key={st} className={st === "blocked" && counts[st] ? "loud" : ""}>
              <span className="dot" style={{ background: STATUS_CSS[st] }} aria-hidden="true" />
              {st} {counts[st]}
            </li>
          ))}
        </ul>
        {machines.length > 0 && (
          <ul className="machines" aria-label="Machines">
            {machines.map((m) => (
              <li key={m.id} className={`machine ${m.status}`}>
                <span className="dot" aria-hidden="true" />
                {m.label} <span className="muted">{m.status}</span>
                {m.status !== "online" && m.message && <div className="machine-message">{m.message}</div>}
              </li>
            ))}
          </ul>
        )}
        <div className="muted">
          {here} · {renderer}
        </div>
        {location.kind === "building" && (
          <div className="row create-bar" role="group" aria-label={`Create in ${location.project}`}>
            <button
              type="button"
              onClick={(e) => {
                blur(e);
                openCreateForm({ kind: "agent", project: location.project });
              }}
              title="Start a new agent in one of this building's rooms"
            >
              + Agent
            </button>
            <button
              type="button"
              onClick={(e) => {
                blur(e);
                openCreateForm({ kind: "worktree", project: location.project });
              }}
              title="Create a git worktree (a new room) with an agent in it"
            >
              + Worktree
            </button>
          </div>
        )}
      </section>

      <nav className="hud tabs" aria-label="Buildings">
        <button
          type="button"
          aria-pressed={location.kind === "street"}
          className={location.kind === "street" ? "active" : ""}
          onClick={(e) => {
            blur(e);
            requestTravel({ kind: "street" });
          }}
        >
          Street
        </button>
        {districts.length > 1
          ? districts.map((d) => (
              <span key={d.machine ?? "\u0000local"} className="district" role="group" aria-label={`${d.label} machine`}>
                <span className={`district-label ${d.status ?? "local"}`} title={d.message ?? d.status ?? "this machine"}>
                  {d.label}
                  {d.status && d.status !== "online" ? ` · ${d.status}` : ""}
                </span>
                {d.projects.map(projectTab)}
              </span>
            ))
          : projects.map(projectTab)}
      </nav>

      <footer className="hud panel hint">
        WASD / arrows walk · doors enter and leave · <kbd>E</kbd> or click an agent to talk · <kbd>B</kbd> next blocked
      </footer>

      {connection === "no-token" && (
        <div className="hud panel notice" role="alert">
          No token in the URL. Open the link the server prints (<code>?t=…</code>), or use <code>?t=dev</code> with{" "}
          <code>OFFICE_TOKEN=dev</code>.
        </div>
      )}
      {connection === "retrying" && (
        <div className="hud panel notice" role="status">
          Can't reach the office server; retrying…
        </div>
      )}
      {connection === "live" && projects.length === 0 && (
        <div className="hud panel notice" role="status">
          No agents yet. Buildings appear as agents start.
        </div>
      )}
    </>
  );
}
