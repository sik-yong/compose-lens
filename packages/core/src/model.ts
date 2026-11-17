/**
 * Normalized Compose model. Built only from what the file configures;
 * environment and build.args values are never stored (PRD §8.4).
 */

export type Protocol = string;

export interface PortRange {
  start: number;
  end: number;
}

/**
 * fixed: occupies these host ports. dynamic: random host port.
 * pool: one free port from the range. unresolved: contains a variable.
 */
export type HostBinding =
  | { kind: "fixed"; ports: PortRange }
  | { kind: "dynamic" }
  | { kind: "pool"; ports: PortRange }
  | { kind: "unresolved" };

export interface PortMapping {
  /** Position in the service's `ports` list. */
  index: number;
  /** The entry as written, for display (ports never carry masked values). */
  raw: string;
  hostIp?: string;
  host: HostBinding;
  /** Undefined when it contains a variable. */
  container?: PortRange;
  protocol: Protocol;
  /** Long syntax only: `name`, `app_protocol`, `mode` as written. */
  name?: string;
  appProtocol?: string;
  mode?: string;
}

export type MountKind = "named" | "bind" | "anonymous" | "tmpfs" | "other" | "unresolved";

export interface Mount {
  /** Position in the service's `volumes` list. */
  index: number;
  kind: MountKind;
  /** Volume name (named) or host path (bind). URL credentials are redacted. */
  source?: string;
  target?: string;
  readOnly: boolean;
  /** Original `type` for kind "other" (npipe, cluster, image, …). */
  type?: string;
}

export type DependencyCondition =
  | "service_started"
  | "service_healthy"
  | "service_completed_successfully";

export interface Dependency {
  service: string;
  condition: DependencyCondition;
  required: boolean;
  restart: boolean;
}

export interface ServiceNetwork {
  name: string;
  /** True when joined through the implicit default network rule. */
  implicit: boolean;
  /** Mapping syntax only, as written. */
  aliases?: string[];
  ipv4Address?: string;
  ipv6Address?: string;
}

export interface BuildInfo {
  /** URL credentials are redacted. */
  context?: string;
  dockerfile?: string;
  target?: string;
  /** build.args keys only. Values are never stored. */
  argKeys: string[];
}

/** Parsed `network_mode`. */
export type NetworkMode =
  | { kind: "none" | "host" }
  | { kind: "service"; service: string }
  | { kind: "container"; container: string }
  /** Valid Docker modes that Compose Lens doesn't analyze (e.g. bridge). */
  | { kind: "other"; raw: string }
  | { kind: "unresolved"; raw: string };

export interface Service {
  name: string;
  /** URL credentials are redacted. */
  image?: string;
  build?: BuildInfo;
  containerName?: string;
  hostname?: string;
  restart?: string;
  ports: PortMapping[];
  /** `expose` entries as written. */
  expose: string[];
  networks: ServiceNetwork[];
  networkMode?: NetworkMode;
  volumes: Mount[];
  /** `tmpfs` targets as written. */
  tmpfs: string[];
  dependsOn: Dependency[];
  /** environment keys only. Values are never stored. */
  environmentKeys: string[];
  /** `env_file` paths. The files are never read. URL credentials are redacted. */
  envFiles: string[];
  /** Names only. */
  secrets: string[];
  /** Names only. */
  configs: string[];
  /** Not evaluated: every service is treated as active. */
  profiles: string[];
  /** Whether a healthcheck is defined. `test` is never stored. */
  hasHealthcheck: boolean;
}

export interface ResourceDef {
  name: string;
  external: boolean;
  /** True for the network Compose creates without a declaration. */
  implicit: boolean;
}

export interface ComposeModel {
  name?: string;
  services: Service[];
  networks: ResourceDef[];
  volumes: ResourceDef[];
  /** Top-level secrets and configs: names and `external` only. Contents are never read. */
  secrets: ResourceDef[];
  configs: ResourceDef[];
}
