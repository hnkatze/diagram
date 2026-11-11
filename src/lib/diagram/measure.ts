import type { Diagram, DiagramField, DiagramKind, DiagramNode, Rect, Size } from "./types.ts";

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
