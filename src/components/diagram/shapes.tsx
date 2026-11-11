"use client";

import { memo } from "react";
import {
  EdgeLabelRenderer,
  Handle,
  Position,
  getStraightPath,
  useInternalNode,
  type Edge,
  type EdgeProps,
  type InternalNode,
  type Node,
  type NodeProps,
} from "@xyflow/react";

import {
  NODE_HEADER_HEIGHT,
  NODE_PADDING_X,
  NODE_ROW_HEIGHT,
  PSEUDO_STATE_SIZE,
  borderPoint,
  cardinalityPoints,
  formatFieldLabel,
  measureState,
} from "@/lib/diagram/measure";
import type {
  DiagramEdge,
  DiagramKind,
  DiagramNode,
  Point,
  Rect,
  StateNode,
  Transition,
} from "@/lib/diagram/types";

/**
 * Canvas shapes. They mirror `src/lib/diagram/svg.ts` on purpose: same header
 * height, same row height, same row text, so the screen and the exported image
 * describe the same picture.
 */

export interface EntityNodeData extends Record<string, unknown> {
  node: DiagramNode;
  kind: DiagramKind;
}

export type EntityNodeType = Node<EntityNodeData, "entity">;

function EntityNodeView({ data }: NodeProps<EntityNodeType>) {
  const { node, kind } = data;

  return (
    <div className="group relative h-full w-full overflow-hidden rounded-lg border-[1.5px] border-border bg-card">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-0 !bg-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-0 !bg-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
      />
      <div
        className="flex items-center border-b border-border bg-muted"
        style={{ height: NODE_HEADER_HEIGHT, paddingInline: NODE_PADDING_X }}
      >
        <span className="truncate text-sm font-semibold text-card-foreground">{node.name}</span>
      </div>
      <div>
        {node.fields.length === 0 ? (
          <div
            className="text-xs text-muted-foreground"
            style={{ height: NODE_ROW_HEIGHT, lineHeight: `${NODE_ROW_HEIGHT}px`, paddingInline: NODE_PADDING_X }}
          >
            —
          </div>
        ) : (
          node.fields.map((field, index) => (
            <div
              key={`${field.name}-${index}`}
              className="truncate font-mono text-xs text-muted-foreground"
              style={{ height: NODE_ROW_HEIGHT, lineHeight: `${NODE_ROW_HEIGHT}px`, paddingInline: NODE_PADDING_X }}
            >
              {formatFieldLabel(field, kind)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export const EntityNode = memo(EntityNodeView);

export interface RelationEdgeData extends Record<string, unknown> {
  edge: DiagramEdge;
}

export type RelationEdgeType = Edge<RelationEdgeData, "relation">;

const SELF_LOOP_X = 56;
const SELF_LOOP_Y = 64;

/**
 * Absolute rectangle of a node as React Flow measured it. `null` until the node
 * exists and has a size, so the edge can fall back to its own handle props.
 */
function rectOf(node: InternalNode | undefined): Rect | null {
  if (!node) return null;
  const width = node.measured?.width ?? node.width;
  const height = node.measured?.height ?? node.height;
  if (typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) return null;
  return { x: node.internals.positionAbsolute.x, y: node.internals.positionAbsolute.y, width, height };
}

const centerOf = (box: Rect): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

function SelfLoopPath(x: number, y: number): string {
  return `M ${x} ${y} C ${x + SELF_LOOP_X} ${y} ${x + SELF_LOOP_X} ${y - SELF_LOOP_Y} ${x} ${y - SELF_LOOP_Y}`;
}

function RelationEdgeView({ source, target, sourceX, sourceY, targetX, targetY, data, selected }: EdgeProps<RelationEdgeType>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const edge = data?.edge;
  if (!edge) return null;

  const isSelfLoop = edge.source === edge.target || (sourceX === targetX && sourceY === targetY);
  const sourceBox = rectOf(sourceNode);
  const targetBox = rectOf(targetNode);
  const boxes = !isSelfLoop && sourceBox && targetBox ? { sourceBox, targetBox } : null;

  // The border is resolved from shared geometry, exactly like the exporter, so a
  // line never starts by crossing back over its own entity.
  const from: Point = boxes ? borderPoint(boxes.sourceBox, centerOf(boxes.targetBox).x, centerOf(boxes.targetBox).y) : { x: sourceX, y: sourceY };
  const to: Point = boxes ? borderPoint(boxes.targetBox, centerOf(boxes.sourceBox).x, centerOf(boxes.sourceBox).y) : { x: targetX, y: targetY };

  const [straightPath, labelX, labelY] = getStraightPath({
    sourceX: from.x,
    sourceY: from.y,
    targetX: to.x,
    targetY: to.y,
  });
  const path = isSelfLoop ? SelfLoopPath(from.x, from.y) : straightPath;

  const cards = cardinalityPoints(from, to, boxes?.sourceBox, boxes?.targetBox);
  const sourceCard = isSelfLoop ? { x: from.x + SELF_LOOP_X * 0.5, y: from.y - 6 } : cards.source;
  const targetCard = isSelfLoop
    ? { x: from.x + SELF_LOOP_X * 0.5, y: from.y - SELF_LOOP_Y + 12 }
    : cards.target;

  return (
    <>
      <path
        d={path}
        fill="none"
        strokeWidth={selected ? 2.5 : 1.5}
        className={selected ? "stroke-foreground" : "stroke-muted-foreground"}
      />
      <EdgeLabelRenderer>
        <span
          className="pointer-events-none absolute text-[11px] text-muted-foreground"
          style={{ transform: `translate(-50%, -50%) translate(${sourceCard.x}px, ${sourceCard.y}px)` }}
        >
          {edge.sourceCardinality}
        </span>
        <span
          className="pointer-events-none absolute text-[11px] text-muted-foreground"
          style={{ transform: `translate(-50%, -50%) translate(${targetCard.x}px, ${targetCard.y}px)` }}
        >
          {edge.targetCardinality}
        </span>
        {edge.label === "" ? null : (
          <span
            className="pointer-events-none absolute rounded bg-card px-1 text-xs text-card-foreground"
            style={{
              transform: `translate(-50%, -50%) translate(${isSelfLoop ? from.x + SELF_LOOP_X + 24 : labelX}px, ${isSelfLoop ? from.y - SELF_LOOP_Y * 0.75 : labelY}px)`,
            }}
          >
            {edge.label}
          </span>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

export const RelationEdge = memo(RelationEdgeView);

/* ------------------------------------------------------------------ states */

/**
 * State shapes (spec S8). Sizes come from `measureState`, so the box on screen is
 * the box the layout reserved and the exporter will draw: nothing here
 * re-derives a width, a height or a glyph size.
 */

/** Ratio of the filled dot inside the `final` ring, matching the exporter. */
const FINAL_DOT_RATIO = 0.5;

const HANDLE_CLASS =
  "!h-2.5 !w-2.5 !border-0 !bg-muted-foreground opacity-0 transition-opacity group-hover:opacity-100";

export interface StateNodeData extends Record<string, unknown> {
  node: StateNode;
}

export type StateNodeType = Node<StateNodeData, "state">;

function StateNodeView({ data, selected }: NodeProps<StateNodeType>) {
  const { node } = data;
  const size = measureState(node);
  const dot = Math.round(PSEUDO_STATE_SIZE * FINAL_DOT_RATIO);

  return (
    <div className="group relative h-full w-full" data-role={node.role} data-name={node.name}>
      <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />
      <Handle type="source" position={Position.Right} className={HANDLE_CLASS} />
      {node.role === "initial" ? (
        <div className="h-full w-full rounded-full bg-foreground" />
      ) : node.role === "final" ? (
        <div
          className={`flex h-full w-full items-center justify-center rounded-full border-[1.5px] ${
            selected ? "border-foreground" : "border-muted-foreground"
          }`}
        >
          <div className="rounded-full bg-foreground" style={{ width: dot, height: dot }} />
        </div>
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center rounded-lg border-[1.5px] bg-card ${
            selected ? "border-foreground" : "border-border"
          }`}
          style={{ width: size.width, height: size.height }}
        >
          <span className="truncate px-3 text-sm font-semibold text-card-foreground">{node.name}</span>
        </div>
      )}
    </div>
  );
}

export const StateShape = memo(StateNodeView);

export interface TransitionEdgeData extends Record<string, unknown> {
  edge: Transition;
}

export type TransitionEdgeType = Edge<TransitionEdgeData, "transition">;

/** Arrowhead length and half width, mirroring the exporter's 10x10 marker. */
const ARROW_LENGTH = 10;
const ARROW_HALF_WIDTH = 5;
/** How far the label sits from the line it belongs to. */
const TRANSITION_LABEL_OFFSET = 12;
/** Reach and rise of a self transition loop, matching the exporter's loop. */
const TRANSITION_LOOP_REACH = 56;
const TRANSITION_LOOP_RISE = 40;

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** A filled triangle whose tip sits on `tip`, pointing along (`dx`, `dy`). */
function arrowHead(tip: Point, dx: number, dy: number, className: string) {
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const baseX = tip.x - ux * ARROW_LENGTH;
  const baseY = tip.y - uy * ARROW_LENGTH;
  const leftX = baseX - uy * ARROW_HALF_WIDTH;
  const leftY = baseY + ux * ARROW_HALF_WIDTH;
  const rightX = baseX + uy * ARROW_HALF_WIDTH;
  const rightY = baseY - ux * ARROW_HALF_WIDTH;
  return (
    <path
      d={`M ${round2(tip.x)} ${round2(tip.y)} L ${round2(leftX)} ${round2(leftY)} L ${round2(rightX)} ${round2(rightY)} Z`}
      strokeWidth={1}
      className={className}
    />
  );
}

/** Midpoint pushed off the line so the text never sits on top of it. */
function offLine(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const perpX = dy / length;
  const perpY = -dx / length;
  return {
    x: round2((from.x + to.x) / 2 + perpX * TRANSITION_LABEL_OFFSET),
    y: round2((from.y + to.y) / 2 + perpY * TRANSITION_LABEL_OFFSET),
  };
}

function TransitionEdgeView({
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps<TransitionEdgeType>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const edge = data?.edge;
  if (!edge) return null;

  const isSelfLoop = edge.source === edge.target || (sourceX === targetX && sourceY === targetY);
  const sourceBox = rectOf(sourceNode);
  const targetBox = rectOf(targetNode);
  const strokeClass = selected ? "stroke-foreground fill-foreground" : "stroke-muted-foreground fill-muted-foreground";

  if (isSelfLoop) {
    // A loop leaves the right border and re-enters the top border, like the
    // exporter draws it, so a self transition is never a zero length line.
    const box = sourceBox;
    if (!box) return null;
    const startX = round2(box.x + box.width);
    const startY = round2(box.y + box.height / 2);
    const endX = round2(box.x + box.width / 2);
    const endY = round2(box.y);
    const controlX = round2(box.x + box.width + TRANSITION_LOOP_REACH);
    const controlY = round2(endY - TRANSITION_LOOP_RISE);
    const label = { x: round2(controlX + 6), y: round2(startY - 20) };
    return (
      <>
        <path
          d={`M ${startX} ${startY} C ${controlX} ${startY} ${controlX} ${controlY} ${endX} ${endY}`}
          fill="none"
          strokeWidth={selected ? 2.5 : 1.5}
          className={selected ? "stroke-foreground" : "stroke-muted-foreground"}
        />
        {arrowHead({ x: endX, y: endY }, endX - controlX, endY - controlY, strokeClass)}
        {edge.label === "" ? null : (
          <EdgeLabelRenderer>
            <span
              className="pointer-events-none absolute rounded bg-card px-1 text-xs text-card-foreground"
              style={{ transform: `translate(-50%, -50%) translate(${label.x}px, ${label.y}px)` }}
            >
              {edge.label}
            </span>
          </EdgeLabelRenderer>
        )}
      </>
    );
  }

  // The border is resolved from shared geometry: a transition starts and ends on
  // the shape border, exactly like a relation does.
  const from: Point = sourceBox && targetBox ? borderPoint(sourceBox, targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2) : { x: sourceX, y: sourceY };
  const to: Point = sourceBox && targetBox ? borderPoint(targetBox, sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2) : { x: targetX, y: targetY };
  const label = offLine(from, to);

  return (
    <>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        strokeWidth={selected ? 2.5 : 1.5}
        className={selected ? "stroke-foreground" : "stroke-muted-foreground"}
      />
      {arrowHead(to, to.x - from.x, to.y - from.y, strokeClass)}
      {edge.label === "" ? null : (
        <EdgeLabelRenderer>
          <span
            className="pointer-events-none absolute rounded bg-card px-1 text-xs text-card-foreground"
            style={{ transform: `translate(-50%, -50%) translate(${label.x}px, ${label.y}px)` }}
          >
            {edge.label}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const TransitionEdge = memo(TransitionEdgeView);
