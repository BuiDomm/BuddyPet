import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] }
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    // macOS 13 ships WebKit 16.x; targeting 16.4 keeps the bundle aligned with
    // the declared OS floor and avoids unsupported legacy transforms in Vite 8.
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari16.4",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG)
  }
});
