import {
  Background,
  BaseEdge,
  Controls,
  getBezierPath,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChangeset,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComposeGraph, ComposeModel, GraphEdgeKind, GraphNode, PortMapping } from "@compose-lens/core";
import { basisPath, layout, nodeSize, type Direction, type Point } from "./layout.js";
import type { EdgeStyle } from "./settings.js";

type Mode = "light" | "dark";

type FlowNodeData = {
  node: GraphNode;
  subtitle?: string;
  badge?: string;
  ports?: string[];
  direction: Direction;
};

type FlowNode = Node<FlowNodeData>;

function Handles({ direction }: { direction: Direction }) {
  const lr = direction === "LR";
  return (
    <>
      <Handle type="target" position={lr ? Position.Left : Position.Top} className="!bg-slate-400" />
      <Handle type="source" position={lr ? Position.Right : Position.Bottom} className="!bg-slate-400" />
    </>
  );
}

const MAX_PORTS_SHOWN = 3;

function ServiceNode({ data, selected }: NodeProps<FlowNode>) {
  const ports = data.ports ?? [];
  return (
    <div
      className={`flex h-full flex-col justify-center rounded-md border bg-white px-3 shadow-sm dark:bg-slate-900 ${
        selected ? "border-sky-500 ring-2 ring-sky-200 dark:ring-sky-800" : "border-slate-300 dark:border-slate-600"
      }`}
    >
      <Handles direction={data.direction} />
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-semibold">{data.node.label}</span>
        {data.badge && (
          <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {data.badge}
          </span>
        )}
      </div>
      {data.subtitle && <div className="truncate text-xs text-slate-500 dark:text-slate-400">{data.subtitle}</div>}
      {data.ports && (
        <div className="truncate font-mono text-[10px] text-sky-700 dark:text-sky-300">
          {ports.length === 0
            ? "no ports"
            : ports.slice(0, MAX_PORTS_SHOWN).join("  ") +
              (ports.length > MAX_PORTS_SHOWN ? `  +${ports.length - MAX_PORTS_SHOWN}` : "")}
        </div>
      )}
    </div>
  );
}

const RESOURCE_STYLE: Record<Exclude<GraphNode["kind"], "service">, string> = {
  network: "rounded-full border-violet-300 bg-violet-50 dark:border-violet-500 dark:bg-violet-950",
  volume: "rounded border-amber-300 bg-amber-50 dark:border-amber-500 dark:bg-amber-950",
  secret: "rounded border-red-300 bg-red-50 dark:border-red-500 dark:bg-red-950",
  config: "rounded border-cyan-300 bg-cyan-50 dark:border-cyan-500 dark:bg-cyan-950",
};

function ResourceNode({ data, selected }: NodeProps<FlowNode>) {
  const kind = data.node.kind === "service" ? "network" : data.node.kind;
  const tags = [data.node.implicit && "implicit", data.node.external && "external"].filter(Boolean).join(", ");
  return (
    <div
      className={`flex h-full items-center gap-1.5 border px-2.5 text-xs ${RESOURCE_STYLE[kind]} ${
        selected ? "ring-2 ring-sky-200 dark:ring-sky-800" : ""
      } ${data.node.external ? "border-dashed" : ""}`}
    >
      <Handles direction={data.direction} />
      <span className="text-slate-500 dark:text-slate-400">{kind}</span>
      <span className="truncate font-medium">{data.node.label}</span>
      {tags && <span className="text-slate-400">({tags})</span>}
    </div>
  );
}

/** Drops undefined props (exactOptionalPropertyTypes). */
const defined = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as { [K in keyof T]?: Exclude<T[K], undefined> };

type RoutedData = { route?: { points: Point[]; label?: Point }; stale?: boolean };
type RoutedFlowEdge = Edge<RoutedData, "routed">;

/**
 * Follows dagre's route, which goes around nodes, with the endpoints moved to
 * the handles. Once either node is dragged the route is stale, so it falls
 * back to a plain curve between the handles.
 */
