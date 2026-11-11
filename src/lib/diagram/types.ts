/**
 * The diagram model is the single source of truth for the whole app.
 * The canvas and the text DSL are both projections of this structure.
 */

/** Every family the model knows about. */
export type DiagramKind = "er" | "uml-class" | "state" | GlyphDiagramKind;

/** The glyph families: nodes carry a name and a drawing, edges carry no cardinality. */
export type GlyphDiagramKind = "use-case" | "component" | "communication";

/** The two class families: nodes carry fields, edges carry cardinalities. */
export type ClassDiagramKind = "er" | "uml-class";

export type Visibility = "+" | "-" | "#";

export type Cardinality = "1" | "0..1" | "1..*" | "0..*";

/** What a relation means. Only the DSL arrow and the markers tell them apart. */
export type RelationKind =
  | "association"
  | "directed-association"
  | "generalization"
  | "realization"
  | "composition"
  | "aggregation"
  | "dependency";

/**
 * What a class-family node is. An `entity` is a box with fields; `package` and
 * `region` are containers that hold other nodes and carry no fields.
 */
export type NodeRole = "entity" | "package" | "region";

export type StateRole = "state" | "initial" | "final";

/** What a glyph-family node is drawn as. Each kind declares the roles it accepts. */
export type GlyphRole = "actor" | "usecase" | "component" | "interface" | "object";

/** The roles that hold other nodes; shared by every family that nests. */
export type ContainerRole = "package" | "region";

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
  role: NodeRole;
  /** Id of the container this node sits in; `null` means top level. */
  parentId: string | null;
}

/**
 * A relation between two class nodes. A cardinality is `null` when it was not
 * stated, which is every relation written with an arrow token.
 */
export interface RelationEdge {
  id: string;
  /** Id of the source node. */
  source: string;
  /** Id of the target node. */
  target: string;
  relation: RelationKind;
  sourceCardinality: Cardinality | null;
  targetCardinality: Cardinality | null;
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

/** A node of a glyph diagram: a name, a position and a role, and nothing else. */
export interface GlyphNode {
  id: string;
  name: string;
  x: number;
  y: number;
  /** A glyph role, or a container (`package`/`region`) that holds other nodes. */
  role: GlyphRole | ContainerRole;
  /** Id of the container this node sits in; `null` means top level. */
  parentId: string | null;
}

/** A relation between two glyph nodes. It never carries a cardinality. */
export interface GlyphEdge {
  id: string;
  source: string;
  target: string;
  relation: RelationKind;
  label: string;
}

export interface GlyphDiagram {
  version: typeof DIAGRAM_VERSION;
  kind: GlyphDiagramKind;
  title: string;
  nodes: GlyphNode[];
  edges: GlyphEdge[];
}

export type Diagram = ErDiagram | StateDiagram | GlyphDiagram;

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

export const RELATION_KINDS: readonly RelationKind[] = [
  "association",
  "directed-association",
  "generalization",
  "realization",
  "composition",
  "aggregation",
  "dependency",
];

/** The roles each glyph kind declares. A role outside its kind's list is refused. */
export const GLYPH_ROLES: Record<GlyphDiagramKind, readonly GlyphRole[]> = {
  "use-case": ["actor", "usecase"],
  component: ["component", "interface"],
  communication: ["object"],
};

/** The relations each glyph kind accepts: everything but the ownership diamonds. */
export const GLYPH_RELATIONS: Record<GlyphDiagramKind, readonly RelationKind[]> = {
  "use-case": ["association", "directed-association", "generalization", "realization", "dependency"],
  component: ["association", "directed-association", "generalization", "realization", "dependency"],
  communication: ["association", "directed-association", "generalization", "realization", "dependency"],
};

export const NODE_ROLES: readonly NodeRole[] = ["entity", "package", "region"];

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

export function isRelationKind(value: string): value is RelationKind {
  return (RELATION_KINDS as readonly string[]).includes(value);
}

export function isNodeRole(value: string): value is NodeRole {
  return (NODE_ROLES as readonly string[]).includes(value);
}

/** A container is a class-family node that holds other nodes instead of fields. */
export function isContainerRole(role: NodeRole | GlyphRole | ContainerRole): role is ContainerRole {
  return role === "package" || role === "region";
}

export function isVisibility(value: string): value is Visibility {
  return (VISIBILITIES as readonly string[]).includes(value);
}

export function isDiagramKind(value: string): value is DiagramKind {
  return value === "er" || value === "uml-class" || value === "state" || isGlyphDiagramKind(value);
}

export function isGlyphDiagramKind(value: string): value is GlyphDiagramKind {
  return value === "use-case" || value === "component" || value === "communication";
}

export function isGlyphRole(value: string): value is GlyphRole {
  return value === "actor" || value === "usecase" || value === "component" || value === "interface" || value === "object";
}

export function isClassDiagramKind(value: string): value is ClassDiagramKind {
  return value === "er" || value === "uml-class";
}

/** Narrows the union without a cast, so class-only helpers stay class-only. */
export function isErDiagram(diagram: Diagram): diagram is ErDiagram {
  return isClassDiagramKind(diagram.kind);
}

export function isGlyphDiagram(diagram: Diagram): diagram is GlyphDiagram {
  return isGlyphDiagramKind(diagram.kind);
}

export function isStateDiagram(diagram: Diagram): diagram is StateDiagram {
  return diagram.kind === "state";
}
