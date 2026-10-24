// Keyboard state. Ignores keys while the user is typing in a text field.
const held = new Set<string>();

const MOVE_KEYS = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"]);

function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

export function installInput() {
  addEventListener("keydown", (e) => {
    if (typing(e)) return;
    const k = e.key.toLowerCase();
    if (MOVE_KEYS.has(k)) e.preventDefault(); // keep arrows from scrolling or moving focus
    held.add(k);
  });
  addEventListener("keyup", (e) => held.delete(e.key.toLowerCase()));
  addEventListener("blur", () => held.clear());
}

/** Movement direction from WASD / arrows; components are -1, 0 or 1. */
export function moveAxis() {
  let x = 0;
  let y = 0;
  if (held.has("arrowleft") || held.has("a")) x -= 1;
  if (held.has("arrowright") || held.has("d")) x += 1;
  if (held.has("arrowup") || held.has("w")) y -= 1;
  if (held.has("arrowdown") || held.has("s")) y += 1;
  return { x, y };
}
