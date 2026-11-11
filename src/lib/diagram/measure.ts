import { isContainerRole, isStateDiagram } from "./types.ts";
import type {
  Cardinality,
  Diagram,
  DiagramField,
  DiagramKind,
  ErNode,
  GlyphNode,
  Point,
  Rect,
  RelationKind,
  Size,
  StateNode,
} from "./types.ts";

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

/**
 * State geometry (spec S6). Shared by the canvas, the layout and the exporter,
 * so a state cannot be one size on screen and another one in the file.
 */
export const STATE_MIN_WIDTH = 120;
export const STATE_MAX_WIDTH = 260;
export const STATE_HEIGHT = 48;
export const STATE_PADDING_X = 16;
export const STATE_NAME_FONT_SIZE = 14;
/** Diameter of the `initial` circle and the `final` ring. */
export const PSEUDO_STATE_SIZE = 24;

/**
 * Container geometry (spec S2). A container's rectangle is derived from its
 * children, never stored; `containerBox` is the only place that does it, and
 * these two constants are the only numbers it uses.
 */
export const CONTAINER_INSET = 24;
export const CONTAINER_TITLE_HEIGHT = 28;
/** Fixed per-character title width of an empty container, so its size is deterministic. */
export const CONTAINER_TITLE_CHAR_WIDTH = 9;

/**
 * Glyph geometry. One size per role, shared by the canvas, the layout and the
 * exporter; the label is drawn inside (or under) the box and may overflow it.
 */
export const ACTOR_WIDTH = 40;
export const ACTOR_HEIGHT = 60;
export const USECASE_WIDTH = 180;
export const USECASE_HEIGHT = 72;
export const COMPONENT_WIDTH = 180;
export const COMPONENT_HEIGHT = 72;
export const INTERFACE_SIZE = 60;
export const OBJECT_WIDTH = 160;
export const OBJECT_HEIGHT = 64;

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

