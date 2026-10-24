// Minimal herdr socket client: newline-delimited JSON over a unix socket.
// See herdr docs "Socket API" (v0.9.3).
//
// Every call takes the socket path, so the same client talks to the local
// server and to a saved SSH machine's server through its forwarded socket
// (sources/machines.mjs).

import net from "node:net";
import os from "node:os";
import path from "node:path";

export const SOCKET_PATH = process.env.HERDR_SOCKET_PATH ?? path.join(os.homedir(), ".config", "herdr", "herdr.sock");

let nextId = 0;

function lines(conn, onLine) {
  let buf = "";
  conn.setEncoding("utf8");
  conn.on("data", (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (line) onLine(JSON.parse(line));
    }
  });
}

// One request, one response, then the connection is closed.
export function request(socketPath, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = `office_${++nextId}`;
    const conn = net.createConnection(socketPath);
    conn.on("error", reject);
    // A forwarded socket accepts the connection even when the remote end is gone;
    // without this the request would wait forever.
    conn.on("close", () => reject(Object.assign(new Error("herdr closed the connection"), { code: "connection_closed" })));
    lines(conn, (msg) => {
      if (msg.id !== id) return;
      conn.destroy();
      msg.error ? reject(Object.assign(new Error(msg.error.message), { code: msg.error.code })) : resolve(msg.result);
    });
    conn.write(JSON.stringify({ id, method, params }) + "\n");
  });
}

// Long-lived subscription. `onEvent` gets each pushed event; `onEnd(err)` fires
// once when the connection ends for any reason (rejected, events_lost, herdr gone).
export function subscribe(socketPath, subscriptions, onEvent, onEnd) {
  const id = `office_sub_${++nextId}`;
  const conn = net.createConnection(socketPath);
  let ended = false;
  const end = (err) => {
    if (ended) return;
    ended = true;
    conn.destroy();
    onEnd(err);
  };
  conn.on("error", end);
  conn.on("close", () => end(null));
  lines(conn, (msg) => {
    if (msg.error) return end(Object.assign(new Error(msg.error.message), { code: msg.error.code }));
    if (msg.result?.type === "subscription_started") return;
    onEvent(msg);
  });
  conn.write(JSON.stringify({ id, method: "events.subscribe", params: { subscriptions } }) + "\n");
  return { close: () => end(null) };
}
