import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo } from "react";
import type { ComposeGraph, ComposeModel, GraphNode } from "@compose-lens/core";
import { layout, NODE_SIZE, type Direction } from "./layout.js";

type FlowNode = Node<FlowNodeData>;

type FlowNodeData = { node: GraphNode; subtitle?: string; badge?: string; direction: Direction };

function Handles({ direction }: { direction: Direction }) {
  const lr = direction === "LR";
  return (
    <>
      <Handle type="target" position={lr ? Position.Left : Position.Top} className="!bg-slate-400" />
      <Handle type="source" position={lr ? Position.Right : Position.Bottom} className="!bg-slate-400" />
    </>
  );
}

function ServiceNode({ data, selected }: NodeProps<FlowNode>) {
  return (
    <div
      className={`flex h-full flex-col justify-center rounded-md border bg-white px-3 shadow-sm ${
        selected ? "border-sky-500 ring-2 ring-sky-200" : "border-slate-300"
      }`}
    >
      <Handles direction={data.direction} />
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-semibold">{data.node.label}</span>
        {data.badge && (
          <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] text-slate-600">{data.badge}</span>
        )}
      </div>
      {data.subtitle && <div className="truncate text-xs text-slate-500">{data.subtitle}</div>}
    </div>
  );
}

function ResourceNode({ data, selected }: NodeProps<FlowNode>) {
  const isNetwork = data.node.kind === "network";
  const tags = [data.node.implicit && "implicit", data.node.external && "external"].filter(Boolean).join(", ");
  return (
    <div
      className={`flex h-full items-center gap-1.5 border px-2.5 text-xs ${
        isNetwork ? "rounded-full border-violet-300 bg-violet-50" : "rounded border-amber-300 bg-amber-50"
      } ${selected ? "ring-2 ring-sky-200" : ""} ${data.node.external ? "border-dashed" : ""}`}
    >
      <Handles direction={data.direction} />
      <span className="text-slate-500">{isNetwork ? "network" : "volume"}</span>
      <span className="truncate font-medium">{data.node.label}</span>
      {tags && <span className="text-slate-400">({tags})</span>}
    </div>
  );
}

const nodeTypes = { service: ServiceNode, network: ResourceNode, volume: ResourceNode };

const LABEL = {
  labelStyle: { fontSize: 11, fill: "#334155" },
  labelBgStyle: { fill: "#ffffff", fillOpacity: 0.9 },
  labelBgPadding: [4, 2] as [number, number],
  labelBgBorderRadius: 3,
};

function toFlow(graph: ComposeGraph, model: ComposeModel, direction: Direction): { nodes: FlowNode[]; edges: Edge[] } {
  const positions = layout(graph, direction);
  const services = new Map(model.services.map((s) => [s.name, s]));
  const nodes = graph.nodes.map((node): FlowNode => {
    const service = node.kind === "service" ? services.get(node.label) : undefined;
    const subtitle = service?.image ?? (service?.build ? "build" : undefined);
    const mode = service?.networkMode?.kind;
    const badge = mode === "host" ? "host network" : mode === "none" ? "no network" : undefined;
    const data: FlowNodeData = { node, direction };
    if (subtitle) data.subtitle = subtitle;
    if (badge) data.badge = badge;
    return {
      id: node.id,
      type: node.kind,
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      data,
      ...NODE_SIZE[node.kind],
    };
  });
  const edges = graph.edges.map((e): Edge => {
    if (e.kind === "depends_on") {
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.optional ? `${e.label} (optional)` : e.label,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#0f172a" },
        style: { stroke: "#0f172a", strokeDasharray: "6 4", opacity: e.optional ? 0.5 : 1 },
        ...LABEL,
      };
    }
    if (e.kind === "network_mode") {
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed" },
        style: { stroke: "#7c3aed", strokeWidth: 2 },
        ...LABEL,
      };
    }
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      style: { stroke: e.kind === "network" ? "#a78bfa" : "#f59e0b" },
    };
  });
  return { nodes, edges };
}

interface Props {
  graph: ComposeGraph;
  model: ComposeModel;
  direction: Direction;
  onSelect: (node: GraphNode | undefined) => void;
}

export function GraphView({ graph, model, direction, onSelect }: Props) {
  const flow = useMemo(() => toFlow(graph, model, direction), [graph, model, direction]);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(flow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow.edges);

  useEffect(() => {
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [flow, setNodes, setEdges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, n) => onSelect(n.data.node)}
      onPaneClick={() => onSelect(undefined)}
      nodesConnectable={false}
      fitView
      fitViewOptions={{ padding: 0.1, maxZoom: 1.2 }}
      forceColorMode="light"
      minZoom={0.1}
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
