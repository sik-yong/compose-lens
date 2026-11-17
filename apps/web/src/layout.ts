import dagre from "@dagrejs/dagre";
import type { ComposeGraph, GraphNodeKind } from "@compose-lens/core";

export const NODE_SIZE: Record<GraphNodeKind, { width: number; height: number }> = {
  service: { width: 200, height: 64 },
  network: { width: 160, height: 36 },
  volume: { width: 160, height: 36 },
};

export type Direction = "LR" | "TB";

/** Computes top-left positions with dagre. */
export function layout(graph: ComposeGraph, direction: Direction): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 36, ranksep: direction === "LR" ? 150 : 90, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of graph.nodes) g.setNode(n.id, { ...NODE_SIZE[n.kind] });
  for (const e of graph.edges) {
    // Reserve room for labeled edges so labels don't land on nodes.
    const labeled = e.kind === "depends_on" || e.kind === "network_mode";
    g.setEdge(e.source, e.target, labeled ? { width: 150, height: 16, labelpos: "c" } : { weight: 2 });
  }
  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const n of graph.nodes) {
    const p = g.node(n.id);
    const size = NODE_SIZE[n.kind];
    positions.set(n.id, { x: p.x - size.width / 2, y: p.y - size.height / 2 });
  }
  return positions;
}
