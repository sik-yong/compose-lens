# Manual verification

Checks from PRD §12 that CI can't run. Re-run them before each release and add a new entry.

## 2026-11-17 — v0.1.0 candidate (commit `9bc6c62`, Mermaid colors updated after)

**Environment:** Orca embedded browser (Chromium 150.0.7871.250, macOS). The deployed app at https://sik-yong.github.io/compose-lens/ and a local `vite preview` of the production build.

| Check | Result |
|---|---|
| Load the sample, edit text, open a file / paste | Pass. Graph, problems list, and detail panel update |
| Click a service, network, and volume node | Pass. Detail panel shows the documented fields |
| Paste `test/fixtures/masking-valid` (values marked `S3CRET`) | Pass. No `S3CRET` outside the input editor (graph, detail panel, problems list, Mermaid export). The editor shows the pasted text, as intended |
| Export Mermaid (panel, copy, `.mmd` download) | Pass. Panel shows `flowchart TB` output |
| Production CSP meta present | Pass |
| Network requests after load, while editing and exporting | Pass. Only the app's own HTML, JS, and CSS on load; none afterwards |
| Console errors | Pass. None |
| Exported Mermaid renders in GitHub Markdown | Pass. README example renders on github.com (light and dark themes; label colors fixed for dark) |

**Not tested yet:** Firefox and Safari. Clipboard copy was exercised in Chromium only.

**Known hosting limitation:** GitHub Pages can't send response headers, so `frame-ancestors` (clickjacking protection) is not set. The app has no actions worth hijacking, but a host with header support should add `Content-Security-Policy: frame-ancestors 'none'`.
