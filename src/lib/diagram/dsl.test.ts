import test from "node:test";
import assert from "node:assert/strict";

import { parse, serialize } from "./dsl.ts";
import { moveNode } from "./model.ts";
import type { ErDiagram, RelationKind, StateDiagram } from "./types.ts";
import { RELATION_KINDS } from "./types.ts";
import { isErDiagram, isStateDiagram } from "./types.ts";

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
  if (!isErDiagram(result.value)) throw new Error(`expected a class diagram, got ${result.value.kind}`);
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
      relation: "association",
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

const STATE_SAMPLE = `diagram state "Ciclo del pedido"

initial
state Nuevo
state Pagado
final

Nuevo --> Pagado : "pagar [monto > 0] / emitir recibo"
Pagado --> Pagado : "reintentar"
Pagado --> final
`;

function mustParseState(text: string): StateDiagram {
  const result = parse(text);
  if (!result.ok) throw new Error(`expected a diagram, got: ${result.error}`);
  if (!isStateDiagram(result.value)) throw new Error(`expected a state diagram, got ${result.value.kind}`);
  return result.value;
}

test("the documented state sample parses into the expected structure", () => {
  const diagram = mustParseState(STATE_SAMPLE);

  assert.equal(diagram.kind, "state");
  assert.equal(diagram.title, "Ciclo del pedido");
  assert.deepEqual(
    diagram.nodes.map((node) => [node.id, node.name, node.role, node.x, node.y]),
    [
      ["initial", "", "initial", 0, 0],
      ["final", "", "final", 0, 0],
      ["nuevo", "Nuevo", "state", 0, 0],
      ["pagado", "Pagado", "state", 0, 0],
    ],
  );
  assert.deepEqual(diagram.edges, [
    { id: "nuevo->pagado", source: "nuevo", target: "pagado", label: "pagar [monto > 0] / emitir recibo" },
    { id: "pagado->pagado", source: "pagado", target: "pagado", label: "reintentar" },
    { id: "pagado->final", source: "pagado", target: "final", label: "" },
  ]);
});

test("the state sample serializes twice to the same bytes and rebuilds the same structure", () => {
  const first = serialize(mustParseState(STATE_SAMPLE));
  const second = serialize(mustParseState(first));

  assert.equal(second, first);
  assert.match(first, /^diagram state "Ciclo del pedido"/);
  assert.deepEqual(mustParseState(first), mustParseState(STATE_SAMPLE));
});

test("initial and final parse without any state", () => {
  const diagram = mustParseState('diagram state "Solo pseudos"\n\ninitial\nfinal');

  assert.deepEqual(
    diagram.nodes.map((node) => [node.id, node.role]),
    [
      ["initial", "initial"],
      ["final", "final"],
    ],
  );
  assert.equal(diagram.edges.length, 0);
});

test("a second initial declaration is an error with its line number", () => {
  assert.equal(
    mustFail('diagram state "X"\n\ninitial\ninitial'),
    "Line 4: only one initial state is allowed",
  );
});

test("a duplicated state name is an error with its line number", () => {
  assert.equal(
    mustFail('diagram state "X"\n\nstate Nuevo\nstate Nuevo'),
    'Line 4: state "Nuevo" already exists',
  );
});

test("an unknown transition endpoint is an error with its line number", () => {
  assert.equal(
    mustFail('diagram state "X"\n\nstate Nuevo\nNuevo --> Fantasma'),
    'Line 4: unknown state "Fantasma"',
  );
});

test("a self transition parses into a loop", () => {
  const diagram = mustParseState('diagram state "X"\n\nstate Pagado\nPagado --> Pagado : "reintentar"');

  assert.deepEqual(diagram.edges, [
    { id: "pagado->pagado", source: "pagado", target: "pagado", label: "reintentar" },
  ]);
});

test("repeated final pseudo-states get distinct ids", () => {
  const diagram = mustParseState('diagram state "X"\n\nstate A\nfinal\nfinal');

  assert.deepEqual(
    diagram.nodes.filter((node) => node.role === "final").map((node) => node.id),
    ["final", "final-2"],
  );
  assert.equal(serialize(mustParseState(serialize(diagram))), serialize(diagram));
});

