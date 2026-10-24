// One live terminal session per agent, shared by every browser viewer.
//
// Sources implement the terminal contract:
//   openTerminal(id, { cols, rows }, { onFrame, onClosed })
//     → { input, resize, scroll, release }
//   onFrame({ full, width, height, bytes /* base64 ANSI */ }), onClosed(reason)
//
// The first viewer opens the session at its size; later viewers join and get a
// replay (the latest full frame plus the diffs after it). When the last viewer
// leaves the session stays alive for a moment before it is released: a drawer
// that closes and reopens (E, a remount, a reload) reuses the same session
// instead of opening a second control process — two of those fight over the
// pane and the loser sees "taken over".

import { CommandError } from "../sources/commands.mjs";

const MAX_REPLAY = 500;
/** How long an unwatched session is kept, so a quick reopen doesn't restart it. */
const RELEASE_LINGER_MS = 2000;

export function createTermHub(source, { releaseLingerMs = RELEASE_LINGER_MS } = {}) {
  const sessions = new Map(); // agent id → { handle, viewers: Set<res>, replay: frame[], timer }

  function send(res, event) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  function clearRelease(session) {
    clearTimeout(session.timer);
    session.timer = null;
  }

  function end(id, session) {
    if (sessions.get(id) !== session) return;
    sessions.delete(id);
    clearRelease(session);
    for (const res of session.viewers) res.end();
    session.viewers.clear();
  }

  function scheduleRelease(id, session) {
    clearRelease(session);
    session.timer = setTimeout(() => {
      session.timer = null;
      if (sessions.get(id) !== session || session.viewers.size) return;
      sessions.delete(id);
      session.handle.release();
    }, releaseLingerMs);
    session.timer.unref?.();
  }

  function open(id, size) {
    if (!source.openTerminal) throw new CommandError(501, "not_implemented", "this source has no terminal");
    const session = { handle: null, viewers: new Set(), replay: [], timer: null };
    sessions.set(id, session);
    try {
      session.handle = source.openTerminal(id, size, {
        onFrame(frame) {
          if (frame.full) session.replay = [];
          if (session.replay.length < MAX_REPLAY) session.replay.push(frame);
          for (const res of session.viewers) send(res, { type: "frame", ...frame });
        },
        onClosed(reason) {
          for (const res of session.viewers) send(res, { type: "closed", reason });
          end(id, session);
        },
      });
    } catch (err) {
      sessions.delete(id);
      throw err;
    }
    return session;
  }

  function get(id) {
    const session = sessions.get(id);
    if (!session) throw new CommandError(409, "no_session", `no open terminal for ${id}; open GET /api/agents/${id}/term first`);
    return session;
  }

  return {
    // Attach an SSE response. Throws (before any SSE headers) if the terminal can't open.
    join(id, size, req, res) {
      let session = sessions.get(id);
      if (session) {
        clearRelease(session); // a viewer came back before the linger ran out
        session.handle.resize(size.cols, size.rows); // the newest viewer's size wins
      } else session = open(id, size);

      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      for (const frame of session.replay) send(res, { type: "frame", ...frame });
      session.viewers.add(res);

      req.on("close", () => {
        if (!session.viewers.delete(res)) return;
        if (session.viewers.size === 0 && sessions.get(id) === session) scheduleRelease(id, session);
      });
    },
    input: (id, data) => get(id).handle.input(data),
    resize: (id, cols, rows) => get(id).handle.resize(cols, rows),
    scroll(id, data) {
      const handle = get(id).handle;
      if (!handle.scroll) throw new CommandError(501, "not_implemented", "this source cannot scroll");
      return handle.scroll(data);
    },
    closeAll() {
      for (const [id, session] of sessions) {
        clearRelease(session);
        session.handle.release();
        end(id, session);
      }
    },
  };
}
