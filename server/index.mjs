// Office server: serves the client and relays agent state over SSE.
// Zero dependencies on purpose: the plugin runs from a raw checkout.
// In herdr it runs as a background daemon started by scripts/open.mjs.
//
//   node server/index.mjs                  # real agents from herdr
//   node server/index.mjs --source fixture # fake agents, no herdr needed
//     --scenario default|empty|crowded|churn  (fixture only)
//     --port-fallback                         try the next ports if busy (the daemon uses this)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createHerdrSource } from "./sources/herdr.mjs";
import { createFixtureSource } from "./sources/fixture.mjs";
import { SOCKET_PATH } from "./herdr.mjs";
import { openBrowser } from "./browser.mjs";
import { readOffice, pickPort, writeOffice, onShutdown, shutdown } from "./lifecycle.mjs";
import { CommandError, checkKeys, checkLines, checkPrompt, checkTermScroll } from "./sources/commands.mjs";
import { createTermHub } from "./term/hub.mjs";
import { nativeTerminal } from "./term/herdr-term.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The client is served from its Vite build. Checked per request, so building
// while the server runs just works.
const CLIENT_DIR = path.join(ROOT, "client", "dist");
const NOT_BUILT = `<!doctype html><meta charset="utf-8"><title>Office Agency</title>
<body style="font:15px system-ui;max-width:40em;margin:3em auto;padding:0 1em">
<h1>The office client isn't built yet</h1>
<p>Run this in the plugin directory, then reload:</p>
<pre>npm --prefix client ci &amp;&amp; npm --prefix client run build</pre>
<p>Working on the client? Use the Vite dev server instead (see FRONTEND_HANDOFF.md).</p>`;
const HOST = "127.0.0.1";
const TOKEN = process.env.OFFICE_TOKEN ?? crypto.randomBytes(16).toString("hex");

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const sourceName = flag("--source") ?? (process.env.HERDR_ENV ? "herdr" : "fixture");
const scenario = flag("--scenario") ?? process.env.OFFICE_SCENARIO ?? "default";

const running = readOffice();
if (running) {
  console.log(`office already running (pid ${running.pid}) at ${running.url}`);
  process.exit(0);
}

const source =
  sourceName === "herdr" ? createHerdrSource({ onDead: () => shutdown("herdr went away") }) : createFixtureSource({ scenario });
onShutdown(() => source.close());
const terms = createTermHub(source);
onShutdown(() => terms.closeAll());

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const clients = new Set();
let latest = { type: "snapshot", agents: [] };

source.subscribe((snapshot) => {
  latest = snapshot;
  const frame = `data: ${JSON.stringify(snapshot)}\n\n`;
  for (const res of clients) res.write(frame);
});

function authorized(url) {
  return url.searchParams.get("t") === TOKEN;
}

function serveStatic(url, res) {
  if (!fs.existsSync(CLIENT_DIR)) return res.writeHead(503, { "content-type": "text/html; charset=utf-8" }).end(NOT_BUILT);
  const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const file = path.resolve(CLIENT_DIR, rel);
  if (!file.startsWith(CLIENT_DIR + path.sep)) return notFound(res);
  fs.readFile(file, (err, body) => {
    if (err) return notFound(res);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  });
}

function notFound(res) {
  res.writeHead(404).end("not found");
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 64 * 1024) {
        reject(new CommandError(413, "too_large", "body over 64 KB"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new CommandError(400, "bad_request", "body is not JSON"));
      }
    });
  });
}

function termSize(get) {
  const cols = Number(get("cols"));
  const rows = Number(get("rows"));
  if (!Number.isInteger(cols) || cols < 20 || cols > 300 || !Number.isInteger(rows) || rows < 5 || rows > 120)
    throw new CommandError(400, "bad_request", "cols must be 20-300 and rows 5-120");
  return { cols, rows };
}

function checkTermInput(body) {
  if (typeof body?.text === "string" && body.text) return { text: body.text };
  if (typeof body?.bytes === "string" && body.bytes) return { bytes: body.bytes };
  throw new CommandError(400, "bad_request", "send { text } or { bytes } (base64)");
}

