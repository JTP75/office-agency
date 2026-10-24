// Office server: serves the client and relays agent state over SSE.
// Zero dependencies on purpose: the plugin runs from a raw checkout.
//
//   node server/index.mjs                  # real agents from herdr
//   node server/index.mjs --source fixture # fake agents, no herdr needed

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHerdrSource } from "./sources/herdr.mjs";
import { createFixtureSource } from "./sources/fixture.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// A built client (client/dist) wins over the raw source directory.
const CLIENT_DIR = [path.join(ROOT, "client", "dist"), path.join(ROOT, "client")].find((d) => fs.existsSync(d));
const STATE_DIR = process.env.HERDR_PLUGIN_STATE_DIR ?? path.join(ROOT, ".state");
const HOST = "127.0.0.1";
const PORT = Number(process.env.OFFICE_PORT ?? 4567);
const TOKEN = process.env.OFFICE_TOKEN ?? crypto.randomBytes(16).toString("hex");

const args = process.argv.slice(2);
const sourceName = args.includes("--source") ? args[args.indexOf("--source") + 1] : process.env.HERDR_ENV ? "herdr" : "fixture";
const source = sourceName === "herdr" ? createHerdrSource() : createFixtureSource();

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
    return notFound(res);
  }

  serveStatic(url, res);
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/?t=${TOKEN}`;
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(path.join(STATE_DIR, "office.json"), JSON.stringify({ url, token: TOKEN, pid: process.pid }));
  console.log(`office (${sourceName}) at ${url}`);
  if (!args.includes("--no-open"))
    spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { stdio: "ignore", detached: true })
      .on("error", () => {})
      .unref();
});

function shutdown() {
  source.close();
  try {
    fs.rmSync(path.join(STATE_DIR, "office.json"));
  } catch {}
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGHUP", shutdown);
