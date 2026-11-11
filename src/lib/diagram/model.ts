import { bounds, measureBox } from "./measure.ts";
import type {
  Cardinality,
  ClassDiagramKind,
  DiagramField,
  ErDiagram,
  ErNode,
  GlyphDiagram,
  GlyphEdge,
  GlyphNode,
  GlyphRole,
  Point,
  RelationEdge,
  RelationKind,
  Result,
} from "./types.ts";
import {
  DEFAULT_CARDINALITY,
  GLYPH_RELATIONS,
  GLYPH_ROLES,
  err,
  isCardinality,
  isContainerRole,
  isGlyphDiagram,
  isRelationKind,
  ok,
} from "./types.ts";

/** The families whose nodes can nest in containers; the generic helpers below accept both. */
export type NestedDiagram = ErDiagram | GlyphDiagram;

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

export function createDiagram(kind: ClassDiagramKind = "er", title = ""): ErDiagram {
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

export function findNode<T extends NestedDiagram>(diagram: T, id: string): T["nodes"][number] | undefined {
  return (diagram.nodes as T["nodes"][number][]).find((node) => node.id === id);
}

function nameTaken(diagram: NestedDiagram, name: string, exceptId?: string): boolean {
  const slug = slugify(name);
  return diagram.nodes.some((node) => node.id !== exceptId && slugify(node.name) === slug);
}

/** The role a new node takes on the canvas, one per glyph kind. */
const NEW_GLYPH_ROLE: Record<GlyphDiagram["kind"], GlyphRole> = {
  "use-case": "usecase",
  component: "component",
  communication: "object",
};

/** A class-family node is an entity with no fields; a glyph node takes the default role of its kind. */
export function addNode<T extends NestedDiagram>(diagram: T, name: string, position: Point = { x: 0, y: 0 }): Result<T> {
  const trimmed = name.trim();
  if (!trimmed) return err("Entity name is empty");
  if (nameTaken(diagram, trimmed)) return err(`Entity "${trimmed}" already exists`);
  const id = uniqueId(slugify(trimmed), diagram.nodes.map((node) => node.id));
  const placed = { id, name: trimmed, x: position.x, y: position.y, parentId: null };
  if (isGlyphDiagram(diagram)) {
    const node: GlyphNode = { ...placed, role: NEW_GLYPH_ROLE[diagram.kind] };
    return ok({ ...diagram, nodes: [...diagram.nodes, node] } as T);
  }
  const node: ErNode = { ...placed, fields: [], role: "entity" };
  return ok({ ...diagram, nodes: [...(diagram as ErDiagram).nodes, node] } as T);
}

/** Renaming rewrites the id, so every relation endpoint follows. */
export function renameNode<T extends NestedDiagram>(diagram: T, id: string, name: string): Result<T> {
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
  const nodes = (diagram.nodes as NestedDiagram["nodes"]).map((node) =>
    node.id === id ? { ...node, id: nextId, name: trimmed } : node,
  );
  const edges = (diagram.edges as NestedDiagram["edges"]).map((edge) => ({
    ...edge,
    source: edge.source === id ? nextId : edge.source,
    target: edge.target === id ? nextId : edge.target,
  }));
  return ok({ ...diagram, nodes, edges } as T);
}

export function deleteNode<T extends NestedDiagram>(diagram: T, id: string): T {
  return {
    ...diagram,
    nodes: (diagram.nodes as NestedDiagram["nodes"]).filter((node) => node.id !== id),
    edges: (diagram.edges as NestedDiagram["edges"]).filter((edge) => edge.source !== id && edge.target !== id),
  } as T;
}

export function moveNode<T extends NestedDiagram>(diagram: T, id: string, x: number, y: number): T {
  return {
    ...diagram,
    nodes: (diagram.nodes as NestedDiagram["nodes"]).map((node) => (node.id === id ? { ...node, x, y } : node)),
  } as T;
}

function withNodeFields(
  diagram: ErDiagram,
  nodeId: string,
  update: (fields: DiagramField[]) => DiagramField[],
): ErDiagram {
  if (!findNode(diagram, nodeId)) return diagram;
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) =>
      node.id === nodeId ? { ...node, fields: update(node.fields) } : node,
    ),
  };
}

export function addField(diagram: ErDiagram, nodeId: string, field: DiagramField = createField()): ErDiagram {
  return withNodeFields(diagram, nodeId, (fields) => [...fields, field]);
}

export function updateField(
  diagram: ErDiagram,
  nodeId: string,
  index: number,
  patch: Partial<DiagramField>,
): ErDiagram {
  return withNodeFields(diagram, nodeId, (fields) =>
    fields.map((field, position) => (position === index ? { ...field, ...patch } : field)),
  );
}