function knownAgent(id) {
  if (!source.has(id)) throw new CommandError(404, "agent_not_found", `agent ${id} not found`);
  return id;
}

// /api/agents/:id/<verb>. Only these verbs reach herdr.
const COMMANDS = {
  "POST prompt": async (id, req) => source.prompt(id, checkPrompt(await readBody(req))),
  "GET read": async (id, req, url) => ({ lines: await source.read(id, checkLines(url.searchParams.get("lines"))) }),
  "POST keys": async (id, req) => source.keys(id, checkKeys(await readBody(req))),
  "POST focus": async (id) => source.focus(id),
  "POST open-native": async (id) => {
    if (!source.openNative) throw new CommandError(501, "not_supported", "native terminals need herdr mode");
    return source.openNative(knownAgent(id));
  },
  // Live terminal (PROTOCOL.md "Terminal"). The stream itself is GET term, handled below.
  "POST term/input": async (id, req) => terms.input(knownAgent(id), checkTermInput(await readBody(req))),
  "POST term/resize": async (id, req) => {
    const body = await readBody(req);
    const { cols, rows } = termSize((k) => body?.[k]);
    terms.resize(knownAgent(id), cols, rows);
  },
  // The wheel. herdr delivers it to the app as a mouse-wheel event when the app
  // asked for mouse reporting (and drops it otherwise), so it scrolls the TUI
  // instead of becoming an arrow key.
  "POST term/scroll": async (id, req) => terms.scroll(knownAgent(id), checkTermScroll(await readBody(req))),
};

// SSE stream of one agent's terminal. Errors are reported as JSON before the
// stream starts, so the client can tell "can't open" from "closed later".
function openTerm(req, res, url, rawId) {
  try {
    const id = knownAgent(decodeURIComponent(rawId));
    terms.join(id, termSize((k) => url.searchParams.get(k)), req, res);
  } catch (err) {
    if (!(err instanceof CommandError)) console.error(err);
    json(res, err.status ?? 500, { error: err.code ?? "internal", message: err.message });
  }
}

async function command(req, res, url) {
  const m = url.pathname.match(/^\/api\/agents\/([^/]+)\/([a-z-]+(?:\/[a-z-]+)?)$/);
  if (m && req.method === "GET" && m[2] === "term") return openTerm(req, res, url, m[1]);
  const handler = m && COMMANDS[`${req.method} ${m[2]}`];
  if (!handler) return json(res, 404, { error: "not_found", message: `no route ${req.method} ${url.pathname}` });
  try {
    const result = await handler(decodeURIComponent(m[1]), req, url);
    json(res, 200, { ok: true, ...result });
  } catch (err) {
    if (!(err instanceof CommandError)) console.error(err);
    json(res, err.status ?? 500, { error: err.code ?? "internal", message: err.message });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    if (!authorized(url)) return res.writeHead(401).end("bad token");

    if (url.pathname === "/api/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify(latest)}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    // Lets the client tell "server down" (network error) from "server restarted
    // with a new token" (401), which EventSource can't distinguish.
    if (url.pathname === "/api/ping")
      return json(res, 200, { ok: true, source: sourceName, nativeTerminal: sourceName === "herdr" ? (nativeTerminal()?.label ?? null) : null });
    if (url.pathname.startsWith("/api/agents/")) return command(req, res, url);
    return notFound(res);
  }

  serveStatic(url, res);
});

const port = await pickPort(HOST, args.includes("--port-fallback"));
server.listen(port, HOST, () => {
  const url = `http://${HOST}:${port}/?t=${TOKEN}`;
  writeOffice({ url, token: TOKEN, pid: process.pid, port, source: sourceName, socket: sourceName === "herdr" ? SOCKET_PATH : null });
  console.log(`office (${sourceName}) at ${url}`);
  if (!args.includes("--no-open")) openBrowser(url);
});
