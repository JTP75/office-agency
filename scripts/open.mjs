// Plugin action: open the browser on the running office, starting the
// background server first if needed. The server exits on its own when herdr
// stops, or via the stop action.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readOffice, STATE_DIR, LOG_FILE } from "../server/lifecycle.mjs";
import { openBrowser } from "../server/browser.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const START_TIMEOUT_MS = 3000;

let office = readOffice();
if (!office) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const log = fs.openSync(LOG_FILE, "a");
  spawn(process.execPath, [path.join(ROOT, "server", "index.mjs"), "--source", "herdr", "--no-open"], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", log, log],
  }).unref();

  const deadline = Date.now() + START_TIMEOUT_MS;
  while (!(office = readOffice()) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  if (!office) {
    console.error(`office did not start within ${START_TIMEOUT_MS} ms; see ${LOG_FILE}`);
    process.exit(1);
  }
}

console.log(`office at ${office.url}`);
openBrowser(office.url);
