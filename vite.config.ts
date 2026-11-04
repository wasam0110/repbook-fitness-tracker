import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const projectRoot = import.meta.dirname;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "client", "src"),
      "@shared": path.resolve(projectRoot, "shared"),
    },
  },
  envDir: projectRoot,
  root: path.resolve(projectRoot, "client"),
  publicDir: path.resolve(projectRoot, "client", "public"),
  build: {
    outDir: path.resolve(projectRoot, "dist"),
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 3000),
    strictPort: true,
  },
});
