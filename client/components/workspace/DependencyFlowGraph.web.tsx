/**
 * DependencyFlowGraph (web) — real directed-graph visualization of the task DAG.
 * ------------------------------------------------------------------------------
 * Task = node (rounded card, colour-coded by priority tier)
 * Dependency = directed edge with an arrowhead (prerequisite → dependent)
 *
 * Rendering : React Flow (@xyflow/react)
 * Layout    : Dagre (@dagrejs/dagre) — layered top-to-bottom, no overlaps,
 *             multiple parents merge naturally into the same child rank.
 * Extras    : zoom, pan, fit-view controls, minimap, dotted background grid.
 *
 * Purely presentational: receives nodes/edges from the existing
 * /dependency-graph API (via useDependencyGraph) — no backend changes.
 */
import React, { useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import { colors, PRIORITY_META, priorityKeyFromScore, type PriorityKey } from "@/theme";
import type { GraphNode, GraphEdge } from "@/hooks/useDependencyGraph";

// ── Node card dimensions used by the Dagre layout pass ────────────────────────
const NODE_W = 220;
const NODE_H = 78;

type TaskNodeData = {
  title: string;
  tierLabel: string;
  tierColor: string;
  tierBg: string;
  assignee: string | null;
  hours: number;
  [key: string]: unknown;
};

const tierOf = (n: GraphNode) => {
  const key: PriorityKey =
    n.priorityLabel && PRIORITY_META[n.priorityLabel as PriorityKey]
      ? (n.priorityLabel as PriorityKey)
      : priorityKeyFromScore(n.priority ?? 0);
  return PRIORITY_META[key];
};

// ── Custom node: rounded glass card, left rail + badge coloured by priority ───
function TaskNode({ data }: NodeProps) {
  const d = data as TaskNodeData;
  return (
    <div
      style={{
        width: NODE_W,
        minHeight: NODE_H,
        boxSizing: "border-box",
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(6px)",
        border: `1px solid ${colors.border}`,
        borderLeft: `5px solid ${d.tierColor}`,
        borderRadius: 14,
        padding: "10px 12px",
        boxShadow: "0 4px 14px rgba(31,41,38,0.08)",
        fontFamily: "inherit",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: d.tierColor, width: 8, height: 8, border: "2px solid #fff" }} />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: colors.text, lineHeight: "16px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {d.title}
        </span>
        <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.4, color: d.tierColor, background: d.tierBg, borderRadius: 5, padding: "2px 6px", whiteSpace: "nowrap" }}>
          {d.tierLabel}
        </span>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 10.5, color: colors.textMuted, fontWeight: 600 }}>
        <span>👤 {d.assignee ?? "Unassigned"}</span>
        <span>⏱ {d.hours || 0}h</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: d.tierColor, width: 8, height: 8, border: "2px solid #fff" }} />
    </div>
  );
}

const nodeTypes = { task: TaskNode };

// ── Dagre layered layout: O(V + E) graph build, no overlapping nodes ──────────
function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): { rfNodes: Node[]; rfEdges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 70, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.from, e.to));
  dagre.layout(g);

  const rfNodes: Node[] = nodes.map((n) => {
    const tier = tierOf(n);
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: "task",
      position: { x: (pos?.x ?? 0) - NODE_W / 2, y: (pos?.y ?? 0) - NODE_H / 2 },
      data: {
        title: n.title,
        tierLabel: tier.label,
        tierColor: tier.color,
        tierBg: tier.bg,
        assignee: n.assignee ?? null,
        hours: n.estimatedHours ?? 0,
      } satisfies TaskNodeData,
    };
  });

  const rfEdges: Edge[] = edges.map((e) => ({
    id: `${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
    type: "smoothstep",
    animated: true,
    style: { stroke: colors.primary, strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: colors.primary, width: 20, height: 20 },
  }));

  return { rfNodes, rfEdges };
}

export default function DependencyFlowGraph({ nodes, edges, height = 480 }: {
  nodes: GraphNode[]; edges: GraphEdge[]; height?: number;
}) {
  const { rfNodes, rfEdges } = useMemo(() => layoutGraph(nodes, edges), [nodes, edges]);
  // Remount on structural change so fitView re-centres the fresh layout live.
  const layoutKey = useMemo(
    () => `${nodes.map((n) => n.id).join(".")}|${edges.map((e) => `${e.from}-${e.to}`).join(".")}`,
    [nodes, edges],
  );

  return (
    <div style={{ width: "100%", height, background: colors.bg }}>
      <ReactFlow
        key={layoutKey}
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1.1 }}
        minZoom={0.2}
        maxZoom={2}
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color={colors.borderStrong} />
        <Controls showInteractive={false} position="bottom-right" />
        <MiniMap
          pannable
          zoomable
          position="top-right"
          nodeColor={(n) => ((n.data as TaskNodeData)?.tierColor as string) ?? colors.textFaint}
          nodeBorderRadius={6}
          style={{ width: 140, height: 96 }}
        />
      </ReactFlow>
    </div>
  );
}
