import { slugify, uniqueId } from "./model.ts";
import type {
  Cardinality,
  ClassDiagramKind,
  Diagram,
  DiagramField,
  ErDiagram,
  ErNode,
  RelationEdge,
  RelationKind,
  Result,
  StateDiagram,
  StateNode,
  StateRole,
  Transition,
  Visibility,
} from "./types.ts";
import { err, isStateDiagram, isVisibility, normalizeCardinality, ok } from "./types.ts";

/**
 * Text projection of the diagram model (spec S5-S7).
 *
 * The text carries structure only: no coordinates ever reach it. Positions
 * live in the model and are preserved by `mergeStructure` after a re-parse.
 */

const FLAGS = ["pk", "fk", "uk", "nullable"] as const;

const BARE_NAME = /^[A-Za-z0-9_]+$/;

const BARE_TYPE = /^[^\s"]+$/;

class DslError extends Error {
  line: number;

  constructor(line: number, message: string) {
    super(`Line ${line}: ${message}`);
    this.line = line;
  }
}

interface Token {
  value: string;
  quoted: boolean;
}

interface EntityBlock {
  name: string;
  line: number;
  fields: DiagramField[];
}

interface StateBlock {
  name: string;
  role: StateRole;
  line: number;
}

function tokenize(text: string, line: number): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < text.length) {
    const glyph = text[index];
    if (glyph === " " || glyph === "\t") {
      index += 1;
      continue;
    }

    if (glyph === '"') {
      index += 1;
      let value = "";
      let closed = false;
      while (index < text.length) {
        if (text[index] === "\\" && index + 1 < text.length) {
          const escaped = text[index + 1];
          value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
          index += 2;
          continue;
        }
        if (text[index] === '"') {
          index += 1;
          closed = true;
          break;
        }
        value += text[index];
        index += 1;
      }
      if (!closed) throw new DslError(line, "unterminated quoted string");
      tokens.push({ value, quoted: true });
      continue;
    }

    let value = "";
    while (index < text.length && text[index] !== " " && text[index] !== "\t") {
      value += text[index];
      index += 1;
    }
    tokens.push({ value, quoted: false });
  }

  return tokens;
}

function isFlag(value: string): value is (typeof FLAGS)[number] {
  return (FLAGS as readonly string[]).includes(value);
}

function parseField(text: string, line: number): DiagramField {
  const tokens = tokenize(text, line);
  let cursor = 0;
  let visibility: Visibility = "+";

  if (tokens[0] && !tokens[0].quoted && isVisibility(tokens[0].value)) {
    visibility = tokens[0].value;
    cursor = 1;
  }

  const nameToken = tokens[cursor];
  if (!nameToken) throw new DslError(line, "a field needs a name");
  const name = nameToken.value;
  cursor += 1;

  let type = "";
  const flags = { pk: false, fk: false, uk: false, nullable: false };

  for (const token of tokens.slice(cursor)) {
    if (!token.quoted && isFlag(token.value)) {
      flags[token.value] = true;
      continue;
    }
    if (type === "") {
      type = token.value;
      continue;
    }
    throw new DslError(line, `unexpected "${token.value}" in the field "${name}"`);
  }

  return { name, type, visibility, ...flags };
}

function formatBareName(name: string): string {
  return BARE_NAME.test(name) ? name : `"${escapeQuoted(name)}"`;
}

function formatType(type: string): string {
  if (type === "") return "";
  return BARE_TYPE.test(type) ? ` ${type}` : ` "${escapeQuoted(type)}"`;
}

function escapeQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Arrow tokens of the arrow form. `--` is a plain association and `-->` a directed
 * one (navigability), which UML treats as a different relation.
 */
const ARROW_RELATIONS: ReadonlyMap<string, RelationKind> = new Map([
  ["--", "association"],
  ["-->", "directed-association"],
  ["<|--", "generalization"],
  ["<..", "realization"],
  ["*--", "composition"],
  ["o--", "aggregation"],
  ["..>", "dependency"],
]);

