import { readFileSync } from "fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  plugins: [react()],
  // Electron (file://) needs relative assets; Vercel needs root-relative paths for deep routes.
  base: process.env.VERCEL ? "/" : "./",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  optimizeDeps: {
    include: ["recharts"],
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
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
            normalized.includes("/node_modules/three-stdlib/") ||
            normalized.includes("/node_modules/@react-three/")
          ) {
            return "three-vendor";
          }
          if (normalized.includes("/node_modules/jspdf")) {
            return "jspdf-vendor";
          }
          if (normalized.includes("/node_modules/html2canvas")) {
            return "html2canvas-vendor";
          }
          if (normalized.includes("/node_modules/xlsx")) {
            return "xlsx-vendor";
          }
          if (normalized.includes("/components/Print3DCalculator")) {
            return "calc-print3d";
          }
          if (normalized.includes("/components/LaserCalculator")) {
            return "calc-laser";
          }
          if (normalized.includes("/components/DtfCalculator")) {
            return "calc-dtf";
          }
          if (normalized.includes("/components/UvDtfCalculator")) {
            return "calc-uvdtf";
          }
        },
      },
    },
  },
});