export function measureNode(node: ErNode, kind: DiagramKind): Size {
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

/**
 * A state sizes from its name only; the two pseudo-states are square glyphs with
 * no text, so they share one fixed size.
 */
export function measureState(node: StateNode): Size {
  if (node.role !== "state") return { width: PSEUDO_STATE_SIZE, height: PSEUDO_STATE_SIZE };
  const nameWidth = estimateTextWidth(node.name, STATE_NAME_FONT_SIZE) + STATE_PADDING_X * 2;
  const width = Math.min(STATE_MAX_WIDTH, Math.max(STATE_MIN_WIDTH, Math.ceil(nameWidth)));
  return { width, height: STATE_HEIGHT };
}

/** Size of a glyph node by role. A container has no size of its own: `containerBox` derives it. */
export function measureGlyph(node: GlyphNode): Size {
  switch (node.role) {
    case "actor":
      return { width: ACTOR_WIDTH, height: ACTOR_HEIGHT };
    case "usecase":
      return { width: USECASE_WIDTH, height: USECASE_HEIGHT };
    case "component":
      return { width: COMPONENT_WIDTH, height: COMPONENT_HEIGHT };
    case "interface":
      return { width: INTERFACE_SIZE, height: INTERFACE_SIZE };
    case "object":
      return { width: OBJECT_WIDTH, height: OBJECT_HEIGHT };
    default:
      return { width: 0, height: 0 };
  }
}

/** A node of either container-capable family. */
export type BoxNode = ErNode | GlyphNode;

/** The part of a diagram that container geometry needs: its kind and its nodes. */
export interface BoxDiagram {
  kind: DiagramKind;
  nodes: readonly BoxNode[];
}

/** Size of a non-container node of either container-capable family. */
export function measureBox(node: BoxNode, kind: DiagramKind): Size {
  return "fields" in node ? measureNode(node, kind) : measureGlyph(node);
}

/** True for the roles that hold other nodes. */
export function isContainer(node: BoxNode): boolean {
  return isContainerRole(node.role);
}

/**
 * Rectangle of a container in document coordinates: the bounding box of its
 * children grown by the inset, with the title strip reserved on top. An empty
 * container keeps its own position and takes the minimum size that fits its title.
 */
export function containerBox(diagram: BoxDiagram, container: BoxNode): Rect {
  const children = diagram.nodes.filter((node) => node.parentId === container.id);
  if (children.length === 0) {
    return {
      x: container.x,
      y: container.y,
      width: container.name.length * CONTAINER_TITLE_CHAR_WIDTH + CONTAINER_INSET,
      height: CONTAINER_TITLE_HEIGHT + CONTAINER_INSET,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const child of children) {
    const size = measureBox(child, diagram.kind);
    minX = Math.min(minX, child.x);
    minY = Math.min(minY, child.y);
    maxX = Math.max(maxX, child.x + size.width);
    maxY = Math.max(maxY, child.y + size.height);
  }

  return {
    x: minX - CONTAINER_INSET,
    y: minY - CONTAINER_INSET - CONTAINER_TITLE_HEIGHT,
    // The title never overflows: the box is at least as wide as the title plus the inset on both sides.
    width: Math.max(maxX - minX, container.name.length * CONTAINER_TITLE_CHAR_WIDTH) + CONTAINER_INSET * 2,
    height: maxY - minY + CONTAINER_INSET * 2 + CONTAINER_TITLE_HEIGHT,
  };
}

/** Corner radius of the folder tab of a package. */
const CONTAINER_TAB_RADIUS = 6;

/**
 * Folder tab of a `package`, as an outline path in the same coordinates as `box`.
 * It lives inside the title strip `containerBox` already reserves and is as wide
 * as the title plus the inset, so the title sits on it. `region` and entities get
 * none. Canvas and exporter both draw this and neither computes its own.
 */
export function containerTabPath(node: BoxNode, box: Rect): string | null {
  if (node.role !== "package") return null;
  const width = Math.min(box.width, estimateTextWidth(node.name, ROW_FONT_SIZE) + CONTAINER_INSET);
  const r = CONTAINER_TAB_RADIUS;
  const left = box.x;
  const right = box.x + width;
  const top = box.y;
  const bottom = box.y + CONTAINER_TITLE_HEIGHT;
  return `M ${left} ${bottom} L ${left} ${top + r} A ${r} ${r} 0 0 1 ${left + r} ${top} L ${right - r} ${top} A ${r} ${r} 0 0 1 ${right} ${top + r} L ${right} ${bottom} Z`;
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

/** Open arrow: 10 long, 7 half-width. */
const ARROW_LENGTH = 10;
const ARROW_HALF_WIDTH = 7;
/** Hollow triangle: 12 long, 12 half-width. */
const TRIANGLE_LENGTH = 12;
const TRIANGLE_HALF_WIDTH = 12;
/** Diamond: 14 long, 9 half-width. */
const DIAMOND_LENGTH = 14;
const DIAMOND_HALF_WIDTH = 9;

export interface EdgeMarker {
  /** Path data for the marker outline, in absolute document coordinates. */
  path: string;
  /** Fill for the path: the line colour for a filled diamond, the background for hollow shapes, `none` for an open arrow. */
  fill: "line" | "background" | "none";
  /** How far the line must stop short of the endpoint so it does not poke through the marker. */
  inset: number;
  /** True for realization and dependency. */
  dashed: boolean;
}

/** Dash pattern of a realization or dependency line, for both surfaces. */
export const EDGE_DASH = "6 4";

/** Realization and dependency are drawn on a dashed line; a directed association is solid. */
export function relationIsDashed(relation: RelationKind): boolean {
  return relation === "realization" || relation === "dependency";
}

/**
 * Which end of the edge carries the marker: the parent, interface or whole of
 * generalization, realization, composition and aggregation is the source, the
 * arrow of a dependency or directed association points at the target, and a plain association has none.
 */
export function markerEnd(relation: RelationKind): "source" | "target" | null {
  if (relation === "association") return null;
  return relation === "dependency" || relation === "directed-association" ? "target" : "source";
}

/** Text for one end of a relation; a cardinality that was not stated renders nothing. */
export function cardinalityLabel(cardinality: Cardinality | null): string {
  return cardinality ?? "";
}

/**
 * The marker at one end of a relation. `point` is the endpoint on the box
 * border and `towards` the other end of the edge: the tip sits on `point` and
 * the base lies back along the line. Canvas and exporter both draw this.
 */
export function edgeMarker(relation: RelationKind, point: Point, towards: Point): EdgeMarker | null {
  if (relation === "association") return null;

  const dx = towards.x - point.x;
  const dy = towards.y - point.y;
  const length = Math.hypot(dx, dy) || 1;
  // Unit vector from the tip back along the line, and its left normal.
  const backX = dx / length;
  const backY = dy / length;
  const sideX = -backY;
  const sideY = backX;

  const at = (along: number, across: number): string =>
    `${roundPoint(point.x + backX * along + sideX * across)} ${roundPoint(point.y + backY * along + sideY * across)}`;
  const tip = `M ${roundPoint(point.x)} ${roundPoint(point.y)}`;
  const dashed = relationIsDashed(relation);

  if (relation === "dependency" || relation === "directed-association") {
    return {
      path: `${tip} L ${at(ARROW_LENGTH, ARROW_HALF_WIDTH)} M ${roundPoint(point.x)} ${roundPoint(point.y)} L ${at(ARROW_LENGTH, -ARROW_HALF_WIDTH)}`,
      fill: "none",
      inset: 0,
      dashed,
    };
  }

  if (relation === "composition" || relation === "aggregation") {
    return {
      path: `${tip} L ${at(DIAMOND_LENGTH / 2, DIAMOND_HALF_WIDTH)} L ${at(DIAMOND_LENGTH, 0)} L ${at(DIAMOND_LENGTH / 2, -DIAMOND_HALF_WIDTH)} Z`,
      fill: relation === "composition" ? "line" : "background",
      inset: DIAMOND_LENGTH,
      dashed,
    };
  }

  return {
    path: `${tip} L ${at(TRIANGLE_LENGTH, TRIANGLE_HALF_WIDTH)} L ${at(TRIANGLE_LENGTH, -TRIANGLE_HALF_WIDTH)} Z`,
    fill: "background",
    inset: TRIANGLE_LENGTH,
    dashed,
  };
}

/**
 * Bounding box of every node, expanded by `padding`, used by the exporter.
 * Dispatches on `kind` so each family is measured by its own function.
 */
export function bounds(diagram: Diagram, padding = 40): Rect {
  if (diagram.nodes.length === 0) {
    return { x: 0, y: 0, width: padding * 2, height: padding * 2 };
  }

  const boxes: { node: { x: number; y: number }; size: Size }[] = isStateDiagram(diagram)
    ? diagram.nodes.map((node) => ({ node, size: measureState(node) }))
    : diagram.nodes.map((node: BoxNode) => {
        if (!isContainer(node)) return { node, size: measureBox(node, diagram.kind) };
        const rect = containerBox(diagram, node);
        return { node: rect, size: rect };
      });

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const { node, size } of boxes) {
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
