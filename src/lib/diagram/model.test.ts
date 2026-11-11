import test from "node:test";
import assert from "node:assert/strict";

import { parse, serialize } from "./dsl.ts";
import {
  addEdge,
  addField,
  addNode,
  createDiagram,
  createField,
  deleteEdge,
  deleteField,
  deleteNode,
  mergeStructure,
  moveNode,
  renameNode,
  slugify,
  uniqueId,
  updateEdge,
  updateField,
  validate,
} from "./model.ts";
import type { ErDiagram } from "./types.ts";

/** Usuario -> Pedido with one field each, the base fixture for the operations below. */
function fixture(): ErDiagram {
  const user = addNode(createDiagram("er", "Tienda"), "Usuario");
  assert.equal(user.ok, true);
  if (!user.ok) throw new Error("unreachable");
  const order = addNode(user.value, "Pedido");
  assert.equal(order.ok, true);
  if (!order.ok) throw new Error("unreachable");
  const linked = addEdge(order.value, "usuario", "pedido", { label: "realiza" });
  assert.equal(linked.ok, true);
  if (!linked.ok) throw new Error("unreachable");
  return linked.value;
}

test("slugify produces lowercase dashed ids", () => {
  assert.equal(slugify("Usuario"), "usuario");
  assert.equal(slugify("Pedido Detalle"), "pedido-detalle");
  assert.equal(slugify("Añadir"), "anadir");
  assert.equal(slugify("  Total  "), "total");
  assert.equal(slugify("***"), "entity");
});

test("uniqueId suffixes duplicates in order", () => {
  assert.equal(uniqueId("usuario", []), "usuario");
  assert.equal(uniqueId("usuario", ["usuario"]), "usuario-2");
  assert.equal(uniqueId("usuario", ["usuario", "usuario-2"]), "usuario-3");
});

test("createDiagram starts empty with the requested kind and title", () => {
  assert.deepEqual(createDiagram("uml-class", "Tienda"), {
    version: 1,
    kind: "uml-class",
    title: "Tienda",
    nodes: [],
    edges: [],
  });
});

test("addNode derives the id from the name and accepts a position", () => {
  const added = addNode(createDiagram("er", ""), "Linea Pedido", { x: 40, y: 80 });
  assert.equal(added.ok, true);
  if (!added.ok) return;
  assert.equal(added.value.nodes[0].id, "linea-pedido");
  assert.equal(added.value.nodes[0].x, 40);
  assert.equal(added.value.nodes[0].y, 80);
});

test("addNode refuses a name that collides with an existing entity", () => {
  const added = addNode(fixture(), "usuario");
  assert.equal(added.ok, false);
  if (added.ok) return;
  assert.match(added.error, /already exists/i);
});

test("renameNode renames the id and remaps relation endpoints", () => {
  const renamed = renameNode(fixture(), "usuario", "Cliente");
  assert.equal(renamed.ok, true);
  if (!renamed.ok) return;
  const node = renamed.value.nodes.find((n) => n.name === "Cliente");
  assert.ok(node);
  assert.equal(node.id, "cliente");
  assert.equal(renamed.value.edges[0].source, "cliente");
  assert.equal(renamed.value.edges[0].target, "pedido");
});

test("renameNode refuses a name already used by another entity", () => {
  const renamed = renameNode(fixture(), "usuario", "Pedido");
  assert.equal(renamed.ok, false);
  if (renamed.ok) return;
  assert.match(renamed.error, /already exists/i);
});

test("deleteNode also removes the relations that touched it", () => {
  const after = deleteNode(fixture(), "pedido");
  assert.equal(after.nodes.length, 1);
  assert.equal(after.edges.length, 0);
});

test("fields keep every flag independent when updated", () => {
  const withField = addField(fixture(), "usuario", createField({ name: "id", type: "int", pk: true }));
  const doubly = updateField(withField, "usuario", 0, { fk: true });
  const field = doubly.nodes[0].fields[0];
  assert.equal(field.pk, true);
  assert.equal(field.fk, true);
  assert.equal(field.uk, false);
  assert.equal(field.nullable, false);
});

test("addField appends in order and deleteField removes by index", () => {
  let diagram = addField(fixture(), "usuario", createField({ name: "a" }));
  diagram = addField(diagram, "usuario", createField({ name: "b" }));
  assert.deepEqual(diagram.nodes[0].fields.map((f) => f.name), ["a", "b"]);
  diagram = deleteField(diagram, "usuario", 0);
  assert.deepEqual(diagram.nodes[0].fields.map((f) => f.name), ["b"]);
});

test("createField defaults to a public, optional-free, untyped field", () => {
  assert.deepEqual(createField(), {
    name: "campo",
    type: "text",
    visibility: "+",
    pk: false,
    fk: false,
    uk: false,
    nullable: false,
  });
});

