import { validate } from "./model.ts";
import type { Diagram, DiagramEdge, DiagramField, DiagramNode, Result } from "./types.ts";
import { err, isDiagramKind, isVisibility, normalizeCardinality, ok } from "./types.ts";

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

function readNode(value: unknown): DiagramNode | null {
  if (!isRecord(value)) return null;
  const { id, name, x, y, fields } = value;
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
  return { id, name, x, y, fields: parsedFields };
}

function readEdge(value: unknown): Result<DiagramEdge> {
  if (!isRecord(value)) return err("A relation is not an object");
  const { id, source, target, sourceCardinality, targetCardinality, label } = value;
  if (typeof id !== "string" || typeof source !== "string" || typeof target !== "string") {
    return err("A relation is missing its id, source or target");
  }
  if (typeof sourceCardinality !== "string") {
    return err(`The relation "${id}" has no source cardinality`);
  }
  if (typeof targetCardinality !== "string") {
    return err(`The relation "${id}" has no target cardinality`);
  }
  const from = normalizeCardinality(sourceCardinality);
  if (!from) {
    return err(
      `The relation "${id}" has an unknown source cardinality "${sourceCardinality}" (expected 1, 0..1, 1..*, 0..* or *)`,
    );
  }
  const to = normalizeCardinality(targetCardinality);
  if (!to) {
    return err(
      `The relation "${id}" has an unknown target cardinality "${targetCardinality}" (expected 1, 0..1, 1..*, 0..* or *)`,
    );
  }
  if (typeof label !== "string") return err(`The relation "${id}" has no label`);
  return ok({ id, source, target, sourceCardinality: from, targetCardinality: to, label });
}

/** Deep runtime validation of anything claiming to be a diagram. */
export function readDiagram(value: unknown): Result<Diagram> {
  if (!isRecord(value)) return err("The diagram is not an object");
  const { kind, title, nodes, edges, version } = value;
  if (version !== undefined && version !== FILE_VERSION) return err(`Unsupported diagram version ${String(version)}`);
  if (typeof kind !== "string" || !isDiagramKind(kind)) return err("The diagram has an unknown kind");
  if (typeof title !== "string") return err("The diagram title is missing");
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return err("The diagram has no entities or relations");

  const parsedNodes: DiagramNode[] = [];
  for (const node of nodes) {
    const parsed = readNode(node);
    if (!parsed) return err("The diagram contains an invalid entity");
    parsedNodes.push(parsed);
  }

  const parsedEdges: DiagramEdge[] = [];
  for (const edge of edges) {
    const parsed = readEdge(edge);
    if (!parsed.ok) return err(parsed.error);
    parsedEdges.push(parsed.value);
  }

  return validate({ version: FILE_VERSION, kind, title, nodes: parsedNodes, edges: parsedEdges });
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
