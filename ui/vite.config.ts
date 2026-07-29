import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Dev-only proxy so the Vite dev server can talk to a facilitator
// running at localhost:8080 (same origin the production build gets
// for free once it's embedded and served by the Go binary). Every
// fetch in src/api.ts uses relative paths for exactly this reason.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    // @novnc/novnc 1.7 uses top-level await (WebCodecs capability probe);
    // es2022 is the earliest target that emits it natively. Local tool,
    // evergreen browsers only.
    target: "es2022",
  },
  // The same floor, for dependency pre-bundling. esbuild does not inherit
  // build.target here, and its default predates top-level await — so
  // @novnc/novnc failed to optimise and `npm run dev` served a blank page
  // while `npm run build` was fine. The two targets must move together.
  optimizeDeps: {
    esbuildOptions: { target: "es2022" },
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
  test: {
    environment: "jsdom",
    // A real (non-opaque) origin so jsdom provides working localStorage.
    environmentOptions: { jsdom: { url: "http://localhost/" } },
    setupFiles: ["./src/test/setup.ts"],
  },
});
