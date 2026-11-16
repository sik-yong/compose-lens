import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig, type Plugin } from "vite";

/**
 * Production-only Content Security Policy (PRD §8.1), as defense in depth.
 * The app needs no runtime network access, so connect/frame/worker are 'none'
 * and everything else is limited to the app's own origin. CSP alone does not
 * prove the Compose input never leaves the browser (same-origin image or
 * navigation requests are still possible); that also relies on code review
 * and the manual network check in docs/verification.md.
 * Dev mode is skipped because Vite's HMR needs inline scripts and a websocket.
 * 'unsafe-inline' for styles is required by React Flow's inline node styles.
 * frame-ancestors can't be set from a <meta> tag; set it as a hosting header.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
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
  // Use @compose-lens/core from source ("source" export condition), so the web
  // app doesn't need a prebuilt core in dev or build.
  resolve: { conditions: ["source", ...defaultClientConditions] },
});
