// Plugin pane: follow the office server log. Ctrl+C closes the pane.

import fs from "node:fs";
import { LOG_FILE, STATE_DIR } from "../server/lifecycle.mjs";

fs.mkdirSync(STATE_DIR, { recursive: true });
fs.closeSync(fs.openSync(LOG_FILE, "a"));

let pos = Math.max(0, fs.statSync(LOG_FILE).size - 8192);
function drain() {
  const size = fs.statSync(LOG_FILE).size;
  if (size < pos) pos = 0; // truncated
  if (size === pos) return;
  const fd = fs.openSync(LOG_FILE, "r");
  const buf = Buffer.alloc(size - pos);
  fs.readSync(fd, buf, 0, buf.length, pos);
  fs.closeSync(fd);
  pos = size;
  process.stdout.write(buf);
}

console.log(`following ${LOG_FILE}\n`);
drain();
setInterval(drain, 500);
