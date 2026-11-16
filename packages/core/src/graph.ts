import type { Diagnostic } from "./diagnostics.js";
import { LIMITS } from "./limits.js";
import type { ComposeModel, DependencyCondition } from "./model.js";

export type GraphNodeKind = "service" | "network" | "volume";
export type GraphEdgeKind = "depends_on" | "network" | "volume" | "network_mode";

export interface GraphNode {
  /** Internal id (svc_1, net_1, vol_1). Never derived from input text. */
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
  /** depends_on / network_mode: the dependent service. network/volume: the service. */
  source: string;
  /** depends_on: dependency. network/volume: the resource. */
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
