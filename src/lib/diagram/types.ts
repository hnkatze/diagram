/**
 * The diagram model is the single source of truth for the whole app.
 * The canvas and the text DSL are both projections of this structure.
 */

export type DiagramKind = "er" | "uml-class";

export type Visibility = "+" | "-" | "#";

export type Cardinality = "1" | "0..1" | "1..*" | "0..*";

export interface DiagramField {
  name: string;
  type: string;
  /** UML visibility glyph. Rendered only for `uml-class` diagrams. */
  visibility: Visibility;
  pk: boolean;
  fk: boolean;
  uk: boolean;
  nullable: boolean;
}

export interface DiagramNode {
  /** Stable slug of `name`; collisions get a `-2`, `-3` suffix. */
  id: string;
  name: string;
  x: number;
  y: number;
  fields: DiagramField[];
}

export interface DiagramEdge {
  id: string;
  /** Id of the source node. */
  source: string;
  /** Id of the target node. */
  target: string;
  sourceCardinality: Cardinality;
  targetCardinality: Cardinality;
  label: string;
}

export interface Diagram {
  version: typeof DIAGRAM_VERSION;
  kind: DiagramKind;
  title: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

/** Success/failure for operations that can legitimately be refused. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const DIAGRAM_VERSION = 1 as const;

export const CARDINALITIES: readonly Cardinality[] = ["1", "0..1", "1..*", "0..*"];

export const VISIBILITIES: readonly Visibility[] = ["+", "-", "#"];

export const DEFAULT_CARDINALITY: Cardinality = "1..*";

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const err = <T>(error: string): Result<T> => ({ ok: false, error });

export function isCardinality(value: string): value is Cardinality {
  return (CARDINALITIES as readonly string[]).includes(value);
}

/**
 * Normalisation for anything coming from outside the model: a file or typed
 * text. `*` is standard UML shorthand for "many" and is read as `0..*`, so a
 * single shorthand never rejects an otherwise valid file. The model itself only
 * ever stores the four canonical values.
 */
export function normalizeCardinality(value: string): Cardinality | null {
  const trimmed = value.trim();
  if (trimmed === "*") return "0..*";
  return isCardinality(trimmed) ? trimmed : null;
}

export function isVisibility(value: string): value is Visibility {
  return (VISIBILITIES as readonly string[]).includes(value);
}

export function isDiagramKind(value: string): value is DiagramKind {
  return value === "er" || value === "uml-class";
}
