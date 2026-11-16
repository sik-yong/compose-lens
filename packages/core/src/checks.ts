import type { DocumentPath } from "./diagnostics.js";
import type { ComposeModel, PortMapping, Service } from "./model.js";
import { hasVariable, type Context } from "./context.js";

const servicePath = (s: Service, ...rest: (string | number)[]): DocumentPath => ["services", s.name, ...rest];

function checkReferences(ctx: Context, model: ComposeModel) {
  const services = new Set(model.services.map((s) => s.name));
  const networks = new Set(model.networks.map((n) => n.name));
  const volumes = new Set(model.volumes.map((v) => v.name));

  for (const s of model.services) {
    for (const dep of s.dependsOn) {
      if (!services.has(dep.service)) {
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

/** Interfaces that cover every address of their family (or all, when unset). */
const isWildcard = (ip: string | undefined) => ip === undefined || ip === "0.0.0.0" || ip === "::";
const ipsOverlap = (a: string | undefined, b: string | undefined) => isWildcard(a) || isWildcard(b) || a === b;

function checkPortConflicts(ctx: Context, model: ComposeModel) {
  const fixed: { service: Service; port: PortMapping; start: number; end: number }[] = [];
  for (const s of model.services) {
    for (const p of s.ports) {
      if (p.host.kind === "fixed") fixed.push({ service: s, port: p, start: p.host.ports.start, end: p.host.ports.end });
      if (p.host.kind === "unresolved") {
        ctx.report("unresolved", "warning", servicePath(s, "ports", p.index), "The port contains a variable. It is not checked for conflicts.");
      }
    }
  }
  for (let i = 0; i < fixed.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = fixed[j]!;
      const b = fixed[i]!;
      if (a.port.protocol.toLowerCase() !== b.port.protocol.toLowerCase()) continue;
      if (a.end < b.start || b.end < a.start) continue;
      if (!ipsOverlap(a.port.hostIp, b.port.hostIp)) continue;
      const port = Math.max(a.start, b.start);
      const who = a.service === b.service ? `\`${a.service.name}\` publishes` : `\`${a.service.name}\` and \`${b.service.name}\` publish`;
      ctx.report(
        "conflict",
        "warning",
        servicePath(b.service, "ports", b.port.index),
        `${who} host port ${port}/${b.port.protocol} more than once. They may conflict if run together (the host itself is not checked).`,
      );
    }
  }
}

function checkExternalAndProfiles(ctx: Context, model: ComposeModel) {
  for (const kind of ["networks", "volumes"] as const) {
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