test("a transition without a label serializes without the colon", () => {
  const diagram = mustParseState('diagram state "X"\n\nstate A\nstate B\nA --> B');
  const text = serialize(diagram);

  assert.equal(diagram.edges[0].label, "");
  assert.match(text, /A --> B$/m);
  assert.doesNotMatch(text, /A --> B :/);
  assert.equal(mustParseState(text).edges[0].label, "");
});

test("headerless ER text still defaults to er and round trips identically", () => {
  const diagram = mustParse("entity A {\n  id int pk\n}\n\nentity B {\n}\n\nA 1 -- 1 B");

  assert.equal(diagram.kind, "er");
  const text = serialize(diagram);
  assert.match(text, /^diagram er ""/);
  assert.equal(serialize(mustParse(text)), text);
});

const ARROWS: [string, RelationKind][] = [
  ["--", "association"],
  ["-->", "directed-association"],
  ["<|--", "generalization"],
  ["<..", "realization"],
  ["*--", "composition"],
  ["o--", "aggregation"],
  ["..>", "dependency"],
];

const ARROW_HEADER = "diagram uml \"X\"\n\nentity A {\n}\n\nentity B {\n}\n\n";

for (const [token, relation] of ARROWS) {
  test(`the arrow ${token} parses to a ${relation} relation`, () => {
    const diagram = mustParse(`${ARROW_HEADER}A ${token} B`);

    assert.equal(diagram.edges.length, 1);
    assert.equal(diagram.edges[0].relation, relation);
    assert.equal(diagram.edges[0].source, "a");
    assert.equal(diagram.edges[0].target, "b");
  });
}

test("an arrow relation states no cardinality and keeps its label", () => {
  const diagram = mustParse(`${ARROW_HEADER}A <|-- B : "es un"`);

  assert.equal(diagram.edges[0].sourceCardinality, null);
  assert.equal(diagram.edges[0].targetCardinality, null);
  assert.equal(diagram.edges[0].label, "es un");
});

test("an ER relation is an association with both cardinalities", () => {
  const diagram = mustParse(`${ARROW_HEADER}A 1 -- 0..* B`);

  assert.equal(diagram.edges[0].relation, "association");
  assert.equal(diagram.edges[0].sourceCardinality, "1");
  assert.equal(diagram.edges[0].targetCardinality, "0..*");
});

test("arrows round trip through serialize for every relation kind", () => {
  for (const relation of RELATION_KINDS) {
    const token = ARROWS.find(([, kind]) => kind === relation)?.[0] ?? "--";
    const first = mustParse(`${ARROW_HEADER}A ${token} B : "x"`);
    const text = serialize(first);
    const second = mustParse(text);

    assert.deepEqual(second, first, relation);
    assert.equal(second.edges[0].relation, relation);
    assert.equal(serialize(second), text, relation);
  }
});

test("each relation kind serializes with its own arrow", () => {
  const diagram = mustParse(`${ARROW_HEADER}A --> B\nA <|-- B\nA <.. B\nA *-- B\nA o-- B\nA ..> B`);
  const text = serialize(diagram);

  for (const token of ["A --> B", "A <|-- B", "A <.. B", "A *-- B", "A o-- B", "A ..> B"]) {
    assert.ok(text.includes(token), token);
  }
});

test("an unknown arrow token is an error that names the token", () => {
  const error = mustFail(`${ARROW_HEADER}A ==> B`);

  assert.match(error, /^Line 9: /);
  assert.ok(error.includes('"==>"'), error);
  assert.ok(error.includes("<|--"), error);
});

test("a relation line with fewer than three tokens still fails with a named error", () => {
  assert.match(mustFail(`${ARROW_HEADER}A B`), /a relation needs the shape/);
});

test("an existing ER document parses and serializes to the same text", () => {
  const text = serialize(mustParse(SAMPLE));

  assert.match(text, /Usuario 1\.\.\* -- 0\.\.1 Pedido : "realiza"/);
  assert.equal(serialize(mustParse(text)), text);
  assert.equal(mustParse(text).edges[0].relation, "association");
});

