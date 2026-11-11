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

import { containerBox, isContainer, measureNode, measureState } from "@/lib/diagram/measure";
import type { Diagram, ErDiagram, Point } from "@/lib/diagram/types";
import { isStateDiagram } from "@/lib/diagram/types";
import {
  ContainerShape,
  EntityNode,
  RelationEdge,
  StateShape,
  TransitionEdge,
  type ContainerNodeType,
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

type CanvasNode = EntityNodeType | StateNodeType | ContainerNodeType;
type CanvasEdge = RelationEdgeType | TransitionEdgeType;

const nodeTypes: NodeTypes = { entity: EntityNode, state: StateShape, container: ContainerShape };
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

  // The model stores absolute positions; React Flow wants a child relative to its
  // parent. Parents go first in the array, which React Flow requires.
  const origins = new Map<string, Point>();
  const containers: CanvasNode[] = [];
  for (const node of diagram.nodes) {
    if (!isContainer(node)) continue;
    const box = containerBox(diagram, node);
    origins.set(node.id, { x: box.x, y: box.y });
    containers.push({
      id: node.id,
      type: "container",
      position: { x: box.x, y: box.y },
      data: { node },
      selectable: false,
      draggable: false,
      focusable: false,
      style: { width: box.width, height: box.height },
    });
  }

  const entities: CanvasNode[] = diagram.nodes
    .filter((node) => !isContainer(node))
    .map((node) => {
      const size = measureNode(node, diagram.kind);
      const origin = node.parentId === null ? undefined : origins.get(node.parentId);
      return {
        id: node.id,
        type: "entity",
        position: origin ? { x: node.x - origin.x, y: node.y - origin.y } : { x: node.x, y: node.y },
        ...(origin && node.parentId !== null ? { parentId: node.parentId, extent: "parent" as const } : {}),
        data: { node, kind: diagram.kind },
        selected: node.id === selectedId,
        style: { width: size.width, height: size.height },
      };
    });

  return [...containers, ...entities];
}

/** Absolute origin of the container that holds `id`, or null for a top-level node. */
function parentOrigin(diagram: ErDiagram, id: string): Point | null {
  const node = diagram.nodes.find((candidate) => candidate.id === id);
  const parent = node?.parentId ? diagram.nodes.find((candidate) => candidate.id === node.parentId) : undefined;
  if (!parent || !isContainer(parent)) return null;
  const box = containerBox(diagram, parent);
  return { x: box.x, y: box.y };
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
      onNodeClick={(_, node) => {
        if (node.type !== "container") onSelect(node.id);
      }}
      onEdgeClick={(_, edge) => onSelect(edge.id)}
      onPaneClick={() => onSelect(null)}
      onNodeDragStop={(_, node) => {
        // A child's position is relative to its container; the model wants absolute.
        const origin = isStateDiagram(diagram) ? null : parentOrigin(diagram, node.id);
        onMove(node.id, Math.round(node.position.x + (origin?.x ?? 0)), Math.round(node.position.y + (origin?.y ?? 0)));
      }}
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
