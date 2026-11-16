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

**Sub-keys rule:** Inside any Analyzed or Shown object (a port, network, volume, `build`, `depends_on` entry, …), a sub-key not listed in this file is **Noted**. When it can change the interpretation, the diagnostic also says which check it limits.

## Top-level elements

| Element | Level | Notes |
|---|---|---|
| `services` | Analyzed | Must be a mapping, otherwise a `schema` error |
| `networks` | Analyzed | `external`, `name`, `driver`, `internal` shown. External networks are marked "existence not verified". `driver_opts`, `ipam`, `attachable`, `enable_ipv6`, `labels`: Noted |
| `volumes` | Analyzed | `external`, `name`, `driver` shown. External volumes are marked "existence not verified". `driver_opts`, `labels`: Noted |
| `name` | Shown | Project name |
| `version` | Noted | Obsolete in the spec. Info diagnostic only |
| `secrets`, `configs` | Shown (names only) | Contents and files are never read |
| `include` | Noted | Warning: the result may be incomplete |
| `x-*` | Ignored | Extension fields are valid. Anchors defined here are resolved normally |
| any other key | Noted | Unknown top-level key |

## Service attributes

| Attribute | Level | Notes |
|---|---|---|
| `image` | Shown | No secret detection guaranteed. See [Masking boundary](#masking-boundary) |
| `build` | Analyzed (partial) | String or object. `context`, `dockerfile`, `target` shown. `args`: **Masked**. Other `build` keys: Noted |
| `ports` | Analyzed | Short and long syntax, ranges, host IP, protocol. Long syntax: `target`, `published`, `host_ip`, `protocol` analyzed. `name` and `app_protocol` shown. `mode` Noted. See [Ports](#ports) |
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

- A service without `network_mode` whose `networks` is missing or empty (`[]`, `{}`) joins the implicit `default` network.
- A service with a non-empty `networks` joins only those networks (it must list `default` explicitly to join it).
- `network_mode: none` means no network. `host` shows a "host network" badge with no network edges.
- `network_mode: service:<name>` draws a "shares network stack" edge. A missing target is a `reference` error.
- `network_mode: container:<id>` is shown as an external container (`unverifiable`).
- Using `networks` and `network_mode` together is a `schema` error.
- Sharing a network means "on the same network in this configuration". It does not mean the services talk to each other.

### depends_on

- Edge direction: **dependent → dependency.** `web: depends_on: [db]` draws `web → db` ("web starts after db").
- Labels: short syntax or `service_started` gives "starts after" (readiness not guaranteed). `service_healthy` gives "after healthy". `service_completed_successfully` gives "after successful completion" (with a required dependency, the dependent does not start if the dependency fails. With `required: false`, Compose warns and continues).
- `required: false` is drawn as an optional dependency. `restart: true` is shown in the detail panel.
- It is never presented as traffic or communication.

### Ports

- Normalized to `{ hostIp?, host, containerPort (single | range), protocol }`. `host` takes one of three forms:

| Host binding | Example | Meaning |
|---|---|---|
| fixed | `"8080:80"`, `"9090-9091:8080-8081"` | Occupies every listed host port |
| dynamic | `"80"` | The host port is **assigned at random**. It is not host port 80 |
| pool | `"8000-8010:80"`, or `published: "8000-8010"` with a single `target` | **One** free port from the range is assigned. The whole range is not occupied |

- **Potential conflict:** only between fixed bindings with the same protocol, overlapping ports, and overlapping host IP. An unset IP counts as all interfaces.
- Excluded from conflict checks: dynamic and pool bindings, and ports containing variables. A pool that overlaps a fixed binding gets an info note.
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
- Detected forms: `${VAR}`, `${VAR:-d}`, `${VAR-d}`, `${VAR:?e}`, `${VAR?e}`, `${VAR:+a}`, `${VAR+a}`, `$VAR`, and nested expressions such as `${A:-${B}}`. `$$` is a literal `$`, so `$$VAR` is not a variable.
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

- **Not displayed:** `command`, `entrypoint`, `labels`, and `healthcheck.test`. Secrets often live there.
- **Displayed, no secret detection guaranteed:** `image`, `build.context`, `build.dockerfile`, paths, and resource names. Credentials in URL-like values (`scheme://user:pass@…`) are hidden on a best-effort basis only.
