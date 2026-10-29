import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  // Ścieżki względne – strona działa pod dowolnym adresem (GitHub Pages, własna domena).
  base: "./",
  plugins: [preact()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
