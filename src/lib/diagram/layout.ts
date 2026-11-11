import dagre from "@dagrejs/dagre";

import { measureNode } from "./measure.ts";
import type { ErDiagram } from "./types.ts";

/**
 * Automatic layout (spec S8). Deterministic: the same diagram always produces
 * the same coordinates, because dagre is fed the model order and nothing else.
 */

export const LAYOUT_NODE_SEPARATION = 60;
export const LAYOUT_RANK_SEPARATION = 90;
export const LAYOUT_MARGIN = 40;

/** Recomputes every node position, leaving the structure untouched. */
export function layout(diagram: ErDiagram): ErDiagram {
  if (diagram.nodes.length === 0) return diagram;

  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({
    rankdir: "TB",
    nodesep: LAYOUT_NODE_SEPARATION,
    ranksep: LAYOUT_RANK_SEPARATION,
    marginx: LAYOUT_MARGIN,
    marginy: LAYOUT_MARGIN,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  const sizes = new Map<string, { width: number; height: number }>();
  for (const node of diagram.nodes) {
    const size = measureNode(node, diagram.kind);
    sizes.set(node.id, size);
    graph.setNode(node.id, { width: size.width, height: size.height });
  }

  const known = new Set(diagram.nodes.map((node) => node.id));
  for (const edge of diagram.edges) {
    // A self relation carries no ordering information and would confuse ranks.
    if (edge.source === edge.target) continue;
    if (!known.has(edge.source) || !known.has(edge.target)) continue;
    graph.setEdge(edge.source, edge.target, {}, edge.id);
  }

  dagre.layout(graph);

  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => {
      const placed = graph.node(node.id) as { x: number; y: number } | undefined;
      const size = sizes.get(node.id);
      if (!placed || !size) return node;
      return {
        ...node,
        x: Math.round(placed.x - size.width / 2),
        y: Math.round(placed.y - size.height / 2),
      };
    }),
  };
}

/**
 * Places only the given entities with dagre and leaves every other entity
 * exactly where the user put it (spec S7).
 */
export function layoutNewNodes(diagram: ErDiagram, addedIds: readonly string[]): ErDiagram {
  if (addedIds.length === 0) return diagram;
  if (diagram.nodes.length === 0) return diagram;

  const added = new Set(addedIds);
  const positioned = layout(diagram);
  const before = new Map(diagram.nodes.map((node) => [node.id, node]));

  return {
    ...positioned,
    nodes: positioned.nodes.map((node) => {
      if (added.has(node.id)) return node;
      const original = before.get(node.id);
      return original ? { ...node, x: original.x, y: original.y } : node;
    }),
  };
}
