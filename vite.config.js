import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: "src/manifest.json", dest: "." },

        { src: "public/icons", dest: "icons" },
        { src: "public/vite.svg", dest: "." },
      ],
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "index.html"), // popup UI
        background: resolve(__dirname, "src/background/index.js"), // background script
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background") {
            return "background.js"; // background.js without hash
          }
          return "assets/[name]-[hash].js"; // popup, css, etc.
        },
      },
    },
    outDir: "dist",
    emptyOutDir: true,
  },
});