test("-- stays a plain association and --> is a different relation", () => {
  const plain = mustParse(`${ARROW_HEADER}A -- B`).edges[0];
  const directed = mustParse(`${ARROW_HEADER}A --> B`).edges[0];

  assert.equal(plain.relation, "association");
  assert.equal(directed.relation, "directed-association");
  assert.ok(serialize(mustParse(`${ARROW_HEADER}A -- B`)).includes("A -- B"));
  assert.ok(!serialize(mustParse(`${ARROW_HEADER}A -- B`)).includes("-->"));
});

test("an association with one cardinality cannot be written, and the stable form round trips", () => {
  const diagram = mustParse(`${ARROW_HEADER}A -- B`);
  const first = serialize(diagram);

  assert.deepEqual(mustParse(first), diagram);
  assert.equal(serialize(mustParse(first)), first);
});

const CONTAINERS = `diagram uml "Ventas"

package Ventas {
  entity Pedido {
    id int pk
    total decimal
  }
  entity Item {
    id int pk
  }
}

package Logistica {
  entity Envio {
    id int pk
  }
}

Pedido 1..* -- 1 Item : "contiene"
`;

test("an entity inside a package belongs to it", () => {
  const diagram = mustParse("package X { }\n".replace("{ }", "{\n  entity A {\n  }\n}"));
  const container = diagram.nodes.find((node) => node.name === "X");
  const child = diagram.nodes.find((node) => node.name === "A");
  assert.equal(container?.role, "package");
  assert.equal(container?.parentId, null);
  assert.deepEqual(container?.fields, []);
  assert.equal(child?.role, "entity");
  assert.equal(child?.parentId, container?.id);
});

test("a region opens a container of role region", () => {
  const diagram = mustParse("region X {\n  entity A {\n  }\n}\n");
  assert.equal(diagram.nodes.find((node) => node.name === "X")?.role, "region");
  assert.equal(diagram.nodes.find((node) => node.name === "A")?.parentId, "x");
});

test("containers round trip with two-space indentation", () => {
  const diagram = mustParse(CONTAINERS);
  const text = serialize(diagram);
  assert.match(text, /^package Ventas \{$/m);
  assert.match(text, /^ {2}entity Pedido \{$/m);
  assert.match(text, /^ {4}[+] id int pk$/m);
  const again = mustParse(text);
  const shape = (d: ErDiagram) => d.nodes.map((node) => [node.id, node.role, node.parentId]);
  assert.deepEqual(shape(again), shape(diagram));
  assert.deepEqual(again.nodes.map((node) => node.id), ["ventas", "pedido", "item", "logistica", "envio"]);
  assert.deepEqual(again.edges, diagram.edges);
  assert.equal(again.edges.length, 1);
  assert.equal(serialize(again), text);
});

test("a container inside a container names both", () => {
  const error = mustFail("package A {\n  package B {\n  }\n}\n");
  assert.match(error, /^Line 2:/);
  assert.match(error, /"A"/);
  assert.match(error, /"B"/);
});

test("a field line directly inside a container names the container", () => {
  const error = mustFail("package Ventas {\n  id int pk\n}\n");
  assert.match(error, /^Line 2:/);
  assert.match(error, /"Ventas"/);
});

test("a relation resolves entities that live in two different containers", () => {
  const diagram = mustParse(`package P {
  entity A {
  }
}
package Q {
  entity B {
  }
}
A 1 -- 1..* B
`);
  assert.equal(diagram.edges.length, 1);
  assert.equal(diagram.edges[0].source, "a");
  assert.equal(diagram.edges[0].target, "b");
});

test("a container and an entity with the same name get distinct ids; unclosed blocks name the block", () => {
  const diagram = mustParse("package A {\n  entity A {\n  }\n}\n");
  assert.deepEqual(diagram.nodes.map((node) => node.id), ["a", "a-2"]);
  assert.match(mustFail("package Ventas {\n  entity A {\n  }\n"), /package "Ventas" is never closed/);
});
