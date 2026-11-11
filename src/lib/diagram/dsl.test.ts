import test from "node:test";
import assert from "node:assert/strict";

import { parse, serialize } from "./dsl.ts";
import { moveNode } from "./model.ts";
import type { ErDiagram } from "./types.ts";

const SAMPLE = `diagram er "Tienda"

entity Usuario {
  id int pk
  email text uk nullable
  nombre text
}

entity Pedido {
  id int pk
  usuario_id int fk
  total decimal
}

Usuario 1..* -- 0..1 Pedido : "realiza"
`;

function mustParse(text: string): ErDiagram {
  const result = parse(text);
  if (!result.ok) throw new Error(`expected a diagram, got: ${result.error}`);
  return result.value;
}

function mustFail(text: string): string {
  const result = parse(text);
  if (result.ok) throw new Error("expected a parse error");
  return result.error;
}

test("parses the documented sample into the expected structure", () => {
  const diagram = mustParse(SAMPLE);

  assert.equal(diagram.kind, "er");
  assert.equal(diagram.title, "Tienda");
  assert.deepEqual(
    diagram.nodes.map((node) => [node.id, node.name, node.x, node.y]),
    [
      ["usuario", "Usuario", 0, 0],
      ["pedido", "Pedido", 0, 0],
    ],
  );
  assert.deepEqual(diagram.nodes[0].fields[1], {
    name: "email",
    type: "text",
    visibility: "+",
    pk: false,
    fk: false,
    uk: true,
    nullable: true,
  });
  assert.deepEqual(diagram.edges, [
    {
      id: "usuario->pedido",
      source: "usuario",
      target: "pedido",
      sourceCardinality: "1..*",
      targetCardinality: "0..1",
      label: "realiza",
    },
  ]);
});

test("serialize then parse then serialize is stable", () => {
  const first = serialize(mustParse(SAMPLE));
  const second = serialize(mustParse(first));
  assert.equal(second, first);
  assert.match(first, /^diagram er "Tienda"/);
});

test("every flag combination round trips independently", () => {
  const text = `entity Clave {
  a int pk
  b int fk
  c int uk
  d int nullable
  e int pk fk uk nullable
  f text
}`;
  const fields = mustParse(text).nodes[0].fields;
  assert.deepEqual(
    fields.map((field) => [field.pk, field.fk, field.uk, field.nullable]),
    [
      [true, false, false, false],
      [false, true, false, false],
      [false, false, true, false],
      [false, false, false, true],
      [true, true, true, true],
      [false, false, false, false],
    ],
  );
  assert.equal(serialize(mustParse(serialize(mustParse(text)))), serialize(mustParse(text)));
});

test("quoted names with spaces survive the round trip", () => {
  const text = `entity "Linea Pedido" {
  id int pk
}

"Linea Pedido" 1..* -- 1 Pedido : "pertenece a"

entity Pedido {
  id int pk
}`;
  const diagram = mustParse(text);
  assert.equal(diagram.nodes[0].name, "Linea Pedido");
  assert.equal(diagram.nodes[0].id, "linea-pedido");
  assert.equal(diagram.edges[0].label, "pertenece a");
  assert.equal(serialize(mustParse(serialize(diagram))), serialize(diagram));
});

test("escaped quotes are unescaped on parse and escaped on serialize", () => {
  const diagram = mustParse(`diagram uml "Tienda \\"central\\""

entity A {
  id int pk
}

A 1 -- 1 A : "dice \\"hola\\""`);
  assert.equal(diagram.title, 'Tienda "central"');
  assert.equal(diagram.edges[0].label, 'dice "hola"');
  const text = serialize(diagram);
  assert.match(text, /diagram uml "Tienda \\"central\\""/);
  assert.match(text, /: "dice \\"hola\\""/);
  assert.equal(mustParse(text).title, 'Tienda "central"');
});

test("line comments are ignored inside and outside entities", () => {
  const diagram = mustParse(`# diagram comment
// another comment
entity A {
  // field comment
  id int pk
}

A 1 -- 1 A`);
  assert.equal(diagram.nodes[0].fields.length, 1);
  assert.equal(diagram.edges.length, 1);
});

