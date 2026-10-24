// Plugin action: open the browser on a running office, or start the server pane.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const herdr = process.env.HERDR_BIN_PATH ?? "herdr";
const stateFile = path.join(process.env.HERDR_PLUGIN_STATE_DIR, "office.json");

function running() {
  try {
    const office = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    process.kill(office.pid, 0);
    return office;
  } catch {
    return null;
  }
}

const office = running();
if (office) {
  spawnSync("open", [office.url]);
} else {
  // The server opens the browser itself once it is listening.
  const r = spawnSync(herdr, ["plugin", "pane", "open", "--plugin", process.env.HERDR_PLUGIN_ID, "--entrypoint", "office", "--no-focus"], {
    stdio: "inherit",
  });
  process.exit(r.status ?? 1);
}