export function deleteField(diagram: ErDiagram, nodeId: string, index: number): ErDiagram {
  return withNodeFields(diagram, nodeId, (fields) => fields.filter((_, position) => position !== index));
}

export interface EdgeOptions {
  label?: string;
  relation?: RelationKind;
  sourceCardinality?: Cardinality | null;
  targetCardinality?: Cardinality | null;
}

export function addEdge<T extends NestedDiagram>(
  diagram: T,
  source: string,
  target: string,
  options: EdgeOptions = {},
): Result<T> {
  if (!findNode(diagram, source)) return err(`Relation from unknown entity "${source}"`);
  if (!findNode(diagram, target)) return err(`Relation to unknown entity "${target}"`);
  const id = uniqueId(`${source}->${target}`, (diagram.edges as NestedDiagram["edges"]).map((edge) => edge.id));
  if (isGlyphDiagram(diagram)) {
    const relation = options.relation ?? "association";
    if (!GLYPH_RELATIONS[diagram.kind].includes(relation)) {
      return err(`Relation "${id}" is a ${relation}, which a ${diagram.kind} diagram does not accept`);
    }
    const edge: GlyphEdge = { id, source, target, relation, label: options.label ?? "" };
    return ok({ ...diagram, edges: [...diagram.edges, edge] } as T);
  }
  const edge: RelationEdge = {
    id,
    source,
    target,
    relation: options.relation ?? "association",
    ...bothOrNone(options.sourceCardinality, options.targetCardinality),
    label: options.label ?? "",
  };
  return ok({ ...diagram, edges: [...(diagram as ErDiagram).edges, edge] } as T);
}

/**
 * A relation states a cardinality on both ends or on neither. `null` clears both,
 * and a value on one end fills the other with the default instead of leaving it empty.
 */
function bothOrNone(
  source: Cardinality | null | undefined,
  target: Cardinality | null | undefined,
): Pick<RelationEdge, "sourceCardinality" | "targetCardinality"> {
  if (source === null || target === null) return { sourceCardinality: null, targetCardinality: null };
  return { sourceCardinality: source ?? DEFAULT_CARDINALITY, targetCardinality: target ?? DEFAULT_CARDINALITY };
}

export function updateEdge(diagram: ErDiagram, edgeId: string, patch: Partial<RelationEdge>): ErDiagram {
  const touchesCardinality = "sourceCardinality" in patch || "targetCardinality" in patch;
  return {
    ...diagram,
    edges: diagram.edges.map((edge) => {
      if (edge.id !== edgeId) return edge;
      const merged = { ...edge, ...patch };
      if (!touchesCardinality) return merged;
      // Only a `null` in the patch clears the relation; a `null` already stored is just "not stated yet".
      const cleared = patch.sourceCardinality === null || patch.targetCardinality === null;
      return {
        ...merged,
        ...(cleared
          ? bothOrNone(null, null)
          : bothOrNone(merged.sourceCardinality ?? undefined, merged.targetCardinality ?? undefined)),
      };
    }),
  };
}

export function deleteEdge<T extends NestedDiagram>(diagram: T, edgeId: string): T {
  return { ...diagram, edges: (diagram.edges as NestedDiagram["edges"]).filter((edge) => edge.id !== edgeId) } as T;
}

export function setKind(diagram: ErDiagram, kind: ClassDiagramKind): ErDiagram {
  return { ...diagram, kind };
}

export function setTitle<T extends NestedDiagram>(diagram: T, title: string): T {
  return { ...diagram, title };
}

/** Structural consistency check, used before accepting parsed text or imported JSON. */
export function validate<T extends NestedDiagram>(diagram: T): Result<T> {
  const checked = isGlyphDiagram(diagram) ? validateGlyph(diagram) : validateClass(diagram as ErDiagram);
  return checked.ok ? ok(diagram) : checked;
}

