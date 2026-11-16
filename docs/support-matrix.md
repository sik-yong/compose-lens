# Support Matrix

This document is the source of truth for what Compose Lens understands. If the app's behavior and this file disagree, it's a bug.

- **Baseline:** [Compose Specification](https://docs.docker.com/reference/compose-file/) as of 2026-11.
- **Scope:** A single Compose file. Every result describes the *configuration in the file*. Compose Lens never inspects a host or Docker Engine.
- **Status:** Planned for v0.1.0 (not implemented yet).

## Legend

| Level | Meaning |
|---|---|
| **Analyzed** | Parsed and normalized, used in the graph, validated, with fixture tests |
| **Shown** | Displayed in the detail panel as-is, no validation |
| **Masked** | Keys are shown, values are always hidden in every generated output |
| **Noted** | Not analyzed; an `unsupported` diagnostic says so |
| **Ignored** | Accepted silently (valid per spec, no effect on the result) |

## Top-level elements

| Element | Level | Notes |
|---|---|---|
| `services` | Analyzed | Must be a mapping, otherwise a `schema` error |
| `networks` | Analyzed | `external`, `name`, `driver` shown. External networks are marked "existence not verified" |
| `volumes` | Analyzed | `external`, `name`, `driver` shown. External volumes are marked "existence not verified" |
| `name` | Shown | Project name |
| `version` | Noted | Obsolete in the spec. Info diagnostic only |
| `secrets`, `configs` | Shown (names only) | Contents and files are never read |
| `include` | Noted | Warning: the result may be incomplete |
| `x-*` | Ignored | Extension fields are valid. Anchors defined here are resolved normally |
| any other key | Noted | Unknown top-level key |

## Service attributes

| Attribute | Level | Notes |
|---|---|---|
| `image` | Shown | |
| `build` | Analyzed (partial) | String or object. `context`, `dockerfile`, `target` shown. `args`: **Masked**. Other `build` keys: Noted |
| `ports` | Analyzed | Short and long syntax, ranges, host IP, protocol. See [Ports](#ports) |
| `expose` | Shown | |
| `networks` | Analyzed | List and mapping syntax. `aliases`, `ipv4_address`, `ipv6_address` shown |
| `network_mode` | Analyzed | `none`, `host`, `service:<name>`, `container:<id>`. See [Networks](#networks) |
| `volumes` | Analyzed | Short and long syntax. See [Volumes](#volumes) |
| `tmpfs` | Shown | |
| `depends_on` | Analyzed | Short and long syntax, `condition`, `required`, `restart`. See [depends_on](#depends_on) |
| `environment` | Masked | List and mapping syntax. Keys only |
| `env_file` | Shown (paths only) | Files are never read |
| `secrets`, `configs` | Shown (names only) | |
| `container_name`, `hostname`, `restart` | Shown | |
| `profiles` | Shown | **Not evaluated:** all services are treated as active. Info diagnostic when present |
| `healthcheck` | Shown (presence only) | `test` is not displayed (may contain secrets) |
| `command`, `entrypoint`, `labels` | Not displayed | May contain secrets. Not protected by masking |
| `links`, `external_links` | Noted | Legacy. Not drawn as relations |
| `volumes_from` | Noted | |
| `extends` | Noted | Warning: the result may be incomplete |
| `deploy`, `develop`, and the rest | Noted | Listed in one `unsupported` info diagnostic per service |
| `x-*` | Ignored | |

## Rules

### Networks

- A service with neither `networks` nor `network_mode` joins the implicit `default` network.
- A service that lists `networks` joins only those networks (it must list `default` explicitly to join it).
- `network_mode: none` means no network. `host` shows a "host network" badge with no network edges.
- `network_mode: service:<name>` draws a "shares network stack" edge. A missing target is a `reference` error.
- `network_mode: container:<id>` is shown as an external container (`unverifiable`).
- Using `networks` and `network_mode` together is a `schema` error.
- Sharing a network means "on the same network in this configuration". It does not mean the services talk to each other.

### depends_on

- Edge direction: **dependent → dependency.** `web: depends_on: [db]` draws `web → db` ("web starts after db").
- Labels: short syntax or `service_started` gives "starts after" (readiness not guaranteed). `service_healthy` gives "after healthy". `service_completed_successfully` gives "after completes".
- `required: false` is drawn as an optional dependency. `restart: true` is shown in the detail panel.
- It is never presented as traffic or communication.

### Ports

- Normalized to `{ hostIp?, hostPort? (single | range), containerPort (single | range), protocol }`.
- No host port (`"80"`) means the host port is **dynamically assigned**, not host port 80.
- **Potential conflict:** same protocol, overlapping fixed host ports, and overlapping host IP. An unset IP counts as all interfaces.
- Excluded from conflict checks: dynamic ports and ports containing variables.
- Conflicts are reported as "may conflict within this file". Actual host usage is not checked. Profiles are not evaluated.

### Volumes

| Kind | Detected by | Treatment |
|---|---|---|
| named | Source is a name, or `type: volume` with a source | Checked against top-level `volumes`, drawn as a node, sharing shown |
| bind | Source starts with `/`, `./`, `../`, `~`, or `type: bind` | Service attribute only |
| anonymous | Target only, or `type: volume` without a source | Service attribute only, **never merged across services** |
| tmpfs | `type: tmpfs` | Service attribute only |
| `npipe`, `cluster`, `image` | `type` | Noted |

### Variable interpolation

- **Not resolved in v0.1.** `.env` and environment variables are not read.
- Detected forms: `${VAR}`, `${VAR:-d}`, `${VAR-d}`, `${VAR:?e}`, `${VAR?e}`, `${VAR:+a}`, `$VAR`. `$$` is a literal `$`.
- Values keep their original expression and are marked *unresolved*, even when a default exists.
- Checks that depend on an unresolved value are **deferred** with an `unresolved` diagnostic. They are reported neither as errors nor as OK.

### YAML

- YAML 1.2 via [`yaml`](https://eemeli.org/yaml/), with anchors, aliases, and merge keys (`<<`).

| Limit | Value |
|---|---|
| Input size | 1 MiB |
| Alias expansion | 100 |
| Circular aliases | Rejected |
| Nesting depth | 64 |
| Services | 300 |
| Graph nodes + edges | 3000 |

- Exceeding any limit produces a `limit` error and no graph.

## Masking boundary

Values of `environment` and `build.args` never appear in generated output: the graph data, detail panel, diagnostics, Mermaid export, or logs. `secrets`, `configs`, and `env_file` show names or paths only.

**Not protected:** secrets embedded in `command`, `entrypoint`, `labels`, `healthcheck.test`, image references, or URLs. v0.1 does not display those fields, but Compose Lens does not detect or redact secrets in them.
