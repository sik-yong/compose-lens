import type { Diagnostic, DocumentPath } from "./diagnostics.js";
import { LIMITS } from "./limits.js";
import { checkModel } from "./checks.js";
import { Context, hasVariable, type Locate } from "./context.js";
import { SERVICE_INCOMPLETE, SERVICE_KNOWN, SUB_KEYS_KNOWN, TOP_LEVEL_INCOMPLETE, TOP_LEVEL_KNOWN, isExtension } from "./fields.js";
import { redactUrlCredentials } from "./redact.js";
import type {
  BuildInfo,
  ComposeModel,
  Dependency,
  DependencyCondition,
  Mount,
  NetworkMode,
  PortMapping,
  PortRange,
  ResourceDef,
  Service,
  ServiceNetwork,
} from "./model.js";

type Obj = Record<string, unknown>;

/** Collects sub-keys that aren't analyzed, per service attribute (see SUB_KEYS_KNOWN). */
type Unanalyzed = Map<keyof typeof SUB_KEYS_KNOWN, Set<string>>;

function noteSubKeys(seen: Unanalyzed, field: keyof typeof SUB_KEYS_KNOWN, entry: Obj) {
  for (const key of Object.keys(entry)) {
    if (SUB_KEYS_KNOWN[field].has(key) || isExtension(key)) continue;
    const keys = seen.get(field) ?? new Set<string>();
    keys.add(key);
    seen.set(field, keys);
  }
}

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;


// ---------- ports ----------

function parseRange(text: string): PortRange | undefined {
  const m = /^(\d+)(?:-(\d+))?$/.exec(text);
  if (!m) return undefined;
  const start = Number(m[1]);
  const end = m[2] === undefined ? start : Number(m[2]);
  if (start < 0 || end > 65535 || end < start) return undefined;
  return { start, end };
}

const rangeSize = (r: PortRange) => r.end - r.start + 1;

/**
 * Classifies the host side. Returns undefined for invalid mappings, following
 * Docker's parser: a host range must match the container range size, except
 * that a host range with a single container port is a pool.
 */
function hostBinding(host: string | undefined, container: PortRange | undefined): PortMapping["host"] | undefined {
  if (host === undefined || host === "") return { kind: "dynamic" };
  if (hasVariable(host)) return { kind: "unresolved" };
  const ports = parseRange(host);
  if (!ports) return undefined;
  if (ports.start === 0 && ports.end === 0) return { kind: "dynamic" }; // Docker assigns a free port
  if (!container) return { kind: "unresolved" }; // container side has a variable
  if (rangeSize(container) === 1) return rangeSize(ports) > 1 ? { kind: "pool", ports } : { kind: "fixed", ports };
  return rangeSize(ports) === rangeSize(container) ? { kind: "fixed", ports } : undefined;
}

function makePort(

  raw: string,
  hostText: string | undefined,
  containerText: string,
  protocol: string,
  hostIp: string | undefined,
): Omit<PortMapping, "index"> | undefined {
  const containerHasVariable = hasVariable(containerText);
  const container = containerHasVariable ? undefined : parseRange(containerText);
  if (!container && !containerHasVariable) return undefined;
  // A variable anywhere (IP, protocol, either port) can change the whole binding.
  const anyVariable = [raw, hostIp ?? "", protocol].some(hasVariable);
  const host = anyVariable ? ({ kind: "unresolved" } as const) : hostBinding(hostText, container);
  if (!host) return undefined;
  const mapping: Omit<PortMapping, "index"> = { raw, host, protocol };
  if (container) mapping.container = container;
  if (hostIp) mapping.hostIp = hostIp;
  return mapping;
}

/**
 * Positions of `char` outside `${...}` expressions, so separators inside a
 * variable default (e.g. `${PORT:-8080}`) are not treated as separators.
 */
