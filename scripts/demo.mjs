#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const nodeModulesPath = path.resolve(ROOT, "client/node_modules");
const distIndexPath = path.resolve(ROOT, "client/dist/index.html");

/**
 * Spawn a command and wait for it to complete.
 * @param {string} command
 * @param {string[]} args
 * @param {object} options
 * @returns {Promise<number|null>} exit code or null if killed by signal
 */
function spawnAsync(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    child.on("close", (code) => resolve(code));
    child.on("error", (err) => reject(err));
  });
}

async function main() {
  // Check if client dependencies are installed
  if (!existsSync(nodeModulesPath)) {
    console.log("Client dependencies not installed, running npm ci...");
    const ciExitCode = await spawnAsync("npm", ["--prefix", "client", "ci"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    if (ciExitCode !== 0) {
      console.error("npm ci failed");
      process.exit(ciExitCode || 1);
    }
  }

  // Check if client is built
  if (!existsSync(distIndexPath)) {
    console.log("Client not built, running build...");
    const buildExitCode = await spawnAsync("npm", ["--prefix", "client", "run", "build"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    if (buildExitCode !== 0) {
      console.error("Build failed");
      process.exit(buildExitCode || 1);
    }
  }

  // Start the demo server
  console.log("Starting demo server...");
  const serverExitCode = await spawnAsync(
    process.execPath,
    ["server/index.mjs", "--source", "fixture", "--scenario", "crowded", "--port-fallback"],
    {
      cwd: ROOT,
      stdio: "inherit",
    },
  );

  process.exit(serverExitCode ?? 1);
}

main().catch((err) => {
  console.error("Demo script error:", err);
  process.exit(1);
});
