// Plugin action: stop the background office server.

import { readOffice } from "../server/lifecycle.mjs";

const office = readOffice();
if (!office) {
  console.log("office is not running");
} else {
  process.kill(office.pid, "SIGTERM");
  console.log(`stopped office (pid ${office.pid})`);
}