function separators(text: string, char: string): number[] {
  const found: number[] = [];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith("$$", i)) {
      i++;
    } else if (text.startsWith("${", i)) {
      depth++;
      i++;
    } else if (text[i] === "}" && depth > 0) {
      depth--;
    } else if (text[i] === char && depth === 0) {
      found.push(i);
    }
  }
  return found;
}

function splitAt(text: string, positions: number[]): string[] {
  const parts: string[] = [];
  let start = 0;
  for (const p of positions) {
    parts.push(text.slice(start, p));
    start = p + 1;
  }
  parts.push(text.slice(start)); // keep a trailing empty part so it can be rejected
  return parts;
}

function parseShortPort(raw: string): Omit<PortMapping, "index"> | undefined {
  let rest = raw;
  let protocol = "tcp";
  const slash = separators(rest, "/").at(-1);
  if (slash !== undefined) {
    protocol = rest.slice(slash + 1);
    rest = rest.slice(0, slash);
  }
  let hostIp: string | undefined;
  if (rest.startsWith("[")) {
    const close = rest.indexOf("]");
    if (close < 0 || rest[close + 1] !== ":") return undefined;
    hostIp = rest.slice(1, close);
    rest = rest.slice(close + 2);
  }
  const parts = splitAt(rest, separators(rest, ":"));
  const containerText = parts.pop() ?? "";
  const hostText = parts.length > 0 ? parts.pop() : undefined;
  if (hostIp === undefined && parts.length > 0) hostIp = parts.join(":");
  return makePort(raw, hostText, containerText, protocol, hostIp);
}

function parseLongPort(entry: Obj): Omit<PortMapping, "index"> | undefined {
  const target = str(entry["target"]);
  if (target === undefined) return undefined;
  const published = str(entry["published"]);
  const hostIp = str(entry["host_ip"]);
  const protocol = str(entry["protocol"]) ?? "tcp";
  const raw = `${hostIp ? `${hostIp}:` : ""}${published ? `${published}:` : ""}${target}/${protocol}`;
  const mapping = makePort(raw, published, target, protocol, hostIp);
  if (!mapping) return undefined;
  const name = str(entry["name"]);
  const appProtocol = str(entry["app_protocol"]);
  const mode = str(entry["mode"]);
  if (name !== undefined) mapping.name = name;
  if (appProtocol !== undefined) mapping.appProtocol = appProtocol;
  if (mode !== undefined) mapping.mode = mode;
  return mapping;
}

function normalizePorts(ctx: Context, value: unknown, path: DocumentPath, seen: Unanalyzed): PortMapping[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    ctx.schema(path, "`ports` must be a list.");
    return [];
  }
  const result: PortMapping[] = [];
  value.forEach((entry, i) => {
    const text = str(entry);
    if (isObj(entry)) noteSubKeys(seen, "ports", entry);
    const mapping = text !== undefined ? parseShortPort(text) : isObj(entry) ? parseLongPort(entry) : undefined;
    if (mapping) result.push({ ...mapping, index: i });
    else ctx.schema([...path, i], "Invalid port mapping.");
  });
  return result;
}

// ---------- volumes ----------

const WINDOWS_PATH = /^[A-Za-z]:[\\/]/;

function classifySource(source: string): Mount["kind"] {
  if (hasVariable(source)) return "unresolved";
  if (WINDOWS_PATH.test(source) || source.startsWith("\\\\")) return "bind";
  return /^(\/|\.\/|\.\.\/|~|\.$|\.\.$)/.test(source) ? "bind" : "named";
}

/**
 * Splits on ":" outside `${...}`, keeping a Windows drive prefix (C:\ or C:/)
 * at the start of a part.
 */
function splitMountSpec(raw: string): string[] {
  const colons = separators(raw, ":");
  const kept: number[] = [];
  let partStart = 0;
  for (const c of colons) {
    if (c === partStart + 1 && WINDOWS_PATH.test(raw.slice(partStart))) continue;
    kept.push(c);
    partStart = c + 1;
  }
  return splitAt(raw, kept);
}

