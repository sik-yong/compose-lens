import type { DocumentPath } from "./diagnostics.js";
import type { ComposeModel, PortMapping, Service } from "./model.js";
import { hasVariable, type Context } from "./context.js";
import { hostIp, hostIpsOverlap, type HostIp } from "./ip.js";

const servicePath = (s: Service, ...rest: (string | number)[]): DocumentPath => ["services", s.name, ...rest];

function checkReferences(ctx: Context, model: ComposeModel) {
  const services = new Set(model.services.map((s) => s.name));
  const networks = new Set(model.networks.map((n) => n.name));
  const volumes = new Set(model.volumes.map((v) => v.name));
  const declared = { secrets: new Set(model.secrets.map((r) => r.name)), configs: new Set(model.configs.map((r) => r.name)) };

  for (const s of model.services) {
    for (const dep of s.dependsOn) {
      if (hasVariable(dep.service)) {
        ctx.report("unresolved", "warning", servicePath(s, "depends_on"), `A dependency of \`${s.name}\` contains a variable. Its reference is not checked.`);
      } else if (!services.has(dep.service)) {
        ctx.report("reference", "error", servicePath(s, "depends_on"), `\`${s.name}\` depends on an undefined service \`${dep.service}\`.`);
      }
    }
    for (const n of s.networks) {
      if (n.implicit || n.name === "default" || networks.has(n.name)) continue;
      if (hasVariable(n.name)) {
        ctx.report("unresolved", "warning", servicePath(s, "networks"), `A network name of \`${s.name}\` contains a variable. Its reference is not checked.`);
      } else {
        ctx.report("reference", "error", servicePath(s, "networks"), `\`${s.name}\` uses an undeclared network \`${n.name}\`.`);
      }
    }
    for (const kind of ["secrets", "configs"] as const) {
      for (const name of s[kind]) {
        if (declared[kind].has(name)) continue;
        if (hasVariable(name)) {
          ctx.report("unresolved", "warning", servicePath(s, kind), `A ${kind.slice(0, -1)} name of \`${s.name}\` contains a variable. Its reference is not checked.`);
        } else {
          ctx.report("reference", "error", servicePath(s, kind), `\`${s.name}\` uses an undeclared ${kind.slice(0, -1)} \`${name}\`.`);
        }
      }
    }
    for (const m of s.volumes) {
      if (m.kind === "named" && m.source && !volumes.has(m.source)) {
        ctx.report("reference", "error", servicePath(s, "volumes", m.index), `\`${s.name}\` uses an undeclared volume \`${m.source}\`.`);
      } else if (m.kind === "unresolved") {
        ctx.report("unresolved", "warning", servicePath(s, "volumes", m.index), "The volume source contains a variable. Its kind and reference are not checked.");
      } else if (m.kind === "other") {
        ctx.report("unsupported", "info", servicePath(s, "volumes", m.index), `Mount type \`${m.type}\` is not analyzed.`);
      }
    }
  }
}

function checkNetworkModes(ctx: Context, model: ComposeModel) {
  const services = new Set(model.services.map((s) => s.name));
  for (const s of model.services) {
    const mode = s.networkMode;
    const at = servicePath(s, "network_mode");
    if (!mode) continue;
    if (mode.kind === "service" && !services.has(mode.service)) {
      ctx.report("reference", "error", at, `\`${s.name}\` shares the network stack of an undefined service \`${mode.service}\`.`);
    } else if (mode.kind === "container") {
      ctx.report("unverifiable", "info", at, `\`${s.name}\` uses the network stack of an external container. Its existence is not verified.`);
    } else if (mode.kind === "other") {
      ctx.report("unsupported", "info", at, `\`network_mode\` of \`${s.name}\` is not analyzed.`);
    } else if (mode.kind === "unresolved") {
      ctx.report("unresolved", "warning", at, `\`network_mode\` of \`${s.name}\` contains a variable. Its networks are not determined.`);
    }
  }
}

type Binding = { service: Service; port: PortMapping; protocol: string; start: number; end: number; ip: HostIp };

/**
 * Reports every fixed binding that overlaps another one, once per binding and
 * in file order, naming one counterpart. A sweep over sorted ranges keeps this
 * near-linear (bounded by LIMITS.maxPorts in the worst case of many IPs).
 */
