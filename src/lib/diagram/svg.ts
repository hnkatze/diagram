import {
  NAME_FONT_SIZE,
  NODE_HEADER_HEIGHT,
  NODE_PADDING_X,
  NODE_ROW_HEIGHT,
  PSEUDO_STATE_SIZE,
  ROW_FONT_SIZE,
  STATE_NAME_FONT_SIZE,
  borderPoint,
  bounds,
  cardinalityPoints,
  estimateTextWidth,
  formatFieldLabel,
  measureNode,
  measureState,
} from "./measure.ts";
import { isStateDiagram } from "./types.ts";
import type {
  Diagram,
  DiagramKind,
  ErDiagram,
  ErNode,
  Rect,
  RelationEdge,
  Size,
  StateDiagram,
  StateNode,
  Transition,
} from "./types.ts";

/**
 * Image exporter (specs S7, S9). A pure `Diagram -> SVG` projection: no DOM, no
 * randomness, no timestamps, so the same diagram always yields the same bytes.
 *
 * Every size comes from `measure.ts`, so the canvas and the exported image
 * cannot drift apart. One entry point, one dispatch on `kind`, two renderers.
 */

export type SvgTheme = "dark" | "light";

export interface SvgOptions {
  /** Extra space around the whole drawing. */
  padding?: number;
  /** Solid backdrop painted behind everything. Overrides the theme palette. */
  background?: string;
  /** Font stack used by every text element. */
  fontFamily?: string;
  /** Colour palette. The app is dark-only, so the file matches the screen by default. */
  theme?: SvgTheme;
}

const DEFAULT_PADDING = 48;
const FONT_SANS = "'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const TITLE_HEIGHT = 40;
const TITLE_FONT_SIZE = 20;

/** Corner radius shared by an entity box and a state box. */
const BOX_RADIUS = 8;

/**
 * Id of the single arrowhead marker of a state document. A constant, not a hash
 * of the diagram: a marker is a per-document definition, and the value has to
 * survive a re-export unchanged.
 */
const ARROW_MARKER_ID = "state-transition-arrow";

/**
 * How far a self transition swings out past the right edge of its state. Kept
 * under the default padding so the loop never leaves the document `bounds`.
 */
const LOOP_REACH = 40;
/** How far above the top edge the loop turns back, like the self relation loop. */
const LOOP_RISE = 30;
/** Distance between the loop label and the top edge of its state. */
const LOOP_LABEL_GAP = 36;

interface Palette {
  background: string;
  stroke: string;
  header: string;
  text: string;
  muted: string;
  edge: string;
  label: string;
}

/**
 * The dark palette mirrors the shadcn tokens of `globals.css` as literal hex,
 * because a downloaded SVG cannot read CSS variables of the page it came from.
 */
const PALETTES: Record<SvgTheme, Palette> = {
  dark: {
    background: "#0a0a0a", // --background
    stroke: "#3f3f3f", // readable stand-in for --border on dark
    header: "#262626", // --muted
    text: "#fafafa", // --foreground
    muted: "#a1a1a1", // --muted-foreground
    edge: "#8f8f8f",
    label: "#d4d4d4",
  },
  light: {
    background: "#ffffff",
    stroke: "#94a3b8",
    header: "#eef2ff",
    text: "#0f172a",
    muted: "#475569",
    edge: "#64748b",
    label: "#334155",
  },
};

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

/** Everything the two families share: canvas frame, palette and title slot. */
interface Frame {
  width: number;
  height: number;
  padding: number;
  titleHeight: number;
  palette: Palette;
  background: string;
  fontFamily: string;
  /** Document extent, from `bounds`; the only source of the drawing origin. */
  box: Rect;
}

function createFrame(diagram: Diagram, options: SvgOptions): Frame {
  const padding = options.padding ?? DEFAULT_PADDING;
  const palette = PALETTES[options.theme ?? "dark"];
  const background = options.background ?? palette.background;
  const fontFamily = options.fontFamily ?? FONT_SANS;
  const titleHeight = diagram.title.trim() === "" ? 0 : TITLE_HEIGHT;

  const box = bounds(diagram, padding);
  const width = Math.max(1, Math.ceil(box.width));
  const height = Math.max(1, Math.ceil(box.height + titleHeight));

  return { width, height, padding, titleHeight, palette, background, fontFamily, box };
}

