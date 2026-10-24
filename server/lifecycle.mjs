// Daemon bookkeeping: one office per machine, port selection, office.json,
// and a single shutdown path.

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const STATE_DIR = process.env.HERDR_PLUGIN_STATE_DIR ?? path.join(ROOT, ".state");
export const STATE_FILE = path.join(STATE_DIR, "office.json");
export const LOG_FILE = path.join(STATE_DIR, "office.log");

const FIRST_PORT = Number(process.env.OFFICE_PORT ?? 4567);
const PORT_TRIES = 10;

export function readOffice() {
  try {
    const office = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    process.kill(office.pid, 0);
    return office;
  } catch {
    return null;
  }
}

function portFree(port, host) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });
}

export async function pickPort(host) {
  for (let port = FIRST_PORT; port < FIRST_PORT + PORT_TRIES; port++) {
    if (await portFree(port, host)) return port;
  }
  throw new Error(`no free port in ${FIRST_PORT}-${FIRST_PORT + PORT_TRIES - 1}`);
}

export function writeOffice(office) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(office), { mode: 0o600 });
}

const cleanups = [];
export function onShutdown(fn) {
  cleanups.push(fn);
}

export function shutdown(reason) {
  console.log(`office stopping: ${reason}`);
  for (const fn of cleanups) {
    try {
      fn();
    } catch {}
  }
  // Only remove the state file if it is still ours.
  try {
    if (JSON.parse(fs.readFileSync(STATE_FILE, "utf8")).pid === process.pid) fs.rmSync(STATE_FILE);
  } catch {}
  process.exit(0);
}

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => shutdown(sig));