function parseShortMount(raw: string): Omit<Mount, "index"> | undefined {
  const parts = splitMountSpec(raw);
  if (parts.length === 1) return raw === "" ? undefined : { kind: "anonymous", target: raw, readOnly: false };
  const [source = "", target = "", mode = ""] = parts;
  if (parts.length > 3 || parts.some((part) => part === "")) return undefined;
  const kind = classifySource(source);
  return { kind, source: kind === "bind" ? redactUrlCredentials(source) : source, target, readOnly: mode.split(",").includes("ro") };
}

function parseLongMount(entry: Obj): Omit<Mount, "index"> | undefined {
  const type = str(entry["type"]);
  const source = str(entry["source"]);
  const target = str(entry["target"]);
  const readOnly = entry["read_only"] === true;
  let kind: Mount["kind"];
  if (type === "volume") kind = source ? (hasVariable(source) ? "unresolved" : "named") : "anonymous";
  else if (type === "bind") kind = "bind";
  else if (type === "tmpfs") kind = "tmpfs";
  else if (type === undefined) return undefined;
  else kind = "other";
  const mount: Omit<Mount, "index"> = { kind, readOnly };
  if (source) mount.source = kind === "bind" || kind === "other" ? redactUrlCredentials(source) : source;
  if (target) mount.target = target;
  if (kind === "other") mount.type = type;
  return mount;
}

function normalizeVolumes(ctx: Context, value: unknown, path: DocumentPath, seen: Unanalyzed): Mount[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    ctx.schema(path, "`volumes` must be a list.");
    return [];
  }
  const result: Mount[] = [];
  value.forEach((entry, i) => {
    if (isObj(entry)) noteSubKeys(seen, "volumes", entry);
    const mount =
      typeof entry === "string" ? parseShortMount(entry) : isObj(entry) ? parseLongMount(entry) : undefined;
    if (mount) result.push({ ...mount, index: i });
    else ctx.schema([...path, i], "Invalid volume mount.");
  });
  return result;
}

// ---------- depends_on ----------

const CONDITIONS: readonly DependencyCondition[] = [
  "service_started",
  "service_healthy",
  "service_completed_successfully",
];

/** Compose accepts booleans and the strings "true"/"false" in any case. */
function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const lower = value.toLowerCase();
  return lower === "true" ? true : lower === "false" ? false : undefined;
}

function normalizeDependsOn(ctx: Context, value: unknown, path: DocumentPath): Dependency[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((name, i) => {
      if (typeof name !== "string") {
        ctx.schema([...path, i], "`depends_on` entries must be service names.");
        return [];
      }
      return [{ service: name, condition: "service_started" as const, required: true, restart: false }];
    });
  }
  if (isObj(value)) {
    // Invalid entries are reported and dropped, never replaced by a default condition.
    return Object.entries(value).flatMap(([service, options]): Dependency[] => {
      const at = [...path, service];
      if (!isObj(options)) {
        ctx.schema(at, "A `depends_on` entry must be a mapping.");
        return [];
      }
      const opts = options;
      // An omitted key takes the default; an explicit null is invalid.
      const condition = "condition" in opts ? opts["condition"] : "service_started";
      const required = toBoolean("required" in opts ? opts["required"] : true);
      const restart = toBoolean("restart" in opts ? opts["restart"] : false);
      let valid = true;
      if (!CONDITIONS.includes(condition as DependencyCondition)) {
        ctx.schema([...at, "condition"], "Unknown `depends_on` condition.");
        valid = false;
      }
      if (required === undefined) {
        ctx.schema([...at, "required"], "`required` must be true or false.");
        valid = false;
      }
      if (restart === undefined) {
        ctx.schema([...at, "restart"], "`restart` must be true or false.");
        valid = false;
      }
      if (!valid || required === undefined || restart === undefined) return [];
      return [{ service, condition: condition as DependencyCondition, required, restart }];
    });
  }
  ctx.schema(path, "`depends_on` must be a list or a mapping.");
  return [];
}

// ---------- networks ----------

function normalizeServiceNetworks(
  ctx: Context,
  value: unknown,
  networkMode: string | undefined,
  path: DocumentPath,
  seen: Unanalyzed,
): ServiceNetwork[] {
  let names: string[] = [];
  const attributes = new Map<string, Omit<ServiceNetwork, "name" | "implicit">>();
  if (Array.isArray(value)) {
    names = value.filter((n): n is string => typeof n === "string");
    if (names.length !== value.length) ctx.schema(path, "`networks` entries must be network names.");
  } else if (isObj(value)) {
    names = Object.keys(value);
    for (const [name, entry] of Object.entries(value)) {
      if (entry === null || entry === undefined) continue;
      if (!isObj(entry)) {
        ctx.schema([...path, name], "A network entry must be a mapping or empty.");
        continue;
      }
      noteSubKeys(seen, "networks", entry);
      const attrs: Omit<ServiceNetwork, "name" | "implicit"> = {};
      const aliases = entry["aliases"];
      if (Array.isArray(aliases) && aliases.every((a) => str(a) !== undefined)) attrs.aliases = aliases.map((a) => str(a)!);
      else if (aliases !== undefined && aliases !== null) ctx.schema([...path, name, "aliases"], "`aliases` must be a list of names.");
      const ipv4 = str(entry["ipv4_address"]);
      const ipv6 = str(entry["ipv6_address"]);
      if (ipv4 !== undefined) attrs.ipv4Address = ipv4;
      if (ipv6 !== undefined) attrs.ipv6Address = ipv6;
      attributes.set(name, attrs);
    }
  } else if (value !== undefined && value !== null) {
    ctx.schema(path, "`networks` must be a list or a mapping.");
  }
  if (networkMode !== undefined) {
    // Compose rejects the combination even when `networks` is empty.
    if (value !== undefined) ctx.schema(path, "`networks` and `network_mode` can't be used together.");
    return [];
  }
  if (names.length === 0) return [{ name: "default", implicit: true }];
  return names.map((name) => ({ name, implicit: false, ...attributes.get(name) }));
}

// ---------- service ----------

function keysOf(ctx: Context, value: unknown, path: DocumentPath, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const text = str(entry);
      return text === undefined ? [] : [text.split("=")[0] ?? text];
    });
  }
  if (isObj(value)) return Object.keys(value);
  ctx.schema(path, `\`${field}\` must be a list or a mapping.`);
  return [];
}

function normalizeBuild(ctx: Context, value: unknown, path: DocumentPath, seen: Unanalyzed): BuildInfo | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return { context: redactUrlCredentials(value), argKeys: [] };
  if (!isObj(value)) {
    ctx.schema(path, "`build` must be a string or a mapping.");
    return undefined;
  }
  noteSubKeys(seen, "build", value);
  const build: BuildInfo = { argKeys: keysOf(ctx, value["args"], [...path, "args"], "build.args") };
  const context = str(value["context"]);
  const dockerfile = str(value["dockerfile"]);
  const target = str(value["target"]);
  if (context !== undefined) build.context = redactUrlCredentials(context);
  if (dockerfile !== undefined) build.dockerfile = redactUrlCredentials(dockerfile);
  if (target !== undefined) build.target = target;
  return build;
}

function parseNetworkMode(raw: string): NetworkMode {
  if (hasVariable(raw)) return { kind: "unresolved", raw };
  if (raw === "none" || raw === "host") return { kind: raw };
  if (raw.startsWith("service:")) return { kind: "service", service: raw.slice("service:".length) };
  if (raw.startsWith("container:")) return { kind: "container", container: raw.slice("container:".length) };
  return { kind: "other", raw };
}

/** A string, or a list of strings/numbers. Returns the entries as strings. */
function stringList(ctx: Context, value: unknown, path: DocumentPath, field: string, allowString = false): string[] {
  if (value === undefined || value === null) return [];
  if (allowString && typeof value === "string") return [value];
  if (Array.isArray(value)) {
    const items = value.map(str);
    if (items.every((i): i is string => i !== undefined)) return items;
  }
  ctx.schema(path, `\`${field}\` must be a list${allowString ? " or a string" : ""}.`);
  return [];
}

