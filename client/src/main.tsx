import { createRoot } from "react-dom/client";
import "./styles.css";
import { Game } from "./game/Game";
import { connectFeed } from "./net/feed";
import { Hud } from "./ui/Hud";

createRoot(document.getElementById("ui")!).render(<Hud />);

const game = new Game();
game
  .init(document.getElementById("game")!)
  .then(connectFeed)
  .catch((err) => {
    console.error(err);
    const el = document.getElementById("game")!;
    el.textContent = `Couldn't start the renderer: ${err instanceof Error ? err.message : String(err)}`;
    el.className = "fatal";
  });