test("moveNode only changes the position", () => {
  const moved = moveNode(fixture(), "usuario", 120, 240);
  assert.equal(moved.nodes[0].x, 120);
  assert.equal(moved.nodes[0].y, 240);
  assert.deepEqual(moved.nodes[0].fields, fixture().nodes[0].fields);
});

test("addEdge refuses an endpoint that does not exist", () => {
  const added = addEdge(fixture(), "usuario", "fantasma");
  assert.equal(added.ok, false);
  if (added.ok) return;
  assert.match(added.error, /unknown/i);
});

test("addEdge allows a self relation and gives repeated pairs distinct ids", () => {
  const self = addEdge(fixture(), "usuario", "usuario", { label: "delega" });
  assert.equal(self.ok, true);
  if (!self.ok) return;
  assert.equal(self.value.edges.length, 2);
  assert.notEqual(self.value.edges[0].id, self.value.edges[1].id);
  assert.equal(self.value.edges[1].source, "usuario");
  assert.equal(self.value.edges[1].target, "usuario");
});

test("updateEdge and deleteEdge work by edge id", () => {
  const diagram = fixture();
  const id = diagram.edges[0].id;
  const updated = updateEdge(diagram, id, { label: "compra", targetCardinality: "0..*" });
  assert.equal(updated.edges[0].label, "compra");
  assert.equal(updated.edges[0].targetCardinality, "0..*");
  assert.equal(deleteEdge(updated, id).edges.length, 0);
});

test("validate accepts a well formed diagram and reports the broken reason", () => {
  assert.equal(validate(fixture()).ok, true);

  const dangling = fixture();
  dangling.edges[0].target = "fantasma";
  const danglingResult = validate(dangling);
  assert.equal(danglingResult.ok, false);
  if (danglingResult.ok) return;
  assert.match(danglingResult.error, /unknown entity/i);

  const badCardinality = fixture();
  Object.assign(badCardinality.edges[0], { sourceCardinality: "muchos" });
  const badResult = validate(badCardinality);
  assert.equal(badResult.ok, false);
  if (badResult.ok) return;
  assert.match(badResult.error, /cardinality/i);
});

test("mergeStructure keeps known positions and stacks the new entities", () => {
  const previous = moveNode(moveNode(fixture(), "usuario", 100, 100), "pedido", 400, 100);

  const parsed: ErDiagram = {
    ...previous,
    nodes: [
      { ...previous.nodes[0], x: 0, y: 0 },
      { ...previous.nodes[1], x: 0, y: 0 },
      { id: "producto", name: "Producto", x: 0, y: 0, fields: [] },
    ],
  };

  const { diagram, addedIds } = mergeStructure(parsed, previous);
  const usuario = diagram.nodes.find((n) => n.id === "usuario");
  const pedido = diagram.nodes.find((n) => n.id === "pedido");
  const producto = diagram.nodes.find((n) => n.id === "producto");

  assert.deepEqual([usuario?.x, usuario?.y], [100, 100]);
  assert.deepEqual([pedido?.x, pedido?.y], [400, 100]);
  assert.deepEqual(addedIds, ["producto"]);
  assert.ok((producto?.y ?? 0) > 100, "the new entity lands below the existing ones");
});

test("a cardinality is stated on both ends of a relation or on neither", () => {
  const base = fixture();
  const id = base.edges[0].id;
  const cleared = updateEdge(base, id, { sourceCardinality: null });
  assert.equal(cleared.edges[0].sourceCardinality, null);
  assert.equal(cleared.edges[0].targetCardinality, null);

  const filled = updateEdge(cleared, id, { targetCardinality: "0..*" });
  assert.equal(filled.edges[0].targetCardinality, "0..*");
  assert.notEqual(filled.edges[0].sourceCardinality, null);

  const one = addEdge(base, "usuario", "pedido", { sourceCardinality: "1", targetCardinality: null });
  assert.equal(one.ok, true);
  if (!one.ok) return;
  const added = one.value.edges[one.value.edges.length - 1];
  assert.equal(added.sourceCardinality, null);
  assert.equal(added.targetCardinality, null);
});

test("validate refuses a relation with a single cardinality", () => {
  const base = fixture();
  const mixed = { ...base, edges: [{ ...base.edges[0], sourceCardinality: "1" as const, targetCardinality: null }] };
  const result = validate(mixed);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.error.includes(base.edges[0].id), result.error);
});

test("a relation whose cardinalities were cleared survives serialize and parse", () => {
  const base = fixture();
  const cleared = updateEdge(base, base.edges[0].id, { targetCardinality: null });
  const parsed = parse(serialize(cleared));

  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind === "state") return;
  assert.equal(parsed.value.edges[0].sourceCardinality, null);
  assert.equal(parsed.value.edges[0].targetCardinality, null);
  assert.equal(serialize(parsed.value), serialize(cleared));
});
