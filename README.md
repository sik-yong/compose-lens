# Compose Lens

**See the structure of a Docker Compose file at a glance, right in your browser.**

Compose Lens will let you paste or drop a `compose.yaml` and see its services, networks, and volumes as a graph. It will also flag configuration problems and export a Mermaid diagram for your README.

> **Status: pre-alpha, not usable yet.** Implementation of v0.1.0 has not started. Everything below describes planned behavior. The design is in the [PRD](docs/PRD.md) (Korean) and the [support matrix](docs/support-matrix.md), and is still being reviewed.

## Why

YAML gets hard to read once a stack has more than a handful of services. Compose Lens aims to be **accurate first**:

- It will only state what the file actually configures. `depends_on` is shown as start order, never as traffic. Sharing a network means "on the same network", not "talks to".
- It won't guess. Unresolved `${VARIABLES}`, external resources, and unsupported fields will be labeled, not silently filled in or ignored.
- What's supported and what isn't is written down in the [support matrix](docs/support-matrix.md).

## Planned for v0.1.0

- Load a Compose file by upload or paste
- Interactive graph: services, networks, and named volumes, with auto layout, drag, and zoom
- Detail panel for each service: image, build, ports, networks, volumes, and environment keys
- Diagnostics:
  - YAML syntax errors with line and column
  - Missing service, network, and volume references
  - Potential host port conflicts
  - Unsupported fields
- Mermaid export

## Privacy (design goals)

- **Local only:** Processing will happen entirely in your browser. Your Compose file is never uploaded, and the app will load no external CDNs, fonts, or analytics.
- **Masked values:** Values of `environment` and `build.args` will be hidden in all generated output.
- **Limits:** `command`, `entrypoint`, `labels`, and `healthcheck.test` are not displayed. Secrets inside displayed values, such as image references or URLs, are not guaranteed to be detected. See the [masking boundary](docs/support-matrix.md#masking-boundary).

## Out of scope

Connecting to Docker Engine, container status or metrics, starting or stopping containers, Kubernetes manifests, and inferring real network traffic.

## Roadmap

Markdown docs export, PNG/SVG export → more diagnostics → CLI for CI → Compose diff → `.env` interpolation, multi-file merge, profiles → VS Code extension

## Project layout (planned)

```
apps/web/        React web app
packages/core/   Parser, diagnostics, graph and Mermaid conversion (no UI deps)
examples/        Sample Compose files
docs/            PRD, support matrix, verification notes
```

## Development

Requires Node.js 22 or later.

```sh
npm install
npm run dev     # start the web app
npm run check   # typecheck, test, and build all workspaces
```

## Contributing

Issues and discussions are welcome. Contribution guidelines will be added before v0.1.0.

## License

[MIT](LICENSE)
