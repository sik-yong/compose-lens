import type { Diagnostic } from "./diagnostics.js";
import { LIMITS } from "./limits.js";
import type { ComposeModel, DependencyCondition } from "./model.js";

export type GraphNodeKind = "service" | "network" | "volume" | "secret" | "config";
export type GraphEdgeKind = "depends_on" | "network" | "volume" | "network_mode" | "secret" | "config";

export interface GraphNode {
  /** Internal id (svc_1, net_1, vol_1, sec_1, cfg_1). Never derived from input text. */
  id: string;
  kind: GraphNodeKind;
  /** Name from the Compose file. Render as text only. */
  label: string;
  external: boolean;
  implicit: boolean;
}

export interface GraphEdge {
  id: string;
  kind: GraphEdgeKind;
  /** depends_on / network_mode: the dependent service. Others: the service. */
  source: string;
  /** depends_on / network_mode: the other service. Others: the resource. */
  target: string;
  label?: string;
  /** depends_on with required: false. */
  optional: boolean;
}

export interface ComposeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const CONDITION_LABELS: Record<DependencyCondition, string> = {
  service_started: "starts after",
  service_healthy: "after healthy",
  service_completed_successfully: "after successful completion",
};

/** Builds the graph. Edges to undefined targets are dropped (they are `reference` diagnostics). */
export function toGraph(model: ComposeModel): { graph?: ComposeGraph; diagnostics: Diagnostic[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const serviceIds = new Map<string, string>();
  const networkIds = new Map<string, string>();
  const volumeIds = new Map<string, string>();
  const secretIds = new Map<string, string>();
  const configIds = new Map<string, string>();

  model.services.forEach((s, i) => {
    const id = `svc_${i + 1}`;
    serviceIds.set(s.name, id);
    nodes.push({ id, kind: "service", label: s.name, external: false, implicit: false });
  });
  model.networks.forEach((n, i) => {
    const id = `net_${i + 1}`;
    networkIds.set(n.name, id);
    nodes.push({ id, kind: "network", label: n.name, external: n.external, implicit: n.implicit });
  });
  model.volumes.forEach((v, i) => {
    const id = `vol_${i + 1}`;
    volumeIds.set(v.name, id);
    nodes.push({ id, kind: "volume", label: v.name, external: v.external, implicit: false });
  });
  model.secrets.forEach((r, i) => {
    const id = `sec_${i + 1}`;
    secretIds.set(r.name, id);
    nodes.push({ id, kind: "secret", label: r.name, external: r.external, implicit: false });
  });
  model.configs.forEach((r, i) => {
    const id = `cfg_${i + 1}`;
    configIds.set(r.name, id);
    nodes.push({ id, kind: "config", label: r.name, external: r.external, implicit: false });
  });

  const add = (edge: Omit<GraphEdge, "id">) => edges.push({ ...edge, id: `e_${edges.length + 1}` });
  for (const s of model.services) {
    const source = serviceIds.get(s.name)!;
    for (const dep of s.dependsOn) {
      const target = serviceIds.get(dep.service);
      if (target) {
        add({ kind: "depends_on", source, target, label: CONDITION_LABELS[dep.condition], optional: !dep.required });
      }
    }
    if (s.networkMode?.kind === "service") {
      const target = serviceIds.get(s.networkMode.service);
      if (target) add({ kind: "network_mode", source, target, label: "shares network stack", optional: false });
    }
    for (const n of s.networks) {
      const target = networkIds.get(n.name);
      if (target) add({ kind: "network", source, target, optional: false });
    }
    const seen = new Set<string>();
    for (const m of s.volumes) {
      const target = m.kind === "named" && m.source ? volumeIds.get(m.source) : undefined;
      if (target && !seen.has(target)) {
        seen.add(target);
        add({ kind: "volume", source, target, optional: false });
      }
    }
    for (const [kind, ids] of [["secret", secretIds], ["config", configIds]] as const) {
      const linked = new Set<string>();
      for (const name of s[`${kind}s`]) {
        const target = ids.get(name);
        if (target && !linked.has(target)) {
          linked.add(target);
          add({ kind, source, target, optional: false });
        }
      }
    }
  }

  if (nodes.length + edges.length > LIMITS.maxGraphElements) {
    return {
      diagnostics: [
        {
          code: "limit",
          severity: "error",
          message: `The graph has more than ${LIMITS.maxGraphElements} nodes and edges.`,
          location: { path: [] },
        },
      ],
    };
  }
  return { graph: { nodes, edges }, diagnostics: [] };
}

/** Relation groups that can be hidden. Service nodes are always kept. */
export type RelationKind = "depends_on" | "networks" | "network_mode" | "volumes" | "secrets" | "configs";

export const RELATION_KINDS: readonly RelationKind[] = ["depends_on", "networks", "network_mode", "volumes", "secrets", "configs"];

const RELATION_OF: Record<GraphEdgeKind, RelationKind> = {
  depends_on: "depends_on",
  network: "networks",
  network_mode: "network_mode",
  volume: "volumes",
  secret: "secrets",
  config: "configs",
};

/** The relation group a resource node belongs to. */
const NODE_RELATION: Record<Exclude<GraphNodeKind, "service">, RelationKind> = {
  network: "networks",
  volume: "volumes",
  secret: "secrets",
  config: "configs",
};

/**
 * Keeps only the chosen relation groups. Hiding `networks`, `volumes`,
 * `secrets`, or `configs` drops those resource nodes and their edges;
 * `network_mode` and `depends_on` are service-to-service edges only.
 * Node and edge ids are unchanged.
 */
export function filterGraph(graph: ComposeGraph, shown: ReadonlySet<RelationKind>): ComposeGraph {
  return {
    nodes: graph.nodes.filter(
      (n) => n.kind === "service" || shown.has(NODE_RELATION[n.kind]),
    ),
    edges: graph.edges.filter((e) => shown.has(RELATION_OF[e.kind])),
  };
}