/** Model coordinates to document coordinates, for one already-measured node. */
function boxOf(node: { x: number; y: number }, size: Size, frame: Frame): Rect {
  return {
    x: round(node.x - frame.box.x),
    y: round(node.y - frame.box.y + frame.titleHeight),
    width: size.width,
    height: size.height,
  };
}

/** Where a label goes: the backdrop rect and the text share one anchor point. */
interface LabelPlacement {
  /** Horizontal anchor of the text, and the rect edge it is padded from. */
  x: number;
  /** Vertical centre of both the backdrop and the text. */
  y: number;
  /** `middle` centres on `x`; `start` begins at `x` plus half the padding. */
  anchor: "middle" | "start";
  /** Horizontal padding inside the backdrop rect. */
  padX: number;
}

/** A label with the backdrop that keeps the line from running through it. */
function renderLabel(text: string, at: LabelPlacement, frame: Frame): string {
  const width = Math.ceil(estimateTextWidth(text, 12)) + at.padX;
  const rectX = at.anchor === "middle" ? round(at.x - width / 2) : at.x;
  const textX = at.anchor === "middle" ? at.x : at.x + at.padX / 2;
  const anchor = at.anchor === "middle" ? ` text-anchor="middle"` : "";
  return [
    `<rect x="${rectX}" y="${round(at.y - 9)}" width="${width}" height="18" fill="${escapeXml(frame.background)}"/>`,
    `<text class="l" x="${textX}" y="${at.y}"${anchor}>${escapeXml(text)}</text>`,
  ].join("");
}

export function toSvg(diagram: Diagram, options: SvgOptions = {}): string {
  const frame = createFrame(diagram, options);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}" font-family="${escapeXml(frame.fontFamily)}">`,
    `<style>text{dominant-baseline:middle} .n{font-size:${NAME_FONT_SIZE}px;font-weight:600;fill:${frame.palette.text}} .f{font-size:${ROW_FONT_SIZE}px;fill:${frame.palette.muted}} .c{font-size:11px;fill:${frame.palette.edge}} .l{font-size:12px;fill:${frame.palette.label}} .t{font-size:${TITLE_FONT_SIZE}px;font-weight:700;fill:${frame.palette.text}}</style>`,
    `<rect x="0" y="0" width="${frame.width}" height="${frame.height}" fill="${escapeXml(frame.background)}"/>`,
  ];

  if (frame.titleHeight > 0) {
    parts.push(
      `<text class="t" x="${frame.padding}" y="${frame.padding + TITLE_HEIGHT / 2}">${escapeXml(diagram.title)}</text>`,
    );
  }

  parts.push(...(isStateDiagram(diagram) ? stateBody(diagram, frame) : classBody(diagram, frame)));
  parts.push("</svg>");
  return parts.join("");
}

function classBody(diagram: ErDiagram, frame: Frame): string[] {
  const boxes = new Map<string, Rect>();
  for (const node of diagram.nodes) {
    boxes.set(node.id, boxOf(node, measureNode(node, diagram.kind), frame));
  }

  const parts: string[] = [];

  // Relations go under the entities so a box always covers its own edge ends.
  for (const edge of diagram.edges) {
    parts.push(renderEdge(edge, boxes, frame));
  }

  for (const node of diagram.nodes) {
    const entityBox = boxes.get(node.id);
    if (!entityBox) continue;
    parts.push(renderNode(node, entityBox, diagram.kind, frame.palette));
  }

  return parts;
}

