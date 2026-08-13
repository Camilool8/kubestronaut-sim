import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

function novncHardwareCursor(): Plugin {
  return {
    name: "novnc-hardware-cursor",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("@novnc/novnc/core/util/cursor.js")) return;
      const patched = code.replace(
        "const useFallback = !supportsCursorURIs || isTouchDevice;",
        "const useFallback = !supportsCursorURIs;",
      );
      if (patched === code) {
        this.error("noVNC cursor fallback patch no longer matches; check @novnc/novnc upgrade");
      }
      return { code: patched, map: null };
    },
  };
}

export default defineConfig({
  plugins: [react(), novncHardwareCursor()],
  build: {
    outDir: "dist",

    target: "es2022",
  },

  optimizeDeps: {
    esbuildOptions: { target: "es2022" },

    exclude: ["@novnc/novnc"],
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