/** The one arrow token written for each relation kind. */
const RELATION_ARROWS: Record<RelationKind, string> = {
  association: "--",
  "directed-association": "-->",
  generalization: "<|--",
  realization: "<..",
  composition: "*--",
  aggregation: "o--",
  dependency: "..>",
};

function parseErDiagram(text: string): ErDiagram {
  const lines = text.split(/\r?\n/);
  let kind: ClassDiagramKind = "er";
  let title = "";
  let open: EntityBlock | null = null;
  const blocks: EntityBlock[] = [];
  const relations: { line: number; tokens: Token[] }[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = index + 1;
    const trimmed = lines[index].trim();
    if (trimmed === "") continue;

    if (open) {
      if (trimmed === "}") {
        blocks.push(open);
        open = null;
        continue;
      }
      // Inside an entity `#` is the protected-visibility glyph, so only `//` comments out.
      if (trimmed.startsWith("//")) continue;
      open.fields.push(parseField(trimmed, line));
      continue;
    }

    if (trimmed.startsWith("#") || trimmed.startsWith("//")) continue;

    if (trimmed === "}") throw new DslError(line, 'unexpected "}"');

    const tokens = tokenize(trimmed, line);
    const head = tokens[0].value.toLowerCase();

    if (head === "diagram") {
      const kindToken = tokens[1];
      if (!kindToken) throw new DslError(line, 'expected a diagram kind after "diagram"');
      const kindText = kindToken.value.toLowerCase();
      if (kindText === "er") kind = "er";
      else if (kindText === "uml" || kindText === "uml-class") kind = "uml-class";
      else throw new DslError(line, `unknown diagram kind "${kindToken.value}"`);
      title = tokens[2] ? tokens[2].value : "";
      if (tokens.length > 3) throw new DslError(line, "unexpected text after the diagram title");
      continue;
    }

    if (head === "entity") {
      const nameToken = tokens[1];
      if (!nameToken) throw new DslError(line, 'expected an entity name after "entity"');
      const brace = tokens[2];
      if (!brace || brace.quoted || brace.value !== "{") {
        throw new DslError(line, 'expected "{" after the entity name');
      }
      if (tokens.length > 3) throw new DslError(line, 'unexpected text after "{"');
      open = { name: nameToken.value, line, fields: [] };
      continue;
    }

    relations.push({ line, tokens });
  }

  if (open) throw new DslError(open.line, `entity "${open.name}" is never closed`);

  const takenIds: string[] = [];
  const takenSlugs = new Set<string>();
  const nodes: ErNode[] = [];
  const byReference = new Map<string, ErNode>();

  for (const block of blocks) {
    const name = block.name.trim();
    if (name === "") throw new DslError(block.line, "an entity needs a name");
    const slug = slugify(name);
    if (takenSlugs.has(slug)) throw new DslError(block.line, `entity "${name}" already exists`);
    takenSlugs.add(slug);
    const id = uniqueId(slug, takenIds);
    takenIds.push(id);
    const node: ErNode = { id, name, x: 0, y: 0, fields: block.fields };
    nodes.push(node);
    byReference.set(name, node);
    byReference.set(name.toLowerCase(), node);
    byReference.set(slug, node);
  }

  const resolve = (token: Token, line: number): ErNode => {
    const found =
      byReference.get(token.value) ??
      byReference.get(token.value.toLowerCase()) ??
      byReference.get(slugify(token.value));
    if (!found) throw new DslError(line, `unknown relation endpoint "${token.value}"`);
    return found;
  };

  const edges: RelationEdge[] = [];
  const takenEdgeIds: string[] = [];

  for (const relation of relations) {
    const { line, tokens } = relation;
    const arrow = tokens.length >= 3 && !tokens[1].quoted ? ARROW_RELATIONS.get(tokens[1].value) : undefined;
    let kindOfRelation: RelationKind = "association";
    let fromCard: Cardinality | null = null;
    let toCard: Cardinality | null = null;
    let from: Token;
    let to: Token;
    let rest: Token[];

    if (arrow) {
      kindOfRelation = arrow;
      from = tokens[0];
      to = tokens[2];
      rest = tokens.slice(3);
    } else {
      // Not an arrow: either the ER shape, or a token that is neither.
      const looksLikeEr = tokens.length >= 3 && normalizeCardinality(tokens[1].value) !== null;
      if (tokens.length < 3 || (tokens.length < 5 && looksLikeEr)) {
        throw new DslError(line, 'a relation needs the shape "<from> <cardinality> -- <cardinality> <to>"');
      }
      if (tokens.length < 5 || (!looksLikeEr && tokens[2].value !== "--")) {
        throw new DslError(
          line,
          `unknown relation arrow "${tokens[1].value}" (expected ${[...ARROW_RELATIONS.keys()].join(", ")} or "<cardinality> -- <cardinality>")`,
        );
      }
      const [first, sourceCardinality, dash, targetCardinality, last] = tokens;
      if (dash.quoted || dash.value !== "--") {
        throw new DslError(line, 'expected "--" between the two cardinalities');
      }
      fromCard = normalizeCardinality(sourceCardinality.value);
      if (!fromCard) {
        throw new DslError(line, `unknown cardinality "${sourceCardinality.value}"`);
      }
      toCard = normalizeCardinality(targetCardinality.value);
      if (!toCard) {
        throw new DslError(line, `unknown cardinality "${targetCardinality.value}"`);
      }
      from = first;
      to = last;
      rest = tokens.slice(5);
    }

    const source = resolve(from, line);
    const target = resolve(to, line);

    let label = "";
    if (rest.length > 0) {
      if (!rest[0].quoted && rest[0].value === ":") rest.shift();
      label = rest.map((token) => token.value).join(" ");
    }

    const id = uniqueId(`${source.id}->${target.id}`, takenEdgeIds);
    takenEdgeIds.push(id);
    edges.push({
      id,
      source: source.id,
      target: target.id,
      relation: kindOfRelation,
      sourceCardinality: fromCard,
      targetCardinality: toCard,
      label,
    });
  }

  return { version: 1, kind, title, nodes, edges };
}

