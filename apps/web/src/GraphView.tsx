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
import { layout, NODE_SIZE } from "./layout.js";

type FlowNodeData = { node: GraphNode; subtitle?: string; badge?: string };
type FlowNode = Node<FlowNodeData>;

const handles = (
  <>
    <Handle type="target" position={Position.Left} className="!bg-slate-400" />
    <Handle type="source" position={Position.Right} className="!bg-slate-400" />
  </>
);

function ServiceNode({ data, selected }: NodeProps<FlowNode>) {
  return (
    <div
      className={`flex h-full flex-col justify-center rounded-md border bg-white px-3 shadow-sm ${
        selected ? "border-sky-500 ring-2 ring-sky-200" : "border-slate-300"
      }`}
    >
      {handles}
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
      {handles}
      <span className="text-slate-500">{isNetwork ? "network" : "volume"}</span>
      <span className="truncate font-medium">{data.node.label}</span>
      {tags && <span className="text-slate-400">({tags})</span>}
    </div>
  );
}

const nodeTypes = { service: ServiceNode, network: ResourceNode, volume: ResourceNode };

function toFlow(graph: ComposeGraph, model: ComposeModel): { nodes: FlowNode[]; edges: Edge[] } {
  const positions = layout(graph);
  const services = new Map(model.services.map((s) => [s.name, s]));
  const nodes = graph.nodes.map((node): FlowNode => {
    const service = node.kind === "service" ? services.get(node.label) : undefined;
    const subtitle = service?.image ?? (service?.build ? "build" : undefined);
    const mode = service?.networkMode?.kind;
    const badge = mode === "host" ? "host network" : mode === "none" ? "no network" : undefined;
    const data: FlowNodeData = { node };
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
        labelStyle: { fontSize: 11 },
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
        labelStyle: { fontSize: 11 },
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
  onSelect: (node: GraphNode | undefined) => void;
}

export function GraphView({ graph, model, onSelect }: Props) {
  const flow = useMemo(() => toFlow(graph, model), [graph, model]);
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
      forceColorMode="light"
      minZoom={0.1}
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
