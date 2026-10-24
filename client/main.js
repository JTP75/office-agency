// Walking skeleton: a tile map the player can walk around, plus a HUD that
// proves the server feed is live. Everything here is meant to be replaced.

const TILE = 32;
const SPEED = 160; // px per second

// # wall, . floor, D desk (solid), P player spawn
const MAP = `
##########################
#........................#
#..DD..DD..DD....DD..DD..#
#........................#
#..DD..DD..DD....DD..DD..#
#........................#
#.............P..........#
#####......########......#
#..........#......#......#
#..DD..DD..#......#..DD..#
#..........#.............#
#..DD..DD..#......#..DD..#
#........................#
##########################
`.trim().split("\n");

const SOLID = new Set(["#", "D"]);
const COLORS = { "#": "#3a3f4b", ".": "#c9b79c", D: "#7a5230" };
const STATUS_COLORS = { working: "#4caf50", idle: "#9e9e9e", blocked: "#f44336", done: "#2196f3", unknown: "#673ab7" };

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const hud = document.getElementById("hud");

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}
addEventListener("resize", resize);
resize();

const player = { x: 0, y: 0, r: 10 };
MAP.forEach((row, ty) => {
  const tx = row.indexOf("P");
  if (tx >= 0) Object.assign(player, { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
});

function solidAt(px, py) {
  const row = MAP[Math.floor(py / TILE)];
  return !row || SOLID.has(row[Math.floor(px / TILE)] ?? "#");
}

function blocked(x, y) {
  const r = player.r;
  return solidAt(x - r, y - r) || solidAt(x + r, y - r) || solidAt(x - r, y + r) || solidAt(x + r, y + r);
}

const keys = new Set();
addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

function update(dt) {
  let dx = 0, dy = 0;
  if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
  if (keys.has("arrowright") || keys.has("d")) dx += 1;
  if (keys.has("arrowup") || keys.has("w")) dy -= 1;
  if (keys.has("arrowdown") || keys.has("s")) dy += 1;
  if (!dx && !dy) return;
  const len = Math.hypot(dx, dy);
  const step = (SPEED * dt) / len;
  // Resolve axes separately so the player slides along walls.
  if (!blocked(player.x + dx * step, player.y)) player.x += dx * step;
  if (!blocked(player.x, player.y + dy * step)) player.y += dy * step;
}

function draw() {
  const camX = Math.round(player.x - canvas.width / 2);
  const camY = Math.round(player.y - canvas.height / 2);
  ctx.fillStyle = "#1b1d23";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  MAP.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx++) {
      const ch = row[tx] === "P" ? "." : row[tx];
      ctx.fillStyle = COLORS[ch];
      ctx.fillRect(tx * TILE - camX, ty * TILE - camY, TILE, TILE);
    }
  });
  ctx.fillStyle = "#ffd54f";
  ctx.beginPath();
  ctx.arc(player.x - camX, player.y - camY, player.r, 0, Math.PI * 2);
  ctx.fill();
}

let last = performance.now();
function frame(now) {
  update(Math.min((now - last) / 1000, 0.05));
  last = now;
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Server feed. See PROTOCOL.md.
const token = new URLSearchParams(location.search).get("t");
const events = new EventSource(`/api/events?t=${token}`);
events.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type !== "snapshot") return;
  const dots = msg.agents
    .map((a) => `<span class="dot" title="${a.id} ${a.status}" style="background:${STATUS_COLORS[a.status] ?? "#fff"}"></span>`)
    .join("");
  hud.innerHTML = `${msg.source} · ${msg.agents.length} agents ${dots}`;
};
events.onerror = () => (hud.textContent = "disconnected (retrying)…");
