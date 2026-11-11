"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  applyNodeChanges,
  type NodeChange,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { measureNode, measureState } from "@/lib/diagram/measure";
import type { Diagram } from "@/lib/diagram/types";
import { isStateDiagram } from "@/lib/diagram/types";
import {
  EntityNode,
  RelationEdge,
  StateShape,
  TransitionEdge,
  type EntityNodeType,
  type RelationEdgeType,
  type StateNodeType,
  type TransitionEdgeType,
} from "./shapes";

/**
 * The canvas renders any family (spec S8). Sizes come from `measure.ts` for both,
 * and the class rendering is untouched: the state family gets its own shape and
 * edge components instead of a flag inside the class ones.
 */

type CanvasNode = EntityNodeType | StateNodeType;
type CanvasEdge = RelationEdgeType | TransitionEdgeType;

const nodeTypes: NodeTypes = { entity: EntityNode, state: StateShape };
const edgeTypes: EdgeTypes = { relation: RelationEdge, transition: TransitionEdge };

function toNodes(diagram: Diagram, selectedId: string | null): CanvasNode[] {
  if (isStateDiagram(diagram)) {
    return diagram.nodes.map((node) => {
      const size = measureState(node);
      return {
        id: node.id,
        type: "state",
        position: { x: node.x, y: node.y },
        data: { node },
        selected: node.id === selectedId,
        style: { width: size.width, height: size.height },
      };
    });
  }

  return diagram.nodes.map((node) => {
    const size = measureNode(node, diagram.kind);
    return {
      id: node.id,
      type: "entity",
      position: { x: node.x, y: node.y },
      data: { node, kind: diagram.kind },
      selected: node.id === selectedId,
      style: { width: size.width, height: size.height },
    };
  });
}

function toEdges(diagram: Diagram, selectedId: string | null): CanvasEdge[] {
  if (isStateDiagram(diagram)) {
    return diagram.edges.map((edge) => ({
      id: edge.id,
      type: "transition",
      source: edge.source,
      target: edge.target,
      data: { edge },
      selected: edge.id === selectedId,
    }));
  }

  return diagram.edges.map((edge) => ({
    id: edge.id,
    type: "relation",
    source: edge.source,
    target: edge.target,
    data: { edge },
    selected: edge.id === selectedId,
  }));
}

export interface CanvasProps {
  diagram: Diagram;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: (source: string, target: string) => void;
}

export function DiagramCanvas({ diagram, selectedId, onSelect, onMove, onConnect }: CanvasProps) {
  const [nodes, setNodes] = useState<CanvasNode[]>(() => toNodes(diagram, selectedId));

  const edges = useMemo(() => toEdges(diagram, selectedId), [diagram, selectedId]);

  // The model owns positions, so every structural or selection change re-seeds
  // the visual state from it.
  useEffect(() => {
    setNodes(toNodes(diagram, selectedId));
  }, [diagram, selectedId]);

  const handleNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    // Selection and removal are model decisions, not canvas decisions.
    const visual = changes.filter((change) => change.type === "position" || change.type === "dimensions");
    setNodes((current) => applyNodeChanges(visual, current));
  }, []);

  return (
    <ReactFlow<CanvasNode, CanvasEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={handleNodesChange}
      onNodeClick={(_, node) => onSelect(node.id)}
      onEdgeClick={(_, edge) => onSelect(edge.id)}
      onPaneClick={() => onSelect(null)}
      onNodeDragStop={(_, node) => onMove(node.id, Math.round(node.position.x), Math.round(node.position.y))}
      onConnect={(connection) => {
        if (connection.source && connection.target) onConnect(connection.source, connection.target);
      }}
      fitView
      minZoom={0.2}
      maxZoom={2.5}
      proOptions={{ hideAttribution: false }}
      className="bg-background"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--muted-foreground)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export { toEdges, toNodes };
