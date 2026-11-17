# Manual verification

Checks from PRD §12 that CI can't run. Re-run them before each release and add a new entry.

## 2026-11-17 — v0.1.1 candidate (commit `fc27847` plus the fit-padding fix)

**Environment:** Orca embedded browser (Chromium 150.0.7871.250, macOS), `vite preview` of the production build and the dev server.

| Check | Result |
|---|---|
| Relation checkboxes (start order, networks, shared network stack, volumes, secrets, configs) | Pass. Hidden resources and edges disappear, the layout re-runs, and "Hidden: …" is shown. Groups absent from the file are disabled |
| Mermaid export with relations hidden | Pass. Matches the view, notes hidden relations in a comment, panel says so |
| Line styles (routed, right angles, curved, straight) | Pass. Routed lines follow dagre's paths around nodes |
| Light, dark, and system theme | Pass. Graph, panels, problems list, and export panel readable in both |
| Ports on nodes | Pass |
| Secrets and configs (names only), network aliases and static IPs, URL token in `build` | Pass. No `S3CRET` outside the input editor; `build` shows `https://***@github.com/…` |
| Auto-fit after layout and resize | Pass after fixing the padding unit (React Flow 13 reads a bare number as pixels) |
| Production CSP meta, network requests, console | Pass. Only the app's own HTML, JS, and CSS; no console entries |

**Not tested yet:** Firefox and Safari.

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
