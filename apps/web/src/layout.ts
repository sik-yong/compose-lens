import dagre from "@dagrejs/dagre";
import type { ComposeGraph, GraphNodeKind } from "@compose-lens/core";

const RESOURCE = { width: 160, height: 36 };

export function nodeSize(kind: GraphNodeKind, showPorts: boolean): { width: number; height: number } {
  if (kind === "service") return { width: 200, height: showPorts ? 84 : 64 };
  return RESOURCE;
}

export type Direction = "LR" | "TB";

export interface Point {
  x: number;
  y: number;
}

export interface Layout {
  /** Top-left position per node id. */
  positions: Map<string, Point>;
  /** dagre's route per edge id: points from source to target, and the label center. */
  routes: Map<string, { points: Point[]; label?: Point }>;
}

/** Positions nodes and routes edges around them with dagre. */
export function layout(graph: ComposeGraph, direction: Direction, showPorts: boolean): Layout {
  // multigraph: two services can have both a depends_on and a network_mode edge.
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: direction, nodesep: 36, ranksep: direction === "LR" ? 150 : 90, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of graph.nodes) g.setNode(n.id, { ...nodeSize(n.kind, showPorts) });
  for (const e of graph.edges) {
    // Reserve room for labeled edges so labels don't land on nodes.
    const labeled = e.kind === "depends_on" || e.kind === "network_mode";
    g.setEdge(e.source, e.target, labeled ? { width: 150, height: 16, labelpos: "c" } : { weight: 2 }, e.id);
  }
  dagre.layout(g);

  const positions = new Map<string, Point>();
  for (const n of graph.nodes) {
    const p = g.node(n.id);
    const size = nodeSize(n.kind, showPorts);
    positions.set(n.id, { x: p.x - size.width / 2, y: p.y - size.height / 2 });
  }
  const routes = new Map<string, { points: Point[]; label?: Point }>();
  for (const e of graph.edges) {
    const edge = g.edge({ v: e.source, w: e.target, name: e.id }) as
      | { points?: Point[]; x?: number; y?: number; width?: number }
      | undefined;
    if (!edge?.points || edge.points.length < 2) continue;
    const route: { points: Point[]; label?: Point } = { points: edge.points.map(({ x, y }) => ({ x, y })) };
    if (edge.width && edge.x !== undefined && edge.y !== undefined) route.label = { x: edge.x, y: edge.y };
    routes.set(e.id, route);
  }
  return { positions, routes };
}

/**
 * SVG path through the points as a uniform B-spline, the same curve Mermaid
 * draws by default (d3 curveBasis), so the view and the export look alike.
 */
export function basisPath(points: Point[]): string {
  const [first, ...rest] = points;
  if (!first) return "";
  if (rest.length === 0) return `M${first.x},${first.y}`;
  let d = `M${first.x},${first.y}`;
  let p0 = first;
  let p1 = rest[0]!;
  if (rest.length === 1) return `${d} L${p1.x},${p1.y}`;
  const curve = (p: Point) => {
    d += ` C${(2 * p0.x + p1.x) / 3},${(2 * p0.y + p1.y) / 3} ${(p0.x + 2 * p1.x) / 3},${(p0.y + 2 * p1.y) / 3} ${
      (p0.x + 4 * p1.x + p.x) / 6
    },${(p0.y + 4 * p1.y + p.y) / 6}`;
  };
  d += ` L${(5 * p0.x + p1.x) / 6},${(5 * p0.y + p1.y) / 6}`;
  for (const p of rest.slice(1)) {
    curve(p);
    p0 = p1;
    p1 = p;
  }
  curve(p1);
  return `${d} L${p1.x},${p1.y}`;
}
