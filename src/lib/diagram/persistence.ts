import { slugify, validate } from "./model.ts";
import type {
  Cardinality,
  Diagram,
  DiagramField,
  ErDiagram,
  ErNode,
  RelationEdge,
  Result,
  StateDiagram,
  StateNode,
  StateRole,
  Transition,
} from "./types.ts";
import { NODE_ROLES, RELATION_KINDS, err, isDiagramKind, isNodeRole, isRelationKind, isVisibility, normalizeCardinality, ok } from "./types.ts";

/**
 * Persistence (spec S10): the autosaved local copy and the `.json` exchange
 * format. Everything that comes from outside the app is validated before it is
 * allowed to replace the current diagram.
 */

export const STORAGE_KEY = "diagram-editor:v1";

export const FILE_VERSION = 1;

/** The slice of `localStorage` this module needs, so it can be tested without a DOM. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function toFile(diagram: Diagram): string {
  return `${JSON.stringify({ version: FILE_VERSION, diagram }, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readField(value: unknown): DiagramField | null {
  if (!isRecord(value)) return null;
  const { name, type, visibility, pk, fk, uk, nullable } = value;
  if (typeof name !== "string" || typeof type !== "string") return null;
  if (typeof visibility !== "string" || !isVisibility(visibility)) return null;
  if (typeof pk !== "boolean" || typeof fk !== "boolean" || typeof uk !== "boolean") return null;
  if (typeof nullable !== "boolean") return null;
  return { name, type, visibility, pk, fk, uk, nullable };
}

function readNode(value: unknown): Result<ErNode> | null {
  if (!isRecord(value)) return null;
  const { id, name, x, y, fields, role, parentId } = value;
  if (typeof id !== "string" || typeof name !== "string") return null;
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  if (typeof y !== "number" || !Number.isFinite(y)) return null;
  if (!Array.isArray(fields)) return null;
  const parsedFields: DiagramField[] = [];
  for (const field of fields) {
    const parsed = readField(field);
    if (!parsed) return null;
    parsedFields.push(parsed);
  }
  // A file written before containers existed has neither: a top-level entity.
  if (role !== undefined && (typeof role !== "string" || !isNodeRole(role))) {
    return err(`The node "${id}" has an unknown role "${String(role)}" (expected ${NODE_ROLES.join(", ")})`);
  }
  if (parentId !== undefined && parentId !== null && typeof parentId !== "string") {
    return err(`The node "${id}" has an invalid parentId "${String(parentId)}"`);
  }
  return ok({ id, name, x, y, fields: parsedFields, role: role ?? "entity", parentId: parentId ?? null });
}

function readEdge(value: unknown): Result<RelationEdge> {
  if (!isRecord(value)) return err("A relation is not an object");
  const { id, source, target, relation, sourceCardinality, targetCardinality, label } = value;
  if (typeof id !== "string" || typeof source !== "string" || typeof target !== "string") {
    return err("A relation is missing its id, source or target");
  }
  // A file written before relation kinds existed has no `relation`: it is an association.
  if (relation !== undefined && (typeof relation !== "string" || !isRelationKind(relation))) {
    return err(`The relation "${id}" has an unknown relation "${String(relation)}" (expected ${RELATION_KINDS.join(", ")})`);
  }
  const from = readCardinality(id, "source", sourceCardinality);
  if (!from.ok) return from;
  const to = readCardinality(id, "target", targetCardinality);
  if (!to.ok) return to;
  if ((from.value === null) !== (to.value === null)) {
    return err(`The relation "${id}" states a cardinality on only one end`);
  }
  if (typeof label !== "string") return err(`The relation "${id}" has no label`);
  return ok({
    id,
    source,
    target,
    relation: relation ?? "association",
    sourceCardinality: from.value,
    targetCardinality: to.value,
    label,
  });
}

/** A missing or `null` cardinality was not stated, which is `null` in the model. */
function readCardinality(id: string, end: "source" | "target", value: unknown): Result<Cardinality | null> {
  if (value === undefined || value === null) return ok(null);
  if (typeof value !== "string") return err(`The relation "${id}" has no ${end} cardinality`);
  const cardinality = normalizeCardinality(value);
  if (!cardinality) {
    return err(
      `The relation "${id}" has an unknown ${end} cardinality "${value}" (expected 1, 0..1, 1..*, 0..* or *)`,
    );
  }
  return ok(cardinality);
}

/** Deep runtime validation of anything claiming to be a diagram. */
export function readDiagram(value: unknown): Result<Diagram> {
  if (!isRecord(value)) return err("The diagram is not an object");
  const { kind, title, nodes, edges, version } = value;
  if (version !== undefined && version !== FILE_VERSION) return err(`Unsupported diagram version ${String(version)}`);
  if (typeof kind !== "string" || !isDiagramKind(kind)) return err("The diagram has an unknown kind");
  if (typeof title !== "string") return err("The diagram title is missing");
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return err(kind === "state" ? "The diagram has no states or transitions" : "The diagram has no entities or relations");
  }

  return kind === "state"
    ? readStateDiagram(title, nodes, edges)
    : readErDiagram({ version: FILE_VERSION, kind, title, nodes, edges });
}