function RoutedEdge(props: EdgeProps<RoutedFlowEdge>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  let path: string;
  let labelX: number;
  let labelY: number;
  if (data?.route && !data.stale) {
    const inner = data.route.points.slice(1, -1);
    path = basisPath([{ x: sourceX, y: sourceY }, ...inner, { x: targetX, y: targetY }]);
    labelX = data.route.label?.x ?? (sourceX + targetX) / 2;
    labelY = data.route.label?.y ?? (sourceY + targetY) / 2;
  } else {
    [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  }
  return (
    <BaseEdge
      id={props.id}
      path={path}
      labelX={labelX}
      labelY={labelY}
      {...defined({
        label: props.label,
        labelStyle: props.labelStyle,
        labelShowBg: props.labelShowBg,
        labelBgStyle: props.labelBgStyle,
        labelBgPadding: props.labelBgPadding,
        labelBgBorderRadius: props.labelBgBorderRadius,
        markerEnd: props.markerEnd,
        style: props.style,
        interactionWidth: props.interactionWidth,
      })}
    />
  );
}

const edgeTypes = { routed: RoutedEdge };

const nodeTypes = { service: ServiceNode, network: ResourceNode, volume: ResourceNode, secret: ResourceNode, config: ResourceNode };

const COLORS: Record<Mode, Record<GraphEdgeKind, string> & { label: string; labelBg: string }> = {
  light: {
    depends_on: "#0f172a",
    network_mode: "#7c3aed",
    network: "#a78bfa",
    volume: "#f59e0b",
    secret: "#f87171",
    config: "#22d3ee",
    label: "#334155",
    labelBg: "#ffffff",
  },
  dark: {
    depends_on: "#e2e8f0",
    network_mode: "#c4b5fd",
    network: "#8b5cf6",
    volume: "#d97706",
    secret: "#ef4444",
    config: "#06b6d4",
    label: "#e2e8f0",
    labelBg: "#0f172a",
  },
};

/** Host side of a port for the node summary, e.g. `8080→80/udp`. */
function portSummary(p: PortMapping): string {
  const proto = p.protocol.toLowerCase() === "tcp" ? "" : `/${p.protocol}`;
  const container = p.container ? (p.container.start === p.container.end ? `${p.container.start}` : `${p.container.start}-${p.container.end}`) : "?";
  switch (p.host.kind) {
    case "fixed":
    case "pool": {
      const { start, end } = p.host.ports;
      return `${start === end ? start : `${start}-${end}`}→${container}${proto}`;
    }
    case "dynamic":
      return `*→${container}${proto}`;
    case "unresolved":
      return p.raw;
  }
}

interface FlowOptions {
  direction: Direction;
  edgeStyle: EdgeStyle;
  showPorts: boolean;
  mode: Mode;
}

function toFlow(graph: ComposeGraph, model: ComposeModel, o: FlowOptions): { nodes: FlowNode[]; edges: Edge[] } {
  const { positions, routes } = layout(graph, o.direction, o.showPorts);
  const services = new Map(model.services.map((s) => [s.name, s]));
  const colors = COLORS[o.mode];
  const nodes = graph.nodes.map((node): FlowNode => {
    const service = node.kind === "service" ? services.get(node.label) : undefined;
    const subtitle = service?.image ?? (service?.build ? "build" : undefined);
    const mode = service?.networkMode?.kind;
    const badge = mode === "host" ? "host network" : mode === "none" ? "no network" : undefined;
    const data: FlowNodeData = { node, direction: o.direction };
    if (subtitle) data.subtitle = subtitle;
    if (badge) data.badge = badge;
    if (service && o.showPorts) data.ports = service.ports.map(portSummary);
    return {
      id: node.id,
      type: node.kind,
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      data,
      ...nodeSize(node.kind, o.showPorts),
    };
  });
  const label = {
    labelStyle: { fontSize: 11, fill: colors.label },
    labelBgStyle: { fill: colors.labelBg, fillOpacity: 0.9 },
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 3,
  };
  const base = (e: ComposeGraph["edges"][number]): Edge => {
    const edge: Edge = { id: e.id, source: e.source, target: e.target, type: o.edgeStyle };
    if (o.edgeStyle === "routed") {
      const route = routes.get(e.id);
      edge.data = route ? { route } : {};
    }
    // Rounded corners and a short first segment keep right-angle routes apart from nodes.
    return o.edgeStyle === "smoothstep" ? ({ ...edge, pathOptions: { borderRadius: 10, offset: 16 } } as Edge) : edge;
  };
  const edges = graph.edges.map((e): Edge => {
    const color = colors[e.kind];
    if (e.kind === "depends_on") {
      return {
        ...base(e),
        label: e.optional ? `${e.label} (optional)` : e.label,
        markerEnd: { type: MarkerType.ArrowClosed, color },
        style: { stroke: color, strokeDasharray: "6 4", opacity: e.optional ? 0.5 : 1 },
        ...label,
      };
    }
    if (e.kind === "network_mode") {
      return {
        ...base(e),
        label: e.label,
        markerEnd: { type: MarkerType.ArrowClosed, color },
        style: { stroke: color, strokeWidth: 2 },
        ...label,
      };
    }
    return { ...base(e), style: { stroke: color } };
  });
  return { nodes, edges };
}

const FIT = { padding: 0.12, maxZoom: 1.2 };

/**
 * Fits the graph after each layout and whenever the pane is resized. The
 * initial fit can run before the surrounding layout settles.
 */
function AutoFit({ flow }: { flow: unknown }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const frame = requestAnimationFrame(() => void fitView(FIT));
    return () => cancelAnimationFrame(frame);
  }, [flow, fitView]);
  useEffect(() => {
    const pane = document.querySelector(".react-flow");
    if (!pane) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => void fitView(FIT));
    });
    observer.observe(pane);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fitView]);
  return null;
}

interface Props extends FlowOptions {
  graph: ComposeGraph;
  model: ComposeModel;
  onSelect: (node: GraphNode | undefined) => void;
}

export function GraphView({ graph, model, direction, edgeStyle, showPorts, mode, onSelect }: Props) {
  const flow = useMemo(
    () => toFlow(graph, model, { direction, edgeStyle, showPorts, mode }),
    [graph, model, direction, edgeStyle, showPorts, mode],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(flow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow.edges);
  // Nodes dragged since the last layout: their routed edges no longer fit.
  const [moved, setMoved] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setMoved(new Set());
  }, [flow, setNodes, setEdges]);

  const onChange = useCallback(
    (changes: NodeChangeset<FlowNode>) => {
      const dragged = changes.toArray().flatMap((c) => (c.type === "position" && c.dragging ? [c.id] : []));
      if (dragged.length > 0) setMoved((prev) => (dragged.every((id) => prev.has(id)) ? prev : new Set([...prev, ...dragged])));
      onNodesChange(changes);
    },
    [onNodesChange],
  );

  const shownEdges = useMemo(
    () =>
      moved.size === 0
        ? edges
        : edges.map((e) => (moved.has(e.source) || moved.has(e.target) ? { ...e, data: { ...e.data, stale: true } } : e)),
    [edges, moved],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={shownEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, n) => onSelect(n.data.node)}
      onPaneClick={() => onSelect(undefined)}
      nodesConnectable={false}
      fitView
      fitViewOptions={FIT}
      forceColorMode={mode}
      minZoom={0.1}
    >
      <AutoFit flow={flow} />
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
