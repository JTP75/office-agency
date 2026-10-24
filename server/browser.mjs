import { spawn } from "node:child_process";

export function openBrowser(url) {
  spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { stdio: "ignore", detached: true })
    .on("error", () => {})
    .unref();
}
