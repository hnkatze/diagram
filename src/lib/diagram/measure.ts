import type { Diagram, DiagramField, DiagramKind, DiagramNode, Point, Rect, Size } from "./types.ts";

/**
 * Node geometry is shared by the canvas and the image exporter so both agree
 * on where every box starts, ends and how wide it is.
 */
export const NODE_HEADER_HEIGHT = 40;
export const NODE_ROW_HEIGHT = 24;
export const NODE_PADDING_X = 16;
export const NODE_PADDING_BOTTOM = 8;
export const NODE_MIN_WIDTH = 180;
export const NODE_MAX_WIDTH = 320;
export const NAME_FONT_SIZE = 14;
export const ROW_FONT_SIZE = 12;

/** Glyphs that need extra room so long names do not clip. */
const WIDE_GLYPHS = "mwMW@#%&";

/**
 * Deterministic text width estimate. There is no DOM in tests and no fonts
 * loaded at export time, so both surfaces measure with the same approximation.
 */
export function estimateTextWidth(text: string, fontSize: number, mono = false): number {
  const factor = mono ? 0.6 : 0.55;
  let width = 0;
  for (const glyph of text) {
    width += WIDE_GLYPHS.includes(glyph) ? fontSize * factor * 1.35 : fontSize * factor;
  }
  return Math.ceil(width);
}

/** Single source for the text of a field row, shared by canvas and exporter. */
export function formatFieldLabel(field: DiagramField, kind: DiagramKind): string {
  const glyph = kind === "uml-class" ? `${field.visibility} ` : "";
  const badges = [field.pk ? "PK" : "", field.fk ? "FK" : "", field.uk ? "UK" : ""].filter(Boolean).join(" ");
  const nullMark = field.nullable ? "?" : "";
  const type = field.type ? ` : ${field.type}` : "";
  const suffix = badges ? ` ${badges}` : "";
  return `${glyph}${field.name}${nullMark}${type}${suffix}`;
}

export function measureNode(node: DiagramNode, kind: DiagramKind): Size {
  const nameWidth = estimateTextWidth(node.name, NAME_FONT_SIZE) + NODE_PADDING_X * 2;
  const rowWidths = node.fields.map(
    (field) => estimateTextWidth(formatFieldLabel(field, kind), ROW_FONT_SIZE, true) + NODE_PADDING_X * 2,
  );
  const widest = Math.max(nameWidth, ...rowWidths);
  const width = Math.min(NODE_MAX_WIDTH, Math.max(NODE_MIN_WIDTH, Math.ceil(widest)));
  // An entity without fields still renders one placeholder row.
  const rows = Math.max(node.fields.length, 1);
  const height = NODE_HEADER_HEIGHT + rows * NODE_ROW_HEIGHT + NODE_PADDING_BOTTOM;
  return { width, height };
}

/** How far along the line each cardinality label sits from its own border point. */
export const CARDINALITY_INSET = 22;
/** How far the label is pushed off the line, so text never sits on top of it. */
export const CARDINALITY_OFFSET = 10;

const roundPoint = (value: number): number => Math.round(value * 100) / 100;

/**
 * Point where the ray from the rectangle center towards `toward` leaves the box.
 * Relation endpoints are cut on the border with this, so a line never starts by
 * running back across the inside of its own entity.
 */
export function borderPoint(box: Rect, towardX: number, towardY: number): Point {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const dx = towardX - centerX;
  const dy = towardY - centerY;
  if (dx === 0 && dy === 0) return { x: centerX, y: centerY };

  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : box.width / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : box.height / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: roundPoint(centerX + dx * scale), y: roundPoint(centerY + dy * scale) };
}

/** Sign that pushes a label away from the box it belongs to. */
function outwardSign(point: Point, box: Rect | undefined, perpX: number, perpY: number): number {
  if (!box) return 1;
  const normalX = point.x - (box.x + box.width / 2);
  const normalY = point.y - (box.y + box.height / 2);
  return normalX * perpX + normalY * perpY < 0 ? -1 : 1;
}

/**
 * Where the two cardinalities of a relation are drawn: inset along the line and
 * nudged off it, on the side that faces away from the entity they belong to.
 * Canvas and exporter share this so the screen and the file place them equally.
 */
export function cardinalityPoints(
  from: Point,
  to: Point,
  sourceBox?: Rect,
  targetBox?: Rect,
): { source: Point; target: Point } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const unitX = dx / length;
  const unitY = dy / length;
  // Left normal of the direction of travel, flipped per end when it points inward.
  const perpX = unitY;
  const perpY = -unitX;
  const sourceSign = outwardSign(from, sourceBox, perpX, perpY) * CARDINALITY_OFFSET;
  const targetSign = outwardSign(to, targetBox, perpX, perpY) * CARDINALITY_OFFSET;

  return {
    source: {
      x: from.x + unitX * CARDINALITY_INSET + perpX * sourceSign,
      y: from.y + unitY * CARDINALITY_INSET + perpY * sourceSign,
    },
    target: {
      x: to.x - unitX * CARDINALITY_INSET + perpX * targetSign,
      y: to.y - unitY * CARDINALITY_INSET + perpY * targetSign,
    },
  };
}

/** Bounding box of every node, expanded by `padding`, used by the exporter. */
export function bounds(diagram: Diagram, padding = 40): Rect {
  if (diagram.nodes.length === 0) {
    return { x: 0, y: 0, width: padding * 2, height: padding * 2 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of diagram.nodes) {
    const size = measureNode(node, diagram.kind);
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + size.width);
    maxY = Math.max(maxY, node.y + size.height);
  }

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}
