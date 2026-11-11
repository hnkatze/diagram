import test from "node:test";
import assert from "node:assert/strict";

import {
  measureNode,
  measureState,
  formatFieldLabel,
  bounds,
  estimateTextWidth,
  borderPoint,
  PSEUDO_STATE_SIZE,
  STATE_HEIGHT,
  STATE_MAX_WIDTH,
  STATE_MIN_WIDTH,
  STATE_NAME_FONT_SIZE,
  STATE_PADDING_X,
} from "./measure.ts";
import type { DiagramField, DiagramNode, StateDiagram, StateNode } from "./types.ts";

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

const stateNode = (over: Partial<StateNode> = {}): StateNode => ({
  id: "nuevo",
  name: "Nuevo",
  x: 0,
  y: 0,
  role: "state",
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

test("borderPoint leaves the box on the axis-aligned side that faces the target", () => {
  const box = { x: 0, y: 0, width: 100, height: 50 };
  assert.deepEqual(borderPoint(box, 200, 25), { x: 100, y: 25 });
  assert.deepEqual(borderPoint(box, -200, 25), { x: 0, y: 25 });
});

test("borderPoint clips a diagonal ray to the nearer of the two sides", () => {
  const box = { x: 0, y: 0, width: 100, height: 100 };
  const point = borderPoint(box, 200, 150);
  assert.equal(point.x, 100);
  assert.ok(Math.abs(point.y - 83.33) < 0.01);
});

test("borderPoint lands exactly on a corner for a corner-directed ray", () => {
  const box = { x: 0, y: 0, width: 100, height: 100 };
  assert.deepEqual(borderPoint(box, 150, 150), { x: 100, y: 100 });
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

test("measureState gives both pseudo-states one fixed square size", () => {
  const initial = measureState(stateNode({ id: "initial", role: "initial", name: "" }));
  const final = measureState(stateNode({ id: "final", role: "final", name: "" }));
  assert.deepEqual(initial, { width: PSEUDO_STATE_SIZE, height: PSEUDO_STATE_SIZE });
  assert.deepEqual(final, initial);
});

test("measureState keeps a state inside the minimum and maximum width", () => {
  const tiny = measureState(stateNode({ name: "A" }));
  assert.equal(tiny.width, STATE_MIN_WIDTH);

  const wide = measureState(stateNode({ name: "Un Nombre De Estado Absurdamente Largo De Verdad" }));
  assert.equal(wide.width, STATE_MAX_WIDTH);

  const middle = measureState(stateNode({ name: "Pedido Confirmado" }));
  assert.equal(
    middle.width,
    estimateTextWidth("Pedido Confirmado", STATE_NAME_FONT_SIZE) + STATE_PADDING_X * 2,
  );
  assert.ok(middle.width > STATE_MIN_WIDTH && middle.width < STATE_MAX_WIDTH);
});

test("measureState gives every state the shared height", () => {
  assert.equal(measureState(stateNode()).height, STATE_HEIGHT);
});

test("bounds on a state diagram wraps every node plus the padding", () => {
  const diagram: StateDiagram = {
    version: 1,
    kind: "state",
    title: "",
    nodes: [
      stateNode({ id: "initial", role: "initial", name: "", x: 0, y: 0 }),
      stateNode({ id: "nuevo", name: "Nuevo", x: 300, y: 100 }),
      stateNode({ id: "final", role: "final", name: "", x: 10, y: 400 }),
    ],
    edges: [],
  };

  assert.deepEqual(bounds(diagram, 20), { x: -20, y: -20, width: 460, height: 464 });
  // The pseudo-states are covered by their own square, not by the state height.
  assert.ok(bounds(diagram, 0).y + bounds(diagram, 0).height >= 400 + PSEUDO_STATE_SIZE);
});
