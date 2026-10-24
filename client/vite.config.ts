import { defineConfig } from "vite";

// Dev: run the data server alongside Vite and let Vite forward /api to it.
//   OFFICE_TOKEN=dev node server/index.mjs --source fixture --no-open
//   cd client && npm run dev   → http://localhost:5173/?t=dev
// Build: output goes to client/dist/, which the server serves automatically.
export default defineConfig({
  base: "./",
  // Vite compiles TSX itself; use React's automatic JSX runtime.
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  server: {
    proxy: { "/api": "http://127.0.0.1:4567" },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
