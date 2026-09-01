import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "pages",
  publicDir: "../public",
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react()],
  build: {
    outDir: "../pages-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "pages/index.html"),
        coordinador: resolve(__dirname, "pages/coordinador/index.html"),
        administrador: resolve(__dirname, "pages/administrador/index.html"),
        docente: resolve(__dirname, "pages/docente/index.html"),
        verificar: resolve(__dirname, "pages/verificar/index.html"),
      },
    },
  },
});