/** Names from a list of names or `{ source: name, … }` entries (service secrets/configs). */
function sourceNames(ctx: Context, value: unknown, path: DocumentPath, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    const names = value.map((entry) => (isObj(entry) ? str(entry["source"]) : str(entry)));
    if (names.every((n): n is string => n !== undefined)) return names;
  }
  ctx.schema(path, `\`${field}\` must be a list of names or mappings with \`source\`.`);
  return [];
}

/** env_file: a path, or a list of paths or `{ path, required }`. Paths only; files are never read. */
function envFilePaths(ctx: Context, value: unknown, path: DocumentPath): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value === "string") return [redactUrlCredentials(value)];
  if (Array.isArray(value)) {
    const paths = value.map((entry) => (isObj(entry) ? str(entry["path"]) : str(entry)));
    if (paths.every((p): p is string => p !== undefined)) return paths.map(redactUrlCredentials);
  }
  ctx.schema(path, "`env_file` must be a path or a list of paths.");
  return [];
}

function reportUnsupportedServiceKeys(ctx: Context, def: Obj, path: DocumentPath) {
  const keys = Object.keys(def).filter((k) => !isExtension(k));
  for (const key of keys.filter((k) => SERVICE_INCOMPLETE.has(k))) {
    ctx.report("unsupported", "warning", [...path, key], `\`${key}\` is not supported. The result may be incomplete.`);
  }
  const noted = keys.filter((k) => !SERVICE_KNOWN.has(k) && !SERVICE_INCOMPLETE.has(k));
  if (noted.length > 0) {
    ctx.report("unsupported", "info", path, `Not analyzed: ${noted.map((k) => `\`${k}\``).join(", ")}.`);
  }
}

function normalizeService(ctx: Context, name: string, value: unknown): Service {
  const path = ["services", name];
  const def: Obj = isObj(value) ? value : {};
  if (!isObj(value) && value !== null) ctx.schema(path, "A service must be a mapping.");
  reportUnsupportedServiceKeys(ctx, def, path);

  const networkModeRaw = str(def["network_mode"]);
  const seen: Unanalyzed = new Map();
  const service: Service = {
    name,
    ports: normalizePorts(ctx, def["ports"], [...path, "ports"], seen),
    expose: stringList(ctx, def["expose"], [...path, "expose"], "expose"),
    networks: normalizeServiceNetworks(ctx, def["networks"], networkModeRaw, [...path, "networks"], seen),
    volumes: normalizeVolumes(ctx, def["volumes"], [...path, "volumes"], seen),
    tmpfs: stringList(ctx, def["tmpfs"], [...path, "tmpfs"], "tmpfs", true),
    dependsOn: normalizeDependsOn(ctx, def["depends_on"], [...path, "depends_on"]),
    environmentKeys: keysOf(ctx, def["environment"], [...path, "environment"], "environment"),
    envFiles: envFilePaths(ctx, def["env_file"], [...path, "env_file"]),
    secrets: sourceNames(ctx, def["secrets"], [...path, "secrets"], "secrets"),
    configs: sourceNames(ctx, def["configs"], [...path, "configs"], "configs"),
    profiles: stringList(ctx, def["profiles"], [...path, "profiles"], "profiles"),
    hasHealthcheck: isObj(def["healthcheck"]) && def["healthcheck"]["disable"] !== true,
  };
  const image = str(def["image"]);
  const build = normalizeBuild(ctx, def["build"], [...path, "build"], seen);
  const containerName = str(def["container_name"]);
  const hostname = str(def["hostname"]);
  const restart = str(def["restart"]);
  if (image !== undefined) service.image = redactUrlCredentials(image);
  if (build) service.build = build;
  if (containerName !== undefined) service.containerName = containerName;
  if (hostname !== undefined) service.hostname = hostname;
  if (restart !== undefined) service.restart = restart;
  if (networkModeRaw !== undefined) service.networkMode = parseNetworkMode(networkModeRaw);
  for (const field of Object.keys(SUB_KEYS_KNOWN) as (keyof typeof SUB_KEYS_KNOWN)[]) {
    const keys = seen.get(field);
    if (!keys) continue;
    ctx.report("unsupported", "info", [...path, field], `Not analyzed in \`${field}\`: ${[...keys].map((k) => `\`${k}\``).join(", ")}.`);
  }
  return service;
}

function reportTopLevelKeys(ctx: Context, root: Obj) {
  for (const key of Object.keys(root)) {
    if (TOP_LEVEL_KNOWN.has(key) || isExtension(key)) continue;
    if (key === "version") {
      ctx.report("unsupported", "info", [key], "`version` is obsolete in the Compose Specification and is ignored.");
    } else if (TOP_LEVEL_INCOMPLETE.has(key)) {
      ctx.report("unsupported", "warning", [key], `\`${key}\` is not supported. The result may be incomplete.`);
    } else {
      ctx.report("unsupported", "info", [key], `Top-level \`${key}\` is not analyzed.`);
    }
  }
}

