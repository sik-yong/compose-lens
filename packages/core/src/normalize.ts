import type { Diagnostic, DiagnosticLocation, DocumentPath } from "./diagnostics.js";
import { LIMITS } from "./limits.js";
import type {
  BuildInfo,
  ComposeModel,
  Dependency,
  DependencyCondition,
  Mount,
  PortMapping,
  PortRange,
  ResourceDef,
  Service,
  ServiceNetwork,
} from "./model.js";

type Locate = (path: DocumentPath) => DiagnosticLocation;
type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
/** True if the value contains Compose interpolation (`$$` is a literal `$`). */
const hasVariable = (s: string) => s.replaceAll("$$", "").includes("$");
const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;

class Context {
  readonly diagnostics: Diagnostic[] = [];
  constructor(readonly locate: Locate) {}

  schema(path: DocumentPath, message: string) {
    this.diagnostics.push({ code: "schema", severity: "error", message, location: this.locate(path) });
  }
}

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

function hostBinding(host: string | undefined, container: PortRange | undefined): PortMapping["host"] {
  if (host === undefined || host === "") return { kind: "dynamic" };
  if (hasVariable(host)) return { kind: "unresolved" };
  const ports = parseRange(host);
  if (!ports) return { kind: "unresolved" };
  if (rangeSize(ports) > 1 && container && rangeSize(container) === 1) return { kind: "pool", ports };
  return { kind: "fixed", ports };
}

function parseShortPort(raw: string): PortMapping | undefined {
  let rest = raw;
  let protocol = "tcp";
  const slash = rest.lastIndexOf("/");
  if (slash >= 0) {
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
  const parts = rest.split(":");
  const containerText = parts.pop() ?? "";
  const hostText = parts.length > 0 ? parts.pop() : undefined;
  if (hostIp === undefined && parts.length > 0) hostIp = parts.join(":");

  const container = hasVariable(containerText) ? undefined : parseRange(containerText);
  if (!container && !hasVariable(containerText)) return undefined;
  const mapping: PortMapping = { raw, host: hostBinding(hostText, container), protocol };
  if (container) mapping.container = container;
  if (hostIp) mapping.hostIp = hostIp;
  return mapping;
}

function parseLongPort(entry: Obj): PortMapping | undefined {
  const target = str(entry["target"]);
  if (target === undefined) return undefined;
  const container = hasVariable(target) ? undefined : parseRange(target);
  if (!container && !hasVariable(target)) return undefined;
  const published = str(entry["published"]);
  const hostIp = str(entry["host_ip"]);
  const protocol = str(entry["protocol"]) ?? "tcp";
  const raw = `${hostIp ? `${hostIp}:` : ""}${published ? `${published}:` : ""}${target}/${protocol}`;
  const mapping: PortMapping = { raw, host: hostBinding(published, container), protocol };
  if (container) mapping.container = container;
  if (hostIp) mapping.hostIp = hostIp;
  return mapping;
}

function normalizePorts(ctx: Context, value: unknown, path: DocumentPath): PortMapping[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    ctx.schema(path, "`ports` must be a list.");
    return [];
  }
  const result: PortMapping[] = [];
  value.forEach((entry, i) => {
    const text = str(entry);
    const mapping = text !== undefined ? parseShortPort(text) : isObj(entry) ? parseLongPort(entry) : undefined;
    if (mapping) result.push(mapping);
    else ctx.schema([...path, i], "Unrecognized port format.");
  });
  return result;
}

// ---------- volumes ----------

function classifySource(source: string): Mount["kind"] {
  if (hasVariable(source)) return "unresolved";
  return /^(\/|\.\/|\.\.\/|~|\.$|\.\.$)/.test(source) ? "bind" : "named";
}

function parseShortMount(raw: string): Mount {
  const parts = raw.split(":");
  if (parts.length === 1) return { kind: "anonymous", target: raw, readOnly: false };
  const [source = "", target = "", mode = ""] = parts;
  const mount: Mount = { kind: classifySource(source), source, target, readOnly: mode.split(",").includes("ro") };
  return mount;
}

function parseLongMount(entry: Obj): Mount | undefined {
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
  const mount: Mount = { kind, readOnly };
  if (source) mount.source = source;
  if (target) mount.target = target;
  if (kind === "other") mount.type = type;
  return mount;
}

function normalizeVolumes(ctx: Context, value: unknown, path: DocumentPath): Mount[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    ctx.schema(path, "`volumes` must be a list.");
    return [];
  }
  const result: Mount[] = [];
  value.forEach((entry, i) => {
    const mount =
      typeof entry === "string" ? parseShortMount(entry) : isObj(entry) ? parseLongMount(entry) : undefined;
    if (mount) result.push(mount);
    else ctx.schema([...path, i], "Unrecognized volume format.");
  });
  return result;
}

// ---------- depends_on ----------

