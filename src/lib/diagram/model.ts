import { bounds, measureNode } from "./measure.ts";
import type {
  Cardinality,
  Diagram,
  DiagramEdge,
  DiagramField,
  DiagramKind,
  DiagramNode,
  Point,
  Result,
} from "./types.ts";
import { DEFAULT_CARDINALITY, err, isCardinality, ok } from "./types.ts";

/** Lowercase, dashed, accent-free id derived from an entity name. */
export function slugify(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const dashed = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return dashed || "entity";
}

/** Returns `base`, or `base-2`, `base-3`... so ids stay unique and stable. */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function createDiagram(kind: DiagramKind = "er", title = ""): Diagram {
  return { version: 1, kind, title, nodes: [], edges: [] };
}

export function createField(partial: Partial<DiagramField> = {}): DiagramField {
  return {
    name: "campo",
    type: "text",
    visibility: "+",
    pk: false,
    fk: false,
    uk: false,
    nullable: false,
    ...partial,
  };
}

export function findNode(diagram: Diagram, id: string): DiagramNode | undefined {
  return diagram.nodes.find((node) => node.id === id);
}

function nameTaken(diagram: Diagram, name: string, exceptId?: string): boolean {
  const slug = slugify(name);
  return diagram.nodes.some((node) => node.id !== exceptId && slugify(node.name) === slug);
}

export function addNode(diagram: Diagram, name: string, position: Point = { x: 0, y: 0 }): Result<Diagram> {
  const trimmed = name.trim();
  if (!trimmed) return err("Entity name is empty");
  if (nameTaken(diagram, trimmed)) return err(`Entity "${trimmed}" already exists`);
  const id = uniqueId(slugify(trimmed), diagram.nodes.map((node) => node.id));
  const node: DiagramNode = { id, name: trimmed, x: position.x, y: position.y, fields: [] };
  return ok({ ...diagram, nodes: [...diagram.nodes, node] });
}

/** Renaming rewrites the id, so every relation endpoint follows. */
export function renameNode(diagram: Diagram, id: string, name: string): Result<Diagram> {
  const target = findNode(diagram, id);
  if (!target) return err(`Unknown entity "${id}"`);
  const trimmed = name.trim();
  if (!trimmed) return err("Entity name is empty");
  if (trimmed === target.name) return ok(diagram);
  if (nameTaken(diagram, trimmed, id)) return err(`Entity "${trimmed}" already exists`);

  const nextId = uniqueId(
    slugify(trimmed),
    diagram.nodes.filter((node) => node.id !== id).map((node) => node.id),
  );
  const nodes = diagram.nodes.map((node) =>
    node.id === id ? { ...node, id: nextId, name: trimmed } : node,
  );
  const edges = diagram.edges.map((edge) => ({
    ...edge,
    source: edge.source === id ? nextId : edge.source,
    target: edge.target === id ? nextId : edge.target,
  }));
  return ok({ ...diagram, nodes, edges });
}

export function deleteNode(diagram: Diagram, id: string): Diagram {
  return {
    ...diagram,
    nodes: diagram.nodes.filter((node) => node.id !== id),
    edges: diagram.edges.filter((edge) => edge.source !== id && edge.target !== id),
  };
}

export function moveNode(diagram: Diagram, id: string, x: number, y: number): Diagram {
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => (node.id === id ? { ...node, x, y } : node)),
  };
}

function withNodeFields(
  diagram: Diagram,
  nodeId: string,
  update: (fields: DiagramField[]) => DiagramField[],
): Diagram {
  if (!findNode(diagram, nodeId)) return diagram;
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) =>
      node.id === nodeId ? { ...node, fields: update(node.fields) } : node,
    ),
  };
}

export function addField(diagram: Diagram, nodeId: string, field: DiagramField = createField()): Diagram {
  return withNodeFields(diagram, nodeId, (fields) => [...fields, field]);
}

export function updateField(
  diagram: Diagram,
  nodeId: string,
  index: number,
  patch: Partial<DiagramField>,
): Diagram {
  return withNodeFields(diagram, nodeId, (fields) =>
    fields.map((field, position) => (position === index ? { ...field, ...patch } : field)),
  );
}