function renderEdge(edge: RelationEdge, boxes: Map<string, Rect>, frame: Frame): string {
  const source = boxes.get(edge.source);
  const target = boxes.get(edge.target);
  if (!source || !target) return "";

  const palette = frame.palette;
  const parts: string[] = [];

  if (edge.source === edge.target) {
    // Self relation: a loop leaving the right edge and rejoining the top edge.
    // It reuses the same reach/rise as the state loop so the whole drawing stays
    // inside the extent `bounds` reserves (the default padding is 48).
    const startX = round(source.x + source.width);
    const startY = round(source.y + NODE_HEADER_HEIGHT / 2);
    const controlX = round(startX + LOOP_REACH);
    const endX = round(source.x + source.width / 2);
    const endY = round(source.y);
    parts.push(
      `<path d="M ${startX} ${startY} C ${controlX} ${startY} ${controlX} ${round(endY - LOOP_RISE)} ${endX} ${endY}" fill="none" stroke="${palette.edge}" stroke-width="1.5"/>`,
    );
    if (edge.label !== "") {
      // Centred over the loop instead of trailing past its control point, which
      // used to push the label outside the exported image.
      const labelX = round((startX + endX) / 2);
      const labelY = round(Math.min(startY, endY) - LOOP_RISE - 10);
      parts.push(renderLabel(edge.label, { x: labelX, y: labelY, anchor: "middle", padX: 8 }, frame));
    }
    return parts.join("");
  }

  const from = borderPoint(source, target.x + target.width / 2, target.y + target.height / 2);
  const to = borderPoint(target, source.x + source.width / 2, source.y + source.height / 2);

  parts.push(
    `<line x1="${round(from.x)}" y1="${round(from.y)}" x2="${round(to.x)}" y2="${round(to.y)}" stroke="${palette.edge}" stroke-width="1.5"/>`,
  );

  const cards = cardinalityPoints(from, to, source, target);

  const sourceCardX = round(cards.source.x);
  const sourceCardY = round(cards.source.y);
  const targetCardX = round(cards.target.x);
  const targetCardY = round(cards.target.y);

  parts.push(
    `<text class="c" x="${sourceCardX}" y="${sourceCardY}" text-anchor="middle">${escapeXml(edge.sourceCardinality)}</text>`,
  );
  parts.push(
    `<text class="c" x="${targetCardX}" y="${targetCardY}" text-anchor="middle">${escapeXml(edge.targetCardinality)}</text>`,
  );

  if (edge.label !== "") {
    const midX = round((from.x + to.x) / 2);
    const midY = round((from.y + to.y) / 2 - 10);
    parts.push(renderLabel(edge.label, { x: midX, y: midY, anchor: "middle", padX: 10 }, frame));
  }

  return parts.join("");
}