function normalizeResources(ctx: Context, value: unknown, field: "networks" | "volumes" | "secrets" | "configs"): ResourceDef[] {
  if (value === undefined || value === null) return [];
  if (!isObj(value)) {
    ctx.schema([field], `Top-level \`${field}\` must be a mapping.`);
    return [];
  }
  return Object.entries(value).map(([name, def]) => ({
    name,
    external: isObj(def) && def["external"] === true,
    implicit: false,
  }));
}

/** Turns the parsed YAML value into a ComposeModel, collecting diagnostics. */
export function normalize(
  value: unknown,
  locate: Locate,
): { model?: ComposeModel; diagnostics: Diagnostic[]; suppressed?: Context["suppressed"] } {
  const ctx = new Context(locate);
  if (!isObj(value)) {
    ctx.schema([], "A Compose file must be a mapping with a `services` key.");
    return { diagnostics: ctx.diagnostics };
  }
  const services = value["services"];
  if (!isObj(services)) {
    ctx.schema(["services"], "`services` must be a mapping of service names to definitions.");
    return { diagnostics: ctx.diagnostics };
  }
  const serviceNames = Object.keys(services);
  if (serviceNames.length > LIMITS.maxServices) {
    ctx.diagnostics.push({
      code: "limit",
      severity: "error",
      message: `More than ${LIMITS.maxServices} services.`,
      location: { path: ["services"] },
    });
    return { diagnostics: ctx.diagnostics };
  }

  reportTopLevelKeys(ctx, value);
  const normalizedServices = serviceNames.map((name) => normalizeService(ctx, name, services[name]));
  const portCount = normalizedServices.reduce((n, s) => n + s.ports.length, 0);
  if (portCount > LIMITS.maxPorts) {
    return {
      diagnostics: [
        { code: "limit", severity: "error", message: `More than ${LIMITS.maxPorts} port mappings.`, location: { path: ["services"] } },
      ],
    };
  }
  const model: ComposeModel = {
    services: normalizedServices,
    networks: normalizeResources(ctx, value["networks"], "networks"),
    volumes: normalizeResources(ctx, value["volumes"], "volumes"),
    secrets: normalizeResources(ctx, value["secrets"], "secrets"),
    configs: normalizeResources(ctx, value["configs"], "configs"),
  };
  const projectName = str(value["name"]);
  if (projectName !== undefined) model.name = projectName;

  // Compose creates `default` unless the file declares it.
  const usesDefault = model.services.some((s) => s.networks.some((n) => n.name === "default"));
  if (usesDefault && !model.networks.some((n) => n.name === "default")) {
    model.networks.unshift({ name: "default", external: false, implicit: true });
  }

  checkModel(ctx, model);
  return { model, diagnostics: ctx.diagnostics, suppressed: ctx.suppressed };
}
