import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",

    target: "es2022",
  },

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

    environmentOptions: { jsdom: { url: "http://localhost/" } },
    setupFiles: ["./src/test/setup.ts"],
  },
});
