import dagre from "@dagrejs/dagre";

import { containerBox, isContainer, measureNode, measureState } from "./measure.ts";
import { isStateDiagram } from "./types.ts";
import type { Diagram, ErDiagram, Point, Size } from "./types.ts";

/**
 * Automatic layout (specs S6, S8). Deterministic: the same diagram always
 * produces the same coordinates, because dagre is fed the model order and
 * nothing else.
 */

export const LAYOUT_NODE_SEPARATION = 60;
export const LAYOUT_RANK_SEPARATION = 90;
export const LAYOUT_MARGIN = 40;

/** A node as dagre sees it: an id and the box the family measured for it. */
interface LayoutBox {
  id: string;
  size: Size;
}

/** The only part of an edge layout needs: both ends and a unique name. */
interface LayoutLink {
  id: string;
  source: string;
  target: string;
}

/**
 * Runs dagre top to bottom over the boxes and links it is given and returns the
 * top-left corner of every box. Both families share this, so they also share the
 * separation constants and the rounding.
 */
function place(
  boxes: readonly LayoutBox[],
  links: readonly LayoutLink[],
  parents: ReadonlyMap<string, string> = new Map(),
): Map<string, Point> {
  const graph = new dagre.graphlib.Graph({ multigraph: true, compound: parents.size > 0 });
  graph.setGraph({
    rankdir: "TB",
    nodesep: LAYOUT_NODE_SEPARATION,
    ranksep: LAYOUT_RANK_SEPARATION,
    marginx: LAYOUT_MARGIN,
    marginy: LAYOUT_MARGIN,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const box of boxes) {
    graph.setNode(box.id, { width: box.size.width, height: box.size.height });
  }

  const known = new Set(boxes.map((box) => box.id));
  // Compound graph: dagre keeps the children of a parent together.
  for (const [child, parent] of parents) {
    if (known.has(child) && known.has(parent)) graph.setParent(child, parent);
  }
  // dagre cannot route an edge to a cluster, so edges that end on a container are ignored.
  const clusters = new Set(parents.values());
  for (const link of links) {
    // A self relation carries no ordering information and would confuse ranks.
    if (link.source === link.target) continue;
    if (clusters.has(link.source) || clusters.has(link.target)) continue;
    if (!known.has(link.source) || !known.has(link.target)) continue;
    graph.setEdge(link.source, link.target, {}, link.id);
  }

  dagre.layout(graph);

  const positions = new Map<string, Point>();
  for (const box of boxes) {
    const placed = graph.node(box.id) as { x: number; y: number } | undefined;
    if (!placed) continue;
    positions.set(box.id, {
      x: Math.round(placed.x - box.size.width / 2),
      y: Math.round(placed.y - box.size.height / 2),
    });
  }
  return positions;
}

/** Applies a computed position to one node, leaving anything unplaced alone. */
function moved<T extends { id: string; x: number; y: number }>(node: T, positions: Map<string, Point>): T {
  const at = positions.get(node.id);
  return at ? { ...node, x: at.x, y: at.y } : node;
}

/**
 * Recomputes every node position, leaving the structure untouched. One entry
 * point for both families: the node sizes come from each family's own measure,
 * so the layout and the drawn box can never disagree.
 */
export function layout<T extends Diagram>(diagram: T): T {
  if (diagram.nodes.length === 0) return diagram;

  if (isStateDiagram(diagram)) {
    const positions = place(
      diagram.nodes.map((node) => ({ id: node.id, size: measureState(node) })),
      diagram.edges,
    );
    return { ...diagram, nodes: diagram.nodes.map((node) => moved(node, positions)) };
  }

  return layoutClassNodes(diagram) as T;
}

/**
 * Class family: dagre places the children and the free nodes, then every
 * container is anchored to its children through `containerBox`, so the rectangle
 * stays derived and is never decided here.
 */
function layoutClassNodes(diagram: ErDiagram): ErDiagram {
  const parents = new Map<string, string>();
  for (const node of diagram.nodes) {
    if (node.parentId !== null) parents.set(node.id, node.parentId);
  }

  const positions = place(
    diagram.nodes.map((node) => ({
      id: node.id,
      size: isContainer(node) ? containerBox({ ...diagram, nodes: [node] }, node) : measureNode(node, diagram.kind),
    })),
    diagram.edges,
    parents,
  );
  const placed: ErDiagram = { ...diagram, nodes: diagram.nodes.map((node) => moved(node, positions)) };
  if (parents.size === 0) return placed;

  return {
    ...placed,
    nodes: placed.nodes.map((node) => {
      if (!isContainer(node)) return node;
      const { x, y } = containerBox(placed, node);
      return { ...node, x, y };
    }),
  };
}

/**
 * Places only the given nodes with dagre and leaves every other node exactly
 * where the user put it (specs S6, S7).
 */
export function layoutNewNodes<T extends Diagram>(diagram: T, addedIds: readonly string[]): T {
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