function renderNode(node: ErNode, box: Rect, kind: DiagramKind, palette: Palette): string {
  const clipId = `box-${node.id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  const parts: string[] = [];

  parts.push(`<clipPath id="${clipId}"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="8"/></clipPath>`);
  parts.push(`<g clip-path="url(#${clipId})">`);
  parts.push(
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${NODE_HEADER_HEIGHT}" fill="${palette.header}"/>`,
  );
  parts.push(
    `<text class="n" x="${round(box.x + NODE_PADDING_X)}" y="${round(box.y + NODE_HEADER_HEIGHT / 2)}">${escapeXml(node.name)}</text>`,
  );

  const separatorY = round(box.y + NODE_HEADER_HEIGHT);
  parts.push(
    `<line x1="${box.x}" y1="${separatorY}" x2="${round(box.x + box.width)}" y2="${separatorY}" stroke="${palette.stroke}" stroke-width="1"/>`,
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
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="8" fill="none" stroke="${palette.stroke}" stroke-width="1.5"/>`,
  );

  return parts.join("");
}

/**
 * One arrowhead definition per document, referenced by every transition. The
 * tip sits on the border point the line was clipped to, so the arrow points at
 * the target instead of stopping short of it.
 */
function arrowMarker(palette: Palette): string {
  return `<defs><marker id="${ARROW_MARKER_ID}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${palette.edge}"/></marker></defs>`;
}

function stateBody(diagram: StateDiagram, frame: Frame): string[] {
  const boxes = new Map<string, Rect>();
  for (const node of diagram.nodes) {
    boxes.set(node.id, boxOf(node, measureState(node), frame));
  }

  const parts: string[] = [arrowMarker(frame.palette)];

  // Transitions go under the states so a state always covers its own edge ends.
  for (const edge of diagram.edges) {
    parts.push(renderTransition(edge, boxes, frame));
  }

  for (const node of diagram.nodes) {
    const stateBox = boxes.get(node.id);
    if (!stateBox) continue;
    parts.push(renderState(node, stateBox, frame.palette));
  }

  return parts;
}

function renderState(node: StateNode, box: Rect, palette: Palette): string {
  const centerX = round(box.x + box.width / 2);
  const centerY = round(box.y + box.height / 2);

  if (node.role === "initial") {
    // A filled circle that fills the whole pseudo-state square.
    return `<circle cx="${centerX}" cy="${centerY}" r="${round(box.width / 2)}" fill="${palette.text}"/>`;
  }

  if (node.role === "final") {
    // A ring with a filled inner circle inside the same square.
    return [
      `<circle cx="${centerX}" cy="${centerY}" r="${round(box.width / 2)}" fill="none" stroke="${palette.text}" stroke-width="1.5"/>`,
      `<circle cx="${centerX}" cy="${centerY}" r="${round(PSEUDO_STATE_SIZE / 4)}" fill="${palette.text}"/>`,
    ].join("");
  }

  return [
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${BOX_RADIUS}" fill="${palette.header}" stroke="${palette.stroke}" stroke-width="1.5"/>`,
    `<text class="n" x="${centerX}" y="${centerY}" text-anchor="middle" font-size="${STATE_NAME_FONT_SIZE}">${escapeXml(node.name)}</text>`,
  ].join("");
}

function renderTransition(edge: Transition, boxes: Map<string, Rect>, frame: Frame): string {
  const source = boxes.get(edge.source);
  const target = boxes.get(edge.target);
  if (!source || !target) return "";

  const arrow = `marker-end="url(#${ARROW_MARKER_ID})"`;
  const parts: string[] = [];

  if (edge.source === edge.target) {
    // Self transition: a loop leaving the right edge and rejoining the top edge,
    // with the arrowhead on the end that comes back into the state.
    const start = borderPoint(source, source.x + source.width * 2, source.y + source.height / 2);
    const end = borderPoint(source, source.x + source.width / 2, source.y - source.height * 2);
    const startX = round(start.x);
    const startY = round(start.y);
    const endX = round(end.x);
    const endY = round(end.y);
    const controlX = round(startX + LOOP_REACH);
    parts.push(
      `<path d="M ${startX} ${startY} C ${controlX} ${startY} ${controlX} ${round(endY - LOOP_RISE)} ${endX} ${endY}" fill="none" stroke="${frame.palette.edge}" stroke-width="1.5" ${arrow}/>`,
    );
    if (edge.label !== "") {
      // Above the loop and centred on the box, the only free side that is
      // inside the document extent for a state pulled to any edge of it.
      parts.push(
        renderLabel(
          edge.label,
          {
            x: round(source.x + source.width / 2),
            y: round(source.y - LOOP_LABEL_GAP),
            anchor: "middle",
            padX: 10,
          },
          frame,
        ),
      );
    }
    return parts.join("");
  }

  const from = borderPoint(source, target.x + target.width / 2, target.y + target.height / 2);
  const to = borderPoint(target, source.x + source.width / 2, source.y + source.height / 2);

  parts.push(
    `<line x1="${round(from.x)}" y1="${round(from.y)}" x2="${round(to.x)}" y2="${round(to.y)}" stroke="${frame.palette.edge}" stroke-width="1.5" ${arrow}/>`,
  );

  if (edge.label !== "") {
    const midX = round((from.x + to.x) / 2);
    const midY = round((from.y + to.y) / 2 - 10);
    parts.push(renderLabel(edge.label, { x: midX, y: midY, anchor: "middle", padX: 10 }, frame));
  }

  return parts.join("");
}
