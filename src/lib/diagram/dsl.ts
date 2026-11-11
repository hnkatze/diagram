import { slugify, uniqueId } from "./model.ts";
import type {
  Diagram,
  DiagramEdge,
  DiagramField,
  DiagramKind,
  DiagramNode,
  Result,
  Visibility,
} from "./types.ts";
import { err, isVisibility, normalizeCardinality, ok } from "./types.ts";

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

function parseOrThrow(text: string): Diagram {
  const lines = text.split(/\r?\n/);
  let kind: DiagramKind = "er";
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
  const nodes: DiagramNode[] = [];
  const byReference = new Map<string, DiagramNode>();

  for (const block of blocks) {
    const name = block.name.trim();
    if (name === "") throw new DslError(block.line, "an entity needs a name");
    const slug = slugify(name);
    if (takenSlugs.has(slug)) throw new DslError(block.line, `entity "${name}" already exists`);
    takenSlugs.add(slug);
    const id = uniqueId(slug, takenIds);
    takenIds.push(id);
    const node: DiagramNode = { id, name, x: 0, y: 0, fields: block.fields };
    nodes.push(node);
    byReference.set(name, node);
    byReference.set(name.toLowerCase(), node);
    byReference.set(slug, node);
  }

  const resolve = (token: Token, line: number): DiagramNode => {
    const found =
      byReference.get(token.value) ??
      byReference.get(token.value.toLowerCase()) ??
      byReference.get(slugify(token.value));
    if (!found) throw new DslError(line, `unknown relation endpoint "${token.value}"`);
    return found;
  };

  const edges: DiagramEdge[] = [];
  const takenEdgeIds: string[] = [];

  for (const relation of relations) {
    const { line, tokens } = relation;
    if (tokens.length < 5) {
      throw new DslError(line, 'a relation needs the shape "<from> <cardinality> -- <cardinality> <to>"');
    }
    const [from, sourceCardinality, dash, targetCardinality, to] = tokens;
    if (dash.quoted || dash.value !== "--") {
      throw new DslError(line, 'expected "--" between the two cardinalities');
    }
    const fromCard = normalizeCardinality(sourceCardinality.value);
    if (!fromCard) {
      throw new DslError(line, `unknown cardinality "${sourceCardinality.value}"`);
    }
    const toCard = normalizeCardinality(targetCardinality.value);
    if (!toCard) {
      throw new DslError(line, `unknown cardinality "${targetCardinality.value}"`);
    }

    const source = resolve(from, line);
    const target = resolve(to, line);

    const rest = tokens.slice(5);
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
      sourceCardinality: fromCard,
      targetCardinality: toCard,
      label,
    });
  }

  return { version: 1, kind, title, nodes, edges };
}

/** Parses DSL text. Every failure is returned, never thrown. */
export function parse(text: string): Result<Diagram> {
  try {
    return ok(parseOrThrow(text));
  } catch (error) {
    if (error instanceof DslError) return err(error.message);
    throw error;
  }
}

function serializeField(field: DiagramField, kind: DiagramKind): string {
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
    blocks.push(
      `${formatBareName(nameOf(edge.source))} ${edge.sourceCardinality} -- ${edge.targetCardinality} ${formatBareName(nameOf(edge.target))}${label}`,
    );
  }

  return `${blocks.join("\n\n")}\n`;
}
