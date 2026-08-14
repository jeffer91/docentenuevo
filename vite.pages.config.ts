import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "pages",
  publicDir: "../public",
  base: process.env.GITHUB_ACTIONS ? "/siacd-docente/" : "/",
  plugins: [react()],
  build: {
    outDir: "../pages-dist",
    emptyOutDir: true,
  },
});
