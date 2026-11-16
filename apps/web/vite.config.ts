import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Production-only Content Security Policy (PRD §8.1): the built app may only
 * load and connect to its own origin, so a Compose file can't leave the browser.
 * Dev mode is skipped because Vite's HMR needs inline scripts and a websocket.
 * 'unsafe-inline' for styles is required by React Flow's inline node styles.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "compose-lens-csp",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
        injectTo: "head-prepend",
      },
    ],
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
});