/**
 * The kind named by the `diagram` header decides the family, so one header
 * selects one grammar. A missing header keeps the historical default (`er`).
 */
function familyOf(text: string): "state" | "er" {
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed === "" || trimmed.startsWith("//") || trimmed.startsWith("#")) continue;

    const tokens = tokenize(trimmed, index + 1);
    if (tokens[0].quoted || tokens[0].value.toLowerCase() !== "diagram") return "er";

    const kindToken = tokens[1];
    if (!kindToken) return "er";
    return kindToken.value.toLowerCase() === "state" ? "state" : "er";
  }

  return "er";
}

/** Ids the pseudo-states own, so a state may never shadow them. */
const RESERVED_STATE_SLUGS = ["initial", "final"] as const;

function pseudoBase(role: StateRole): string {
  return role === "initial" ? "initial" : "final";
}

function parseStateDiagram(text: string): StateDiagram {
  const lines = text.split(/\r?\n/);
  let title = "";
  const declared: StateBlock[] = [];
  const transitions: { line: number; tokens: Token[] }[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = index + 1;
    const trimmed = lines[index].trim();
    if (trimmed === "") continue;
    // `#` is not a comment here: only `//` comments out in the state grammar.
    if (trimmed.startsWith("//")) continue;

    const tokens = tokenize(trimmed, line);
    const headToken = tokens[0];
    const head = headToken.quoted ? "" : headToken.value.toLowerCase();
    const arrow = tokens.findIndex((token) => !token.quoted && token.value === "-->");

    if (arrow !== -1) {
      if (arrow !== 1 || !tokens[2]) {
        throw new DslError(line, 'a transition needs the shape "<from> --> <to>"');
      }
      transitions.push({ line, tokens });
      continue;
    }

    if (head === "diagram") {
      const kindToken = tokens[1];
      if (!kindToken) throw new DslError(line, 'expected a diagram kind after "diagram"');
      if (kindToken.value.toLowerCase() !== "state") {
        throw new DslError(line, `unknown diagram kind "${kindToken.value}"`);
      }
      title = tokens[2] ? tokens[2].value : "";
      if (tokens.length > 3) throw new DslError(line, "unexpected text after the diagram title");
      continue;
    }

    if (head === "initial" || head === "final") {
      if (tokens.length > 1) throw new DslError(line, `unexpected text after "${head}"`);
      if (head === "initial" && declared.some((block) => block.role === "initial")) {
        throw new DslError(line, "only one initial state is allowed");
      }
      declared.push({ name: "", role: head, line });
      continue;
    }

    if (head === "state") {
      const nameToken = tokens[1];
      if (!nameToken) throw new DslError(line, 'expected a state name after "state"');
      const name = nameToken.value.trim();
      if (name === "") throw new DslError(line, "a state needs a name");
      if (tokens.length > 2) throw new DslError(line, `unexpected "${tokens[2].value}" after the state name`);
      declared.push({ name, role: "state", line });
      continue;
    }

    throw new DslError(line, `unknown statement "${headToken.value}"`);
  }

  const takenIds: string[] = [];
  const byReference = new Map<string, StateNode>();
  const pseudoNodes: StateNode[] = [];
  const stateNodes: StateNode[] = [];
  const takenSlugs = new Set<string>();

  // Pseudo-states first: their ids are fixed (`initial`, `final`, `final-2`...),
  // so every other id and reference derives from a stable base.
  for (const block of declared) {
    if (block.role === "state") continue;
    const id = uniqueId(pseudoBase(block.role), takenIds);
    takenIds.push(id);
    const node: StateNode = { id, name: "", x: 0, y: 0, role: block.role };
    pseudoNodes.push(node);
    byReference.set(id, node);
  }

  for (const block of declared) {
    if (block.role !== "state") continue;
    const slug = slugify(block.name);
    if ((RESERVED_STATE_SLUGS as readonly string[]).includes(slug)) {
      throw new DslError(block.line, `"${block.name}" is reserved for the ${slug} pseudo-state`);
    }
    if (takenSlugs.has(slug)) throw new DslError(block.line, `state "${block.name}" already exists`);
    takenSlugs.add(slug);
    const id = uniqueId(slug, takenIds);
    takenIds.push(id);
    const node: StateNode = { id, name: block.name, x: 0, y: 0, role: "state" };
    stateNodes.push(node);
    byReference.set(block.name, node);
    byReference.set(block.name.toLowerCase(), node);
    byReference.set(slug, node);
  }

  const resolve = (token: Token, line: number): StateNode => {
    const found =
      byReference.get(token.value) ??
      byReference.get(token.value.toLowerCase()) ??
      byReference.get(slugify(token.value));
    if (!found) throw new DslError(line, `unknown state "${token.value}"`);
    return found;
  };

  const edges: Transition[] = [];
  const takenEdgeIds: string[] = [];

  for (const transition of transitions) {
    const { line, tokens } = transition;
    const arrow = tokens.findIndex((token) => !token.quoted && token.value === "-->");
    const from = tokens[arrow - 1];
    const to = tokens[arrow + 1];
    if (!from || !to) throw new DslError(line, 'a transition needs the shape "<from> --> <to>"');

    const source = resolve(from, line);
    const target = resolve(to, line);

    const rest = tokens.slice(arrow + 2);
    if (rest.length > 0 && !rest[0].quoted && rest[0].value === ":") rest.shift();
    const label = rest.map((token) => token.value).join(" ");

    const id = uniqueId(`${source.id}->${target.id}`, takenEdgeIds);
    takenEdgeIds.push(id);
    edges.push({ id, source: source.id, target: target.id, label });
  }

  return { version: 1, kind: "state", title, nodes: [...pseudoNodes, ...stateNodes], edges };
}