const CONDITIONS: readonly DependencyCondition[] = [
  "service_started",
  "service_healthy",
  "service_completed_successfully",
];

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
    return Object.entries(value).map(([service, options]) => {
      const opts = isObj(options) ? options : {};
      const condition = str(opts["condition"]);
      if (condition !== undefined && !CONDITIONS.includes(condition as DependencyCondition)) {
        ctx.schema([...path, service, "condition"], "Unknown `depends_on` condition.");
      }
      return {
        service,
        condition: CONDITIONS.includes(condition as DependencyCondition)
          ? (condition as DependencyCondition)
          : "service_started",
        required: opts["required"] !== false,
        restart: opts["restart"] === true,
      };
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
): ServiceNetwork[] {
  let names: string[] = [];
  if (Array.isArray(value)) {
    names = value.filter((n): n is string => typeof n === "string");
    if (names.length !== value.length) ctx.schema(path, "`networks` entries must be network names.");
  } else if (isObj(value)) {
    names = Object.keys(value);
  } else if (value !== undefined && value !== null) {
    ctx.schema(path, "`networks` must be a list or a mapping.");
  }
  if (networkMode !== undefined) {
    if (names.length > 0) ctx.schema(path, "`networks` and `network_mode` can't be used together.");
    return [];
  }
  if (names.length === 0) return [{ name: "default", implicit: true }];
  return names.map((name) => ({ name, implicit: false }));
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

function normalizeBuild(ctx: Context, value: unknown, path: DocumentPath): BuildInfo | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return { context: value, argKeys: [] };
  if (!isObj(value)) {
    ctx.schema(path, "`build` must be a string or a mapping.");
    return undefined;
  }
  const build: BuildInfo = { argKeys: keysOf(ctx, value["args"], [...path, "args"], "build.args") };
  const context = str(value["context"]);
  const dockerfile = str(value["dockerfile"]);
  const target = str(value["target"]);
  if (context !== undefined) build.context = context;
  if (dockerfile !== undefined) build.dockerfile = dockerfile;
  if (target !== undefined) build.target = target;
  return build;
}

function normalizeService(ctx: Context, name: string, value: unknown): Service {
  const path = ["services", name];
  const def: Obj = isObj(value) ? value : {};
  if (!isObj(value) && value !== null) ctx.schema(path, "A service must be a mapping.");

  const networkMode = str(def["network_mode"]);
  const service: Service = {
    name,
    ports: normalizePorts(ctx, def["ports"], [...path, "ports"]),
    networks: normalizeServiceNetworks(ctx, def["networks"], networkMode, [...path, "networks"]),
    volumes: normalizeVolumes(ctx, def["volumes"], [...path, "volumes"]),
    dependsOn: normalizeDependsOn(ctx, def["depends_on"], [...path, "depends_on"]),
    environmentKeys: keysOf(ctx, def["environment"], [...path, "environment"], "environment"),
  };
  const image = str(def["image"]);
  const build = normalizeBuild(ctx, def["build"], [...path, "build"]);
  const containerName = str(def["container_name"]);
  const restart = str(def["restart"]);
  if (image !== undefined) service.image = image;
  if (build) service.build = build;
  if (containerName !== undefined) service.containerName = containerName;
  if (restart !== undefined) service.restart = restart;
  if (networkMode !== undefined) service.networkMode = networkMode;
  return service;
}

function normalizeResources(ctx: Context, value: unknown, field: "networks" | "volumes"): ResourceDef[] {
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

// ---------- references ----------

function checkReferences(ctx: Context, model: ComposeModel) {
  const services = new Set(model.services.map((s) => s.name));
  const networks = new Set(model.networks.map((n) => n.name));
  const volumes = new Set(model.volumes.map((v) => v.name));
  const reference = (path: DocumentPath, message: string) =>
    ctx.diagnostics.push({ code: "reference", severity: "error", message, location: ctx.locate(path) });

  for (const s of model.services) {
    for (const dep of s.dependsOn) {
      if (!services.has(dep.service)) {
        reference(["services", s.name, "depends_on"], `\`${s.name}\` depends on an undefined service \`${dep.service}\`.`);
      }
    }
    for (const n of s.networks) {
      if (!n.implicit && n.name !== "default" && !networks.has(n.name) && !hasVariable(n.name)) {
        reference(["services", s.name, "networks"], `\`${s.name}\` uses an undeclared network \`${n.name}\`.`);
      }
    }
    for (const m of s.volumes) {
      if (m.kind === "named" && m.source && !volumes.has(m.source)) {
        reference(["services", s.name, "volumes"], `\`${s.name}\` uses an undeclared volume \`${m.source}\`.`);
      }
    }
  }
}

/** Turns the parsed YAML value into a ComposeModel, collecting diagnostics. */
export function normalize(
  value: unknown,
  locate: Locate,
): { model?: ComposeModel; diagnostics: Diagnostic[] } {
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

  const model: ComposeModel = {
    services: serviceNames.map((name) => normalizeService(ctx, name, services[name])),
    networks: normalizeResources(ctx, value["networks"], "networks"),
    volumes: normalizeResources(ctx, value["volumes"], "volumes"),
  };
  const projectName = str(value["name"]);
  if (projectName !== undefined) model.name = projectName;

  // Compose creates `default` unless the file declares it.
  const usesDefault = model.services.some((s) => s.networks.some((n) => n.name === "default"));
  if (usesDefault && !model.networks.some((n) => n.name === "default")) {
    model.networks.unshift({ name: "default", external: false, implicit: true });
  }

  checkReferences(ctx, model);
  return { model, diagnostics: ctx.diagnostics };
}
