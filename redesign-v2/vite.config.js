import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Eigenständiges Projekt: eigener Port (5174), läuft parallel zur alten Seite (5173)
export default defineConfig({
  base: "./",
  server: { port: 5174, strictPort: true },
  plugins: [
    svelte({
      // Die Ansichten bekommen ihre Daten einmal beim Start und behalten sie
      onwarn(w, handler) {
        if (w.code === "state_referenced_locally") return;
        handler(w);
      },
    }),
  ],
});
