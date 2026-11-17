/**
 * Field coverage, mirroring docs/support-matrix.md. Keep the two in sync.
 */

/** Top-level keys that are analyzed or shown. */
export const TOP_LEVEL_KNOWN = new Set(["services", "networks", "volumes", "name", "secrets", "configs"]);

/** Service attributes that are analyzed, shown, masked, or deliberately not displayed. */
export const SERVICE_KNOWN = new Set([
  "image",
  "build",
  "ports",
  "expose",
  "networks",
  "network_mode",
  "volumes",
  "tmpfs",
  "depends_on",
  "environment",
  "env_file",
  "secrets",
  "configs",
  "container_name",
  "hostname",
  "restart",
  "profiles",
  "healthcheck",
  // Not displayed (may contain secrets), but understood.
  "command",
  "entrypoint",
  "labels",
]);

/**
 * Sub-keys of service attributes that are analyzed or shown. Others are listed
 * once per service and attribute as "not analyzed".
 */
export const SUB_KEYS_KNOWN = {
  build: new Set(["context", "dockerfile", "target", "args"]),
  ports: new Set(["target", "published", "host_ip", "protocol", "name", "app_protocol", "mode"]),
  networks: new Set(["aliases", "ipv4_address", "ipv6_address"]),
  volumes: new Set(["type", "source", "target", "read_only"]),
} as const;

/** Service attributes whose absence from analysis can make the graph incomplete. */
export const SERVICE_INCOMPLETE = new Set(["extends"]);

/** Top-level keys whose absence from analysis can make the graph incomplete. */
export const TOP_LEVEL_INCOMPLETE = new Set(["include"]);

/** Extension fields (`x-*`) are valid per spec and ignored silently. */
export const isExtension = (key: string) => key.startsWith("x-");
