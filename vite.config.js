import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  test: {
    environment: "node",
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, "/");
          if (normalized.includes("/node_modules/@supabase/")) {
            return "supabase-vendor";
          }
          if (
            normalized.includes("/node_modules/three/") ||
            normalized.includes("/node_modules/three-stdlib/")
          ) {
            return "three-vendor";
          }
        },
      },
    },
  },
});