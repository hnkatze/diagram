import {
  NAME_FONT_SIZE,
  NODE_HEADER_HEIGHT,
  NODE_PADDING_X,
  NODE_ROW_HEIGHT,
  ROW_FONT_SIZE,
  bounds,
  estimateTextWidth,
  formatFieldLabel,
  measureNode,
} from "./measure.ts";
import type { Diagram, DiagramEdge, DiagramKind, DiagramNode, Rect } from "./types.ts";

/**
 * Image exporter (spec S9). A pure `Diagram -> SVG` projection: no DOM, no
 * randomness, no timestamps, so the same diagram always yields the same bytes.
 *
 * Every size comes from `measure.ts`, so the canvas and the exported image
 * cannot drift apart.
 */

export interface SvgOptions {
  /** Extra space around the whole drawing. */
  padding?: number;
  /** Solid backdrop painted behind everything. */
  background?: string;
  /** Font stack used by every text element. */
  fontFamily?: string;
}

const DEFAULT_PADDING = 48;
const DEFAULT_BACKGROUND = "#ffffff";
const FONT_SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const FONT_MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const TITLE_HEIGHT = 40;
const TITLE_FONT_SIZE = 20;

const COLORS = {
  stroke: "#94a3b8",
  header: "#eef2ff",
  text: "#0f172a",
  muted: "#475569",
  edge: "#64748b",
  label: "#334155",
} as const;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Point where the segment from the rectangle center towards `toward` leaves the box. */
function borderPoint(box: Rect, towardX: number, towardY: number): { x: number; y: number } {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const dx = towardX - centerX;
  const dy = towardY - centerY;
  if (dx === 0 && dy === 0) return { x: centerX, y: centerY };

  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : box.width / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : box.height / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: centerX + dx * scale, y: centerY + dy * scale };
}

export function toSvg(diagram: Diagram, options: SvgOptions = {}): string {
  const padding = options.padding ?? DEFAULT_PADDING;
  const background = options.background ?? DEFAULT_BACKGROUND;
  const fontFamily = options.fontFamily ?? FONT_SANS;
  const titleHeight = diagram.title.trim() === "" ? 0 : TITLE_HEIGHT;

  const box = bounds(diagram, padding);
  const width = Math.max(1, Math.ceil(box.width));
  const height = Math.max(1, Math.ceil(box.height + titleHeight));

  const boxOf = (node: DiagramNode): Rect => {
    const size = measureNode(node, diagram.kind);
    return {
      x: round(node.x - box.x),
      y: round(node.y - box.y + titleHeight),
      width: size.width,
      height: size.height,
    };
  };

  const boxes = new Map<string, Rect>();
  for (const node of diagram.nodes) boxes.set(node.id, boxOf(node));

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${escapeXml(fontFamily)}">`,
  );
  parts.push(
    `<style>text{dominant-baseline:middle} .n{font-size:${NAME_FONT_SIZE}px;font-weight:600;fill:${COLORS.text}} .f{font-size:${ROW_FONT_SIZE}px;fill:${COLORS.muted}} .c{font-size:11px;fill:${COLORS.edge}} .l{font-size:12px;fill:${COLORS.label}} .t{font-size:${TITLE_FONT_SIZE}px;font-weight:700;fill:${COLORS.text}}</style>`,
  );
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(background)}"/>`);

  if (titleHeight > 0) {
    parts.push(
      `<text class="t" x="${padding}" y="${padding + TITLE_HEIGHT / 2}">${escapeXml(diagram.title)}</text>`,
    );
  }

  // Relations go under the entities so a box always covers its own edge ends.
  for (const edge of diagram.edges) {
    parts.push(renderEdge(edge, boxes));
  }

  for (const node of diagram.nodes) {
    const entityBox = boxes.get(node.id);
    if (!entityBox) continue;
    parts.push(renderNode(node, entityBox, diagram.kind));
  }

  parts.push("</svg>");
  return parts.join("");
}

function renderEdge(edge: DiagramEdge, boxes: Map<string, Rect>): string {
  const source = boxes.get(edge.source);
  const target = boxes.get(edge.target);
  if (!source || !target) return "";

  const parts: string[] = [];

  if (edge.source === edge.target) {
    // Self relation: a loop leaving the right edge and rejoining the top edge.
    const startX = round(source.x + source.width);
    const startY = round(source.y + NODE_HEADER_HEIGHT / 2);
    const controlX = round(source.x + source.width + 56);
    const endX = round(source.x + source.width / 2);
    const endY = round(source.y);
    parts.push(
      `<path d="M ${startX} ${startY} C ${controlX} ${startY} ${controlX} ${round(endY - 40)} ${endX} ${endY}" fill="none" stroke="${COLORS.edge}" stroke-width="1.5"/>`,
    );
    if (edge.label !== "") {
      const text = escapeXml(edge.label);
      const labelWidth = Math.ceil(estimateTextWidth(edge.label, 12)) + 8;
      const labelX = round(controlX + 6);
      const labelY = round(startY - 20);
      parts.push(
        `<rect x="${labelX}" y="${round(labelY - 9)}" width="${labelWidth}" height="18" fill="#ffffff"/>`,
      );
      parts.push(`<text class="l" x="${labelX + 4}" y="${labelY}">${text}</text>`);
    }
    return parts.join("");
  }

  const from = borderPoint(source, target.x + target.width / 2, target.y + target.height / 2);
  const to = borderPoint(target, source.x + source.width / 2, source.y + source.height / 2);

  parts.push(
    `<line x1="${round(from.x)}" y1="${round(from.y)}" x2="${round(to.x)}" y2="${round(to.y)}" stroke="${COLORS.edge}" stroke-width="1.5"/>`,
  );

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const unitX = dx / length;
  const unitY = dy / length;
  const offset = 16;

  const sourceCardX = round(from.x + unitX * offset);
  const sourceCardY = round(from.y + unitY * offset);
  const targetCardX = round(to.x - unitX * offset);
  const targetCardY = round(to.y - unitY * offset);

  parts.push(
    `<text class="c" x="${sourceCardX}" y="${sourceCardY}" text-anchor="middle">${escapeXml(edge.sourceCardinality)}</text>`,
  );
  parts.push(
    `<text class="c" x="${targetCardX}" y="${targetCardY}" text-anchor="middle">${escapeXml(edge.targetCardinality)}</text>`,
  );

  if (edge.label !== "") {
    const midX = round((from.x + to.x) / 2);
    const midY = round((from.y + to.y) / 2 - 10);
    const labelWidth = Math.ceil(estimateTextWidth(edge.label, 12)) + 10;
    parts.push(
      `<rect x="${round(midX - labelWidth / 2)}" y="${round(midY - 9)}" width="${labelWidth}" height="18" fill="#ffffff"/>`,
    );
    parts.push(
      `<text class="l" x="${midX}" y="${midY}" text-anchor="middle">${escapeXml(edge.label)}</text>`,
    );
  }

  return parts.join("");
}

function renderNode(node: DiagramNode, box: Rect, kind: DiagramKind): string {
  const clipId = `box-${node.id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  const parts: string[] = [];

  parts.push(`<clipPath id="${clipId}"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="8"/></clipPath>`);
  parts.push(`<g clip-path="url(#${clipId})">`);
  parts.push(
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${NODE_HEADER_HEIGHT}" fill="${COLORS.header}"/>`,
  );
  parts.push(
    `<text class="n" x="${round(box.x + NODE_PADDING_X)}" y="${round(box.y + NODE_HEADER_HEIGHT / 2)}">${escapeXml(node.name)}</text>`,
  );

  const separatorY = round(box.y + NODE_HEADER_HEIGHT);
  parts.push(
    `<line x1="${box.x}" y1="${separatorY}" x2="${round(box.x + box.width)}" y2="${separatorY}" stroke="${COLORS.stroke}" stroke-width="1"/>`,
  );

  if (node.fields.length === 0) {
    parts.push(
      `<text class="f" x="${round(box.x + NODE_PADDING_X)}" y="${round(box.y + NODE_HEADER_HEIGHT + NODE_ROW_HEIGHT / 2)}">—</text>`,
    );
  }

  node.fields.forEach((field, index) => {
    const rowTop = box.y + NODE_HEADER_HEIGHT + index * NODE_ROW_HEIGHT;
    const rowId = `${clipId}-row-${index}`;
    parts.push(
      `<clipPath id="${rowId}"><rect x="${box.x}" y="${round(rowTop)}" width="${round(box.width - 8)}" height="${NODE_ROW_HEIGHT}"/></clipPath>`,
    );
    parts.push(
      `<text class="f" clip-path="url(#${rowId})" x="${round(box.x + NODE_PADDING_X)}" y="${round(rowTop + NODE_ROW_HEIGHT / 2)}" font-family="${FONT_MONO}">${escapeXml(formatFieldLabel(field, kind))}</text>`,
    );
  });

  parts.push("</g>");
  parts.push(
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="8" fill="none" stroke="${COLORS.stroke}" stroke-width="1.5"/>`,
  );

  return parts.join("");
}
