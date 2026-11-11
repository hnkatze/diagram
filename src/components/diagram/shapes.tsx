"use client";

import { memo } from "react";
import { EdgeLabelRenderer, Handle, Position, getStraightPath, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";

import { NODE_HEADER_HEIGHT, NODE_PADDING_X, NODE_ROW_HEIGHT, formatFieldLabel } from "@/lib/diagram/measure";
import type { DiagramEdge, DiagramKind, DiagramNode } from "@/lib/diagram/types";

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
    <div className="group relative h-full w-full overflow-hidden rounded-lg border-[1.5px] border-slate-400 bg-white">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-0 !bg-slate-400 opacity-0 transition-opacity group-hover:opacity-100"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-0 !bg-slate-400 opacity-0 transition-opacity group-hover:opacity-100"
      />
      <div
        className="flex items-center border-b border-slate-300 bg-indigo-50"
        style={{ height: NODE_HEADER_HEIGHT, paddingInline: NODE_PADDING_X }}
      >
        <span className="truncate text-sm font-semibold text-slate-900">{node.name}</span>
      </div>
      <div>
        {node.fields.length === 0 ? (
          <div
            className="text-xs text-slate-400"
            style={{ height: NODE_ROW_HEIGHT, lineHeight: `${NODE_ROW_HEIGHT}px`, paddingInline: NODE_PADDING_X }}
          >
            —
          </div>
        ) : (
          node.fields.map((field, index) => (
            <div
              key={`${field.name}-${index}`}
              className="truncate font-mono text-xs text-slate-600"
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

const CARDINALITY_INSET = 18;
const SELF_LOOP_X = 56;
const SELF_LOOP_Y = 64;

function SelfLoopPath(x: number, y: number): string {
  return `M ${x} ${y} C ${x + SELF_LOOP_X} ${y} ${x + SELF_LOOP_X} ${y - SELF_LOOP_Y} ${x} ${y - SELF_LOOP_Y}`;
}

function RelationEdgeView({ sourceX, sourceY, targetX, targetY, data, selected }: EdgeProps<RelationEdgeType>) {
  const edge = data?.edge;
  if (!edge) return null;
  const isSelfLoop = sourceX === targetX && sourceY === targetY;
  const [straightPath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const path = isSelfLoop ? SelfLoopPath(sourceX, sourceY) : straightPath;

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy) || 1;
  const unitX = dx / length;
  const unitY = dy / length;

  const sourceCardX = isSelfLoop ? sourceX + SELF_LOOP_X * 0.5 : sourceX + unitX * CARDINALITY_INSET;
  const sourceCardY = isSelfLoop ? sourceY - 6 : sourceY + unitY * CARDINALITY_INSET;
  const targetCardX = isSelfLoop ? sourceX + SELF_LOOP_X * 0.5 : targetX - unitX * CARDINALITY_INSET;
  const targetCardY = isSelfLoop ? sourceY - SELF_LOOP_Y + 12 : targetY - unitY * CARDINALITY_INSET;

  return (
    <>
      <path
        d={path}
        fill="none"
        strokeWidth={selected ? 2.5 : 1.5}
        className={selected ? "stroke-slate-900" : "stroke-slate-400"}
      />
      <EdgeLabelRenderer>
        <span
          className="pointer-events-none absolute text-[11px] text-slate-500"
          style={{ transform: `translate(-50%, -50%) translate(${sourceCardX}px, ${sourceCardY}px)` }}
        >
          {edge.sourceCardinality}
        </span>
        <span
          className="pointer-events-none absolute text-[11px] text-slate-500"
          style={{ transform: `translate(-50%, -50%) translate(${targetCardX}px, ${targetCardY}px)` }}
        >
          {edge.targetCardinality}
        </span>
        {edge.label === "" ? null : (
          <span
            className="pointer-events-none absolute rounded bg-white px-1 text-xs text-slate-700"
            style={{
              transform: `translate(-50%, -50%) translate(${isSelfLoop ? sourceX + SELF_LOOP_X + 24 : labelX}px, ${isSelfLoop ? sourceY - SELF_LOOP_Y * 0.75 : labelY}px)`,
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