test("the protected visibility glyph survives inside an entity", () => {
  const diagram = mustParse('diagram uml "Modelo"\n\nentity A {\n  # password_hash text\n  + id int pk\n}');
  assert.deepEqual(
    diagram.nodes[0].fields.map((field) => [field.visibility, field.name]),
    [
      ["#", "password_hash"],
      ["+", "id"],
    ],
  );
  assert.match(serialize(diagram), /# password_hash text/);
  assert.equal(
    serialize(mustParse(serialize(diagram))),
    serialize(diagram),
  );
});

test("the diagram line is optional and defaults to an empty er diagram", () => {
  const empty = mustParse("");
  assert.deepEqual(empty, { version: 1, kind: "er", title: "", nodes: [], edges: [] });
  assert.equal(mustParse("   \n\n").nodes.length, 0);

  const withoutHeader = mustParse("entity A {\n  id int pk\n}");
  assert.equal(withoutHeader.kind, "er");
  assert.equal(withoutHeader.title, "");
});

test("uml is accepted as the class diagram kind and serialized back as uml", () => {
  const diagram = mustParse('diagram uml "Modelo"');
  assert.equal(diagram.kind, "uml-class");
  assert.match(serialize(diagram), /^diagram uml "Modelo"/);
  assert.equal(mustParse('diagram uml-class ""').kind, "uml-class");
});

test("positions never reach the text", () => {
  const diagram = mustParse(SAMPLE);
  const moved = moveNode(moveNode(diagram, "usuario", 400, 300), "pedido", 10, 20);
  assert.equal(serialize(moved), serialize(diagram));
});

test("an unknown relation endpoint is an error with its line number", () => {
  const error = mustFail("entity A {\n  id int pk\n}\n\nA 1 -- 1 Fantasma");
  assert.equal(error, 'Line 5: unknown relation endpoint "Fantasma"');
});

test("a duplicated entity is an error", () => {
  const error = mustFail("entity Usuario {\n}\n\nentity usuario {\n}");
  assert.match(error, /^Line 4: entity "usuario" already exists$/);
});

test("an unknown field flag is an error", () => {
  const error = mustFail("entity A {\n  id int primary\n}");
  assert.equal(error, 'Line 2: unexpected "primary" in the field "id"');
});

test("an unterminated entity is an error pointing at its opening line", () => {
  const error = mustFail("entity A {\n  id int pk\n");
  assert.equal(error, 'Line 1: entity "A" is never closed');
});

test("a missing brace after the entity name is an error", () => {
  assert.match(mustFail("entity A"), /expected "\{" after the entity name/);
});

test("an unknown cardinality is an error", () => {
  const error = mustFail("entity A {\n}\n\nA muchos -- 1 A");
  assert.equal(error, 'Line 4: unknown cardinality "muchos"');
});

test("the UML * shorthand parses as 0..* and serializes canonically", () => {
  const diagram = mustParse("entity A {\n}\n\nentity B {\n}\n\nA * -- 1 B");
  assert.equal(diagram.edges[0].sourceCardinality, "0..*");
  assert.equal(diagram.edges[0].targetCardinality, "1");
  assert.match(serialize(diagram), /A 0\.\.\* -- 1 B/);
});

test("repeated relations between the same pair get distinct ids", () => {
  const diagram = mustParse("entity A {\n}\n\nA 1 -- 1 A\nA 1 -- 1 A");
  assert.equal(diagram.edges.length, 2);
  assert.notEqual(diagram.edges[0].id, diagram.edges[1].id);
});

test("a field may omit its type", () => {
  const field = mustParse("entity A {\n  nombre\n}").nodes[0].fields[0];
  assert.deepEqual(field, {
    name: "nombre",
    type: "",
    visibility: "+",
    pk: false,
    fk: false,
    uk: false,
    nullable: false,
  });
});

test("garbage never throws, it returns an error", () => {
  assert.equal(parse('entity "unterminated {').ok, false);
  assert.equal(parse("}").ok, false);
  assert.equal(parse('diagram sideway ""').ok, false);
});
