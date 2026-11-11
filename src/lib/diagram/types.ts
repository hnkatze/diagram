/**
 * The diagram model is the single source of truth for the whole app.
 * The canvas and the text DSL are both projections of this structure.
 */

/** Every family the model knows about. */
export type DiagramKind = "er" | "uml-class" | "state";

/** The two class families: nodes carry fields, edges carry cardinalities. */
export type ClassDiagramKind = "er" | "uml-class";

export type Visibility = "+" | "-" | "#";

export type Cardinality = "1" | "0..1" | "1..*" | "0..*";

export type StateRole = "state" | "initial" | "final";

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

/** An entity or class box. */
export interface ErNode {
  /** Stable slug of `name`; collisions get a `-2`, `-3` suffix. */
  id: string;
  name: string;
  x: number;
  y: number;
  fields: DiagramField[];
}

/** A relation between two class nodes, with a cardinality on each end. */
export interface RelationEdge {
  id: string;
  /** Id of the source node. */
  source: string;
  /** Id of the target node. */
  target: string;
  sourceCardinality: Cardinality;
  targetCardinality: Cardinality;
  label: string;
}

/** A state or pseudo-state of a state machine. */
export interface StateNode {
  id: string;
  /** Empty for the `initial` and `final` pseudo-states. */
  name: string;
  x: number;
  y: number;
  role: StateRole;
}

/** A state transition. The label is free text, stored verbatim. */
export interface Transition {
  id: string;
  /** Id of the source state. */
  source: string;
  /** Id of the target state. */
  target: string;
  label: string;
}

/**
 * A diagram of one family. The union is discriminated by `kind` on purpose:
 * fields and cardinalities have no meaning for a state machine, so one flat
 * shape would make a state with fields or a transition with a cardinality
 * representable.
 */
export interface ErDiagram {
  version: typeof DIAGRAM_VERSION;
  kind: ClassDiagramKind;
  title: string;
  nodes: ErNode[];
  edges: RelationEdge[];
}

export interface StateDiagram {
  version: typeof DIAGRAM_VERSION;
  kind: "state";
  title: string;
  nodes: StateNode[];
  edges: Transition[];
}

export type Diagram = ErDiagram | StateDiagram;

/** The class families, the only ones with fields and cardinalities. */
export type ClassDiagram = ErDiagram;

/** Previous names, kept as aliases so existing callers keep their wording. */
export type DiagramNode = ErNode;
export type DiagramEdge = RelationEdge;

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
  return value === "er" || value === "uml-class" || value === "state";
}

export function isClassDiagramKind(value: string): value is ClassDiagramKind {
  return value === "er" || value === "uml-class";
}

/** Narrows the union without a cast, so class-only helpers stay class-only. */
export function isErDiagram(diagram: Diagram): diagram is ErDiagram {
  return diagram.kind !== "state";
}

export function isStateDiagram(diagram: Diagram): diagram is StateDiagram {
  return diagram.kind === "state";
}
