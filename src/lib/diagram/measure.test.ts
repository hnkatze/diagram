import test from "node:test";
import assert from "node:assert/strict";

import { measureNode, formatFieldLabel, bounds, estimateTextWidth } from "./measure.ts";
import type { DiagramField, DiagramNode } from "./types.ts";

const field = (over: Partial<DiagramField> = {}): DiagramField => ({
  name: "id",
  type: "int",
  visibility: "+",
  pk: false,
  fk: false,
  uk: false,
  nullable: false,
  ...over,
});

const node = (over: Partial<DiagramNode> = {}): DiagramNode => ({
  id: "usuario",
  name: "Usuario",
  x: 0,
  y: 0,
  fields: [field()],
  ...over,
});

test("estimateTextWidth grows with text and is deterministic", () => {
  const short = estimateTextWidth("id", 12, true);
  const long = estimateTextWidth("identificador", 12, true);
  assert.ok(long > short);
  assert.equal(estimateTextWidth("identificador", 12, true), long);
});

test("formatFieldLabel hides the visibility glyph for er diagrams", () => {
  assert.equal(formatFieldLabel(field({ name: "id", type: "int" }), "er"), "id : int");
  assert.equal(formatFieldLabel(field({ name: "id", type: "int" }), "uml-class"), "+ id : int");
});

test("formatFieldLabel renders every key badge independently", () => {
  assert.equal(formatFieldLabel(field({ pk: true }), "er"), "id : int PK");
  assert.equal(formatFieldLabel(field({ pk: true, fk: true }), "er"), "id : int PK FK");
  assert.equal(formatFieldLabel(field({ pk: true, fk: true, uk: true }), "er"), "id : int PK FK UK");
  assert.equal(formatFieldLabel(field({ nullable: true }), "er"), "id? : int");
});

test("measureNode keeps a node inside the minimum and maximum width", () => {
  const tiny = measureNode(node({ name: "A", fields: [] }), "er");
  assert.equal(tiny.width, 180);

  const wide = measureNode(
    node({ name: "Un Nombre Absurdamente Largo De Entidad", fields: [field({ name: "campo_con_nombre_larguisimo", type: "text" })] }),
    "er",
  );
  assert.equal(wide.width, 320);
});

test("measureNode gives an empty entity one placeholder row", () => {
  const empty = measureNode(node({ fields: [] }), "er");
  const one = measureNode(node({ fields: [field()] }), "er");
  assert.equal(empty.height, one.height);
  assert.ok(empty.height > 40);
});

test("measureNode height grows one row per field", () => {
  const one = measureNode(node({ fields: [field()] }), "er");
  const three = measureNode(node({ fields: [field(), field(), field()] }), "er");
  assert.equal(three.height - one.height, 48);
});

test("bounds wraps every node plus the padding", () => {
  const diagram = {
    version: 1 as const,
    kind: "er" as const,
    title: "",
    nodes: [
      node({ id: "a", name: "A", x: 10, y: 20, fields: [] }),
      node({ id: "b", name: "B", x: 300, y: 40, fields: [] }),
    ],
    edges: [],
  };
  const box = bounds(diagram, 20);
  assert.ok(box.x <= 10);
  assert.ok(box.y <= 20);
  assert.ok(box.x + box.width >= 300 + 180);
  assert.ok(box.y + box.height >= 40 + measureNode(node({ id: "b", name: "B", fields: [] }), "er").height);
});