/** Parses DSL text. Every failure is returned, never thrown. */
export function parse(text: string): Result<Diagram> {
  try {
    return ok(familyOf(text) === "state" ? parseStateDiagram(text) : parseErDiagram(text));
  } catch (error) {
    if (error instanceof DslError) return err(error.message);
    throw error;
  }
}

function serializeField(field: DiagramField, kind: ClassDiagramKind): string {
  const glyph = kind === "uml-class" ? `${field.visibility} ` : "";
  const flags = [
    field.pk ? "pk" : "",
    field.fk ? "fk" : "",
    field.uk ? "uk" : "",
    field.nullable ? "nullable" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const suffix = flags ? ` ${flags}` : "";
  return `${glyph}${formatBareName(field.name)}${formatType(field.type)}${suffix}`;
}

/** Serializes the structure of a diagram. Coordinates are never emitted. */
export function serialize(diagram: Diagram): string {
  return isStateDiagram(diagram) ? serializeState(diagram) : serializeEr(diagram);
}

function serializeEr(diagram: ErDiagram): string {
  const blocks: string[] = [
    `diagram ${diagram.kind === "uml-class" ? "uml" : "er"} "${escapeQuoted(diagram.title)}"`,
  ];

  for (const node of diagram.nodes) {
    const rows = node.fields.map((field) => `  ${serializeField(field, diagram.kind)}`);
    blocks.push(`entity ${formatBareName(node.name)} {\n${rows.join("\n")}\n}`);
  }

  const nameOf = (id: string): string => diagram.nodes.find((node) => node.id === id)?.name ?? id;

  for (const edge of diagram.edges) {
    const label = edge.label === "" ? "" : ` : "${escapeQuoted(edge.label)}"`;
    const from = formatBareName(nameOf(edge.source));
    const to = formatBareName(nameOf(edge.target));
    // The ER idiom states both ends; anything else is written with its arrow.
    const middle =
      edge.relation === "association" && edge.sourceCardinality !== null && edge.targetCardinality !== null
        ? `${edge.sourceCardinality} -- ${edge.targetCardinality}`
        : RELATION_ARROWS[edge.relation];
    blocks.push(`${from} ${middle} ${to}${label}`);
  }

  return `${blocks.join("\n\n")}\n`;
}

/**
 * State diagrams keep their own order: the pseudo-states first in model order,
 * then the states, then the transitions. A parser round trip must not depend on
 * where a declaration happened to appear in the previous text.
 */
function serializeState(diagram: StateDiagram): string {
  const blocks: string[] = [`diagram state "${escapeQuoted(diagram.title)}"`];

  const pseudoLines = diagram.nodes
    .filter((node) => node.role !== "state")
    .map((node) => node.role);
  const stateLines = diagram.nodes
    .filter((node) => node.role === "state")
    .map((node) => `state ${formatBareName(node.name)}`);
  const nodeLines = [...pseudoLines, ...stateLines];
  if (nodeLines.length > 0) blocks.push(nodeLines.join("\n"));

  const nodeOf = (id: string): StateNode | undefined => diagram.nodes.find((node) => node.id === id);
  const referenceTo = (id: string): string => {
    const node = nodeOf(id);
    if (!node) return id;
    // Pseudo-states are referenced by id; real states by name.
    return node.role === "state" ? formatBareName(node.name) : node.id;
  };

  if (diagram.edges.length > 0) {
    blocks.push(
      diagram.edges
        .map((edge) => {
          const label = edge.label === "" ? "" : ` : "${escapeQuoted(edge.label)}"`;
          return `${referenceTo(edge.source)} --> ${referenceTo(edge.target)}${label}`;
        })
        .join("\n"),
    );
  }

  return `${blocks.join("\n\n")}\n`;
}
