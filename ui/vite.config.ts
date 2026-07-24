import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev-only proxy so the Vite dev server can talk to a facilitator
// running at localhost:8080 (same origin the production build gets
// for free once it's embedded and served by the Go binary). Every
// fetch in src/api.ts uses relative paths for exactly this reason.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/desktop": {
        target: "http://localhost:8080",
        ws: true,
      },
    },
  },
});
