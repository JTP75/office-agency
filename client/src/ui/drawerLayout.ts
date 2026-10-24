// The drawer's width, shared by CSS (--drawer-w) and the game camera so the player
// stays centered in the part of the screen the drawer doesn't cover.
export function drawerWidth(open: boolean) {
  if (!open) return 0;
  return Math.min(innerWidth, Math.max(420, Math.round(innerWidth * 0.45)));
}