export function deleteField(diagram: Diagram, nodeId: string, index: number): Diagram {
  return withNodeFields(diagram, nodeId, (fields) => fields.filter((_, position) => position !== index));
}

export interface EdgeOptions {
  label?: string;
  sourceCardinality?: Cardinality;
  targetCardinality?: Cardinality;
}

export function addEdge(diagram: Diagram, source: string, target: string, options: EdgeOptions = {}): Result<Diagram> {
  if (!findNode(diagram, source)) return err(`Relation from unknown entity "${source}"`);
  if (!findNode(diagram, target)) return err(`Relation to unknown entity "${target}"`);
  const id = uniqueId(`${source}->${target}`, diagram.edges.map((edge) => edge.id));
  const edge: DiagramEdge = {
    id,
    source,
    target,
    sourceCardinality: options.sourceCardinality ?? DEFAULT_CARDINALITY,
    targetCardinality: options.targetCardinality ?? DEFAULT_CARDINALITY,
    label: options.label ?? "",
  };
  return ok({ ...diagram, edges: [...diagram.edges, edge] });
}

export function updateEdge(diagram: Diagram, edgeId: string, patch: Partial<DiagramEdge>): Diagram {
  return {
    ...diagram,
    edges: diagram.edges.map((edge) => (edge.id === edgeId ? { ...edge, ...patch } : edge)),
  };
}

export function deleteEdge(diagram: Diagram, edgeId: string): Diagram {
  return { ...diagram, edges: diagram.edges.filter((edge) => edge.id !== edgeId) };
}

export function setKind(diagram: Diagram, kind: DiagramKind): Diagram {
  return { ...diagram, kind };
}

export function setTitle(diagram: Diagram, title: string): Diagram {
  return { ...diagram, title };
}

/** Structural consistency check, used before accepting parsed text or imported JSON. */
export function validate(diagram: Diagram): Result<Diagram> {
  const ids = new Set<string>();
  const names = new Set<string>();

  for (const node of diagram.nodes) {
    if (!node.name.trim()) return err(`Entity "${node.id}" has an empty name`);
    if (ids.has(node.id)) return err(`Duplicated entity id "${node.id}"`);
    const slug = slugify(node.name);
    if (names.has(slug)) return err(`Entity "${node.name}" is duplicated`);
    ids.add(node.id);
    names.add(slug);

    for (const field of node.fields) {
      if (!field.name.trim()) return err(`Entity "${node.name}" has a field without a name`);
    }
  }

  for (const edge of diagram.edges) {
    if (!isCardinality(edge.sourceCardinality) || !isCardinality(edge.targetCardinality)) {
      return err(`Relation "${edge.id}" has an invalid cardinality`);
    }
    if (!ids.has(edge.source)) return err(`Relation "${edge.id}" points to unknown entity "${edge.source}"`);
    if (!ids.has(edge.target)) return err(`Relation "${edge.id}" points to unknown entity "${edge.target}"`);
  }

  return ok(diagram);
}

/**
 * Applies a re-parsed structure onto the previous one: entities that still
 * exist keep their position, brand new ones are stacked below the diagram.
 */
export function mergeStructure(
  parsed: Diagram,
  previous: Diagram,
): { diagram: Diagram; addedIds: string[] } {
  const known = new Map(previous.nodes.map((node) => [node.id, node]));
  const addedIds = parsed.nodes.filter((node) => !known.has(node.id)).map((node) => node.id);

  const box = previous.nodes.length > 0 ? bounds(previous) : { x: 0, y: 0, width: 0, height: 0 };
  let cursorY = box.y + box.height + 60;
  let cursorX = box.x;

  const nodes = parsed.nodes.map((node) => {
    const previousNode = known.get(node.id);
    if (previousNode) return { ...node, x: previousNode.x, y: previousNode.y };
    const size = measureNode(node, parsed.kind);
    const placed = { ...node, x: cursorX, y: cursorY };
    cursorY += size.height + 40;
    cursorX = box.x;
    return placed;
  });

  return { diagram: { ...parsed, nodes }, addedIds };
}
