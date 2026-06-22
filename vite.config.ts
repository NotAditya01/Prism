import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      assert: path.resolve(__dirname, "./node_modules/assert/build/assert.js"),
      events: path.resolve(__dirname, "./node_modules/events/events.js"),
      process: path.resolve(__dirname, "./node_modules/process/browser.js"),
    },
  },
  define: {
    "process.browser": "true",
    "process.env": {},
  },
});