/** Glyph family: a role from the kind's table, flat containers, relations between real nodes. */
function validateGlyph(diagram: GlyphDiagram): Result<GlyphDiagram> {
  const ids = new Set<string>();
  const names = new Set<string>();
  const roles: readonly string[] = GLYPH_ROLES[diagram.kind];

  for (const node of diagram.nodes) {
    if (!node.name.trim()) return err(`Node "${node.id}" has an empty name`);
    if (ids.has(node.id)) return err(`Duplicated node id "${node.id}"`);
    if (!isContainerRole(node.role) && !roles.includes(node.role)) {
      return err(
        `Node "${node.name}" has role "${node.role}", which a ${diagram.kind} diagram does not accept (expected ${roles.join(", ")})`,
      );
    }
    const slug = `${isContainerRole(node.role) ? "container" : "node"}:${slugify(node.name)}`;
    if (names.has(slug)) return err(`Node "${node.name}" is duplicated`);
    ids.add(node.id);
    names.add(slug);
  }

  const containers = new Set(diagram.nodes.filter((node) => isContainerRole(node.role)).map((node) => node.id));
  for (const node of diagram.nodes) {
    if (node.parentId === null) continue;
    if (!containers.has(node.parentId)) {
      return err(`Node "${node.id}" has parentId "${node.parentId}", which is not a container`);
    }
    if (isContainerRole(node.role)) {
      return err(`Container "${node.id}" cannot sit inside container "${node.parentId}"`);
    }
  }

  const accepted: readonly string[] = GLYPH_RELATIONS[diagram.kind];
  const nodeIds = new Set(diagram.nodes.filter((node: GlyphNode) => !isContainerRole(node.role)).map((node) => node.id));
  for (const edge of diagram.edges) {
    if (!isRelationKind(edge.relation)) {
      return err(`Relation "${edge.id}" has an unknown relation "${String(edge.relation)}"`);
    }
    if (!accepted.includes(edge.relation)) {
      return err(`Relation "${edge.id}" is a ${edge.relation}, which a ${diagram.kind} diagram does not accept`);
    }
    if (!nodeIds.has(edge.source)) return err(`Relation "${edge.id}" points to unknown node "${edge.source}"`);
    if (!nodeIds.has(edge.target)) return err(`Relation "${edge.id}" points to unknown node "${edge.target}"`);
  }

  return ok(diagram);
}

function validateClass(diagram: ErDiagram): Result<ErDiagram> {
  const ids = new Set<string>();
  const names = new Set<string>();

  for (const node of diagram.nodes) {
    if (!node.name.trim()) return err(`Entity "${node.id}" has an empty name`);
    if (ids.has(node.id)) return err(`Duplicated entity id "${node.id}"`);
    // A container may share a name with an entity; its id stays distinct.
    const slug = `${isContainerRole(node.role) ? "container" : "entity"}:${slugify(node.name)}`;
    if (names.has(slug)) return err(`Entity "${node.name}" is duplicated`);
    ids.add(node.id);
    names.add(slug);

    for (const field of node.fields) {
      if (!field.name.trim()) return err(`Entity "${node.name}" has a field without a name`);
    }
  }

  const containers = new Map(diagram.nodes.filter((node) => isContainerRole(node.role)).map((node) => [node.id, node]));
  for (const node of diagram.nodes) {
    if (node.parentId === null) continue;
    if (!containers.has(node.parentId)) {
      return err(`Node "${node.id}" has parentId "${node.parentId}", which is not a container`);
    }
    if (isContainerRole(node.role)) {
      return err(`Container "${node.id}" cannot sit inside container "${node.parentId}"`);
    }
  }

  const entityIds = new Set(diagram.nodes.filter((node) => !isContainerRole(node.role)).map((node) => node.id));
  for (const edge of diagram.edges) {
    if (!isRelationKind(edge.relation)) {
      return err(`Relation "${edge.id}" has an unknown relation "${String(edge.relation)}"`);
    }
    const invalid = (cardinality: string | null): boolean => cardinality !== null && !isCardinality(cardinality);
    if (invalid(edge.sourceCardinality) || invalid(edge.targetCardinality)) {
      return err(`Relation "${edge.id}" has an invalid cardinality`);
    }
    if ((edge.sourceCardinality === null) !== (edge.targetCardinality === null)) {
      return err(`Relation "${edge.id}" states a cardinality on only one end`);
    }
    if (!entityIds.has(edge.source)) return err(`Relation "${edge.id}" points to unknown entity "${edge.source}"`);
    if (!entityIds.has(edge.target)) return err(`Relation "${edge.id}" points to unknown entity "${edge.target}"`);
  }

  return ok(diagram);
}

/**
 * Applies a re-parsed structure onto the previous one: entities that still
 * exist keep their position, brand new ones are stacked below the diagram.
 */
export function mergeStructure<T extends NestedDiagram>(
  parsed: T,
  previous: T,
): { diagram: T; addedIds: string[] } {
  const known = new Map((previous.nodes as NestedDiagram["nodes"]).map((node) => [node.id, node]));
  const addedIds = (parsed.nodes as NestedDiagram["nodes"]).filter((node) => !known.has(node.id)).map((node) => node.id);

  const box = previous.nodes.length > 0 ? bounds(previous) : { x: 0, y: 0, width: 0, height: 0 };
  let cursorY = box.y + box.height + 60;
  let cursorX = box.x;

  const nodes = (parsed.nodes as NestedDiagram["nodes"]).map((node) => {
    const previousNode = known.get(node.id);
    if (previousNode) return { ...node, x: previousNode.x, y: previousNode.y };
    const size = measureBox(node, parsed.kind);
    const placed = { ...node, x: cursorX, y: cursorY };
    cursorY += size.height + 40;
    cursorX = box.x;
    return placed;
  });

  return { diagram: { ...parsed, nodes } as T, addedIds };
}