function checkPortConflicts(ctx: Context, model: ComposeModel) {
  const fixed: Binding[] = [];
  const pools: Binding[] = [];
  for (const s of model.services) {
    for (const p of s.ports) {
      if (p.host.kind === "fixed") {
        fixed.push({
          service: s,
          port: p,
          protocol: p.protocol.toLowerCase(),
          start: p.host.ports.start,
          end: p.host.ports.end,
          ip: hostIp(p.hostIp),
        });
      } else if (p.host.kind === "pool") {
        pools.push({
          service: s,
          port: p,
          protocol: p.protocol.toLowerCase(),
          start: p.host.ports.start,
          end: p.host.ports.end,
          ip: hostIp(p.hostIp),
        });
      } else if (p.host.kind === "unresolved") {
        ctx.report("unresolved", "warning", servicePath(s, "ports", p.index), "The port contains a variable. It is not checked for conflicts.");
      }
    }
  }
  const order = fixed.map((_, i) => i).sort((x, y) => fixed[x]!.start - fixed[y]!.start || x - y);
  const active = new Map<string, number[]>();
  const counterpart = new Map<number, number>();
  for (const i of order) {
    const cur = fixed[i]!;
    const list = (active.get(cur.protocol) ?? []).filter((j) => fixed[j]!.end >= cur.start);
    for (const k of list) {
      if (!hostIpsOverlap(fixed[k]!.ip, cur.ip)) continue;
      if (!counterpart.has(i)) counterpart.set(i, k);
      if (!counterpart.has(k)) counterpart.set(k, i);
    }
    list.push(i);
    active.set(cur.protocol, list);
  }
  for (const [i, j] of [...counterpart].sort((x, y) => x[0] - y[0])) {
    const b = fixed[i]!;
    const other = fixed[j]!;
    const port = Math.max(b.start, other.start);
    const who =
      b.service === other.service
        ? `\`${b.service.name}\` publishes`
        : `\`${b.service.name}\` and \`${other.service.name}\` publish`;
    ctx.report(
      "conflict",
      "warning",
      servicePath(b.service, "ports", b.port.index),
      `${who} host port ${port}/${b.port.protocol} more than once. They may conflict if run together (the host itself is not checked).`,
    );
  }
  checkPortPools(ctx, fixed, pools);
}

/**
 * Notes each pool binding (a host range with one container port) whose range
 * overlaps a fixed binding. Docker picks a free port from the pool when the
 * container starts, so whether they collide depends on start order.
 */
function checkPortPools(ctx: Context, fixed: Binding[], pools: Binding[]) {
  for (const pool of pools) {
    const other = fixed.find(
      (b) => b.protocol === pool.protocol && b.start <= pool.end && b.end >= pool.start && hostIpsOverlap(b.ip, pool.ip),
    );
    if (!other) continue;
    const range = `${pool.start}-${pool.end}/${pool.port.protocol}`;
    const port = Math.max(pool.start, other.start);
    ctx.report(
      "conflict",
      "info",
      servicePath(pool.service, "ports", pool.port.index),
      `\`${pool.service.name}\` takes one free host port from ${range}, which overlaps host port ${port} of \`${other.service.name}\`. They may conflict depending on which starts first.`,
    );
  }
}

function checkExternalAndProfiles(ctx: Context, model: ComposeModel) {
  for (const kind of ["networks", "volumes", "secrets", "configs"] as const) {
    for (const r of model[kind]) {
      if (r.external) {
        ctx.report("unverifiable", "info", [kind, r.name], `External ${kind.slice(0, -1)} \`${r.name}\`: its existence is not verified.`);
      }
    }
  }
  const withProfiles = model.services.find((s) => s.profiles.length > 0);
  if (withProfiles) {
    ctx.report("unsupported", "info", servicePath(withProfiles, "profiles"), "Profiles are not evaluated. All services are treated as active.");
  }
}

/** Semantic checks on a normalized model (PRD §6–7). */
export function checkModel(ctx: Context, model: ComposeModel) {
  checkReferences(ctx, model);
  checkNetworkModes(ctx, model);
  checkPortConflicts(ctx, model);
  checkExternalAndProfiles(ctx, model);
}