function readErDiagram(value: unknown): Result<ErDiagram> {
  if (!isRecord(value)) return err("The diagram is not an object");
  const { kind, title, nodes, edges } = value;
  if (kind !== "er" && kind !== "uml-class") return err("The diagram has an unknown kind");
  if (typeof title !== "string") return err("The diagram title is missing");
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return err("The diagram has no entities or relations");

  const parsedNodes: ErNode[] = [];
  for (const node of nodes) {
    const parsed = readNode(node);
    if (!parsed) return err("The diagram contains an invalid entity");
    if (!parsed.ok) return err(parsed.error);
    parsedNodes.push(parsed.value);
  }

  const parsedEdges: RelationEdge[] = [];
  for (const edge of edges) {
    const parsed = readEdge(edge);
    if (!parsed.ok) return err(parsed.error);
    parsedEdges.push(parsed.value);
  }

  return validate({ version: FILE_VERSION, kind, title, nodes: parsedNodes, edges: parsedEdges });
}

const STATE_ROLES: readonly StateRole[] = ["state", "initial", "final"];

function isStateRole(value: string): value is StateRole {
  return (STATE_ROLES as readonly string[]).includes(value);
}

function readStateNode(value: unknown): Result<StateNode> {
  if (!isRecord(value)) return err("A state is not an object");
  const { id, name, x, y, role } = value;
  if (typeof id !== "string" || typeof name !== "string") return err("A state is missing its id or name");
  if (typeof role !== "string" || !isStateRole(role)) {
    return err(`The state "${id}" has an unknown role "${String(role)}" (expected state, initial or final)`);
  }
  if (typeof x !== "number" || !Number.isFinite(x)) return err(`The state "${id}" has an invalid x position`);
  if (typeof y !== "number" || !Number.isFinite(y)) return err(`The state "${id}" has an invalid y position`);
  return ok({ id, name, x, y, role });
}

function readTransition(value: unknown): Result<Transition> {
  if (!isRecord(value)) return err("A transition is not an object");
  const { id, source, target, label } = value;
  if (typeof id !== "string" || typeof source !== "string" || typeof target !== "string") {
    return err("A transition is missing its id, source or target");
  }
  if (typeof label !== "string") return err(`The transition "${id}" has no label`);
  return ok({ id, source, target, label });
}

/**
 * Structural rules of a state machine, mirroring `model.validate` for the class
 * families: one initial state, unique ids and names, no dangling transition.
 */
function validateStateDiagram(diagram: StateDiagram): Result<StateDiagram> {
  const ids = new Set<string>();
  const names = new Set<string>();
  let initial = 0;

  for (const node of diagram.nodes) {
    if (ids.has(node.id)) return err(`Duplicated state id "${node.id}"`);
    ids.add(node.id);

    if (node.role === "initial") {
      initial += 1;
      if (initial > 1) return err("Only one initial state is allowed");
    }

    if (node.role !== "state") continue;
    if (!node.name.trim()) return err(`The state "${node.id}" has an empty name`);
    const slug = slugify(node.name);
    if (names.has(slug)) return err(`The state "${node.name}" is duplicated`);
    names.add(slug);
  }

  for (const edge of diagram.edges) {
    if (!ids.has(edge.source)) return err(`The transition "${edge.id}" starts at unknown state "${edge.source}"`);
    if (!ids.has(edge.target)) return err(`The transition "${edge.id}" ends at unknown state "${edge.target}"`);
  }

  return ok(diagram);
}

function readStateDiagram(title: string, nodes: unknown[], edges: unknown[]): Result<StateDiagram> {
  const parsedNodes: StateNode[] = [];
  for (const node of nodes) {
    const parsed = readStateNode(node);
    if (!parsed.ok) return err(parsed.error);
    parsedNodes.push(parsed.value);
  }

  const parsedEdges: Transition[] = [];
  for (const edge of edges) {
    const parsed = readTransition(edge);
    if (!parsed.ok) return err(parsed.error);
    parsedEdges.push(parsed.value);
  }

  return validateStateDiagram({ version: FILE_VERSION, kind: "state", title, nodes: parsedNodes, edges: parsedEdges });
}

export function fromFile(text: string): Result<Diagram> {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return err("The file is not valid JSON");
  }
  if (!isRecord(payload)) return err("The file does not contain a diagram");
  if (!("diagram" in payload)) return err("The file does not contain a diagram");
  if (payload.version !== undefined && payload.version !== FILE_VERSION) {
    return err(`Unsupported file version ${String(payload.version)}`);
  }
  return readDiagram(payload.diagram);
}

/** Restores the autosaved diagram, or `null` when absent, unreadable or corrupt. */
export function readStorage(store: KeyValueStore | null): Diagram | null {
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  const result = fromFile(raw);
  return result.ok ? result.value : null;
}

/** Saves quietly: a full quota or a disabled storage must never break the editor. */
export function writeStorage(store: KeyValueStore | null, diagram: Diagram): boolean {
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, toFile(diagram));
    return true;
  } catch {
    return false;
  }
}
