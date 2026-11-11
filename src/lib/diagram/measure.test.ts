import test from "node:test";
import assert from "node:assert/strict";

import {
  measureGlyph,
  measureNode,
  measureState,
  COMPONENT_TAB_HEIGHT,
  COMPONENT_TAB_TOPS,
  INTERFACE_RADIUS,
  INTERFACE_STEM,
  formatFieldLabel,
  bounds,
  estimateTextWidth,
  borderPoint,
  containerBox,
  containerTabPath,
  isContainer,
  CONTAINER_INSET,
  CONTAINER_TITLE_HEIGHT,
  CONTAINER_TITLE_CHAR_WIDTH,
  cardinalityLabel,
  edgeMarker,
  markerEnd,
  relationIsDashed,
  PSEUDO_STATE_SIZE,
  STATE_HEIGHT,
  STATE_MAX_WIDTH,
  STATE_MIN_WIDTH,
  STATE_NAME_FONT_SIZE,
  STATE_PADDING_X,
} from "./measure.ts";
import type { GlyphNode } from "./types.ts";
import type { DiagramField, DiagramNode, ErDiagram, StateDiagram, StateNode } from "./types.ts";

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
  role: "entity",
  parentId: null,
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

test("edgeMarker returns null for a plain association and nothing is inset", () => {
  assert.equal(edgeMarker("association", { x: 100, y: 50 }, { x: 0, y: 50 }), null);
});

test("a directed association is an open arrow on a solid line, at the target", () => {
  const marker = edgeMarker("directed-association", { x: 100, y: 50 }, { x: 0, y: 50 });

  assert.ok(marker);
  assert.equal(marker.fill, "none");
  assert.equal(marker.inset, 0);
  assert.equal(marker.dashed, false);
  assert.ok(marker.path.startsWith("M 100 50"));
  assert.equal(markerEnd("directed-association"), "target");
  assert.equal(markerEnd("association"), null);
  assert.equal(relationIsDashed("directed-association"), false);
});

test("every marker tip sits on the endpoint and its base lies back along the line", () => {
  const point = { x: 100, y: 50 };
  const towards = { x: 0, y: 50 };
  const sizes = { generalization: 12, realization: 12, composition: 14, aggregation: 14, dependency: 10 } as const;

  for (const [relation, length] of Object.entries(sizes) as [keyof typeof sizes, number][]) {
    const marker = edgeMarker(relation, point, towards);
    assert.ok(marker, relation);
    assert.ok(marker.path.startsWith("M 100 50"), `${relation}: ${marker.path}`);
    assert.ok(marker.path.includes(`${100 - length} `), `${relation}: ${marker.path}`);
  }
});

test("edgeMarker fills, insets and dashes follow the relation kind", () => {
  const point = { x: 100, y: 50 };
  const towards = { x: 0, y: 50 };

  assert.deepEqual(
    (["generalization", "realization", "composition", "aggregation", "dependency"] as const).map((relation) => {
      const marker = edgeMarker(relation, point, towards);
      return marker ? [relation, marker.fill, marker.inset, marker.dashed] : null;
    }),
    [
      ["generalization", "background", 12, false],
      ["realization", "background", 12, true],
      ["composition", "line", 14, false],
      ["aggregation", "background", 14, false],
      ["dependency", "none", 0, true],
    ],
  );
});

test("relationIsDashed is true only for realization and dependency", () => {
  assert.equal(relationIsDashed("realization"), true);
  assert.equal(relationIsDashed("dependency"), true);
  assert.equal(relationIsDashed("association"), false);
  assert.equal(relationIsDashed("generalization"), false);
});

test("cardinalityLabel renders nothing for a cardinality that was not stated", () => {
  assert.equal(cardinalityLabel(null), "");
  assert.equal(cardinalityLabel("0..*"), "0..*");
});

const classDiagram = (nodes: DiagramNode[]): ErDiagram => ({ version: 1, kind: "er", title: "", nodes, edges: [] });
const pkg = (id: string, over: Partial<DiagramNode> = {}): DiagramNode =>
  node({ id, name: id, role: "package", fields: [], ...over });

test("containerBox wraps the children bounding box with the inset and a title strip", () => {
  const first = node({ id: "a", name: "A", x: 100, y: 200, parentId: "box" });
  const second = node({ id: "b", name: "B", x: 400, y: 260, parentId: "box" });
  const outside = node({ id: "c", name: "C", x: -900, y: -900 });
  const container = pkg("box");
  const diagram = classDiagram([container, first, second, outside]);

  const one = measureNode(first, "er");
  const two = measureNode(second, "er");
  const right = Math.max(first.x + one.width, second.x + two.width);
  const bottom = Math.max(first.y + one.height, second.y + two.height);

  assert.deepEqual(containerBox(diagram, container), {
    x: 100 - CONTAINER_INSET,
    y: 200 - CONTAINER_INSET - CONTAINER_TITLE_HEIGHT,
    width: right - 100 + CONTAINER_INSET * 2,
    height: bottom - 200 + CONTAINER_INSET * 2 + CONTAINER_TITLE_HEIGHT,
  });
});

test("an empty container gets the deterministic minimum rectangle", () => {
  const container = pkg("vacio", { name: "Vacio", x: 10, y: 20 });
  const box = containerBox(classDiagram([container]), container);
  assert.deepEqual(box, {
    x: 10,
    y: 20,
    width: "Vacio".length * CONTAINER_TITLE_CHAR_WIDTH + CONTAINER_INSET,
    height: CONTAINER_TITLE_HEIGHT + CONTAINER_INSET,
  });
  assert.deepEqual(containerBox(classDiagram([container]), container), box);
});

test("a container with children grows to fit a long title", () => {
  const child = node({ id: "a", name: "A", x: 100, y: 200, parentId: "box" });
  const container = pkg("box", { name: "T".repeat(80) });
  const box = containerBox(classDiagram([container, child]), container);
  const size = measureNode(child, "er");
  const childrenWidth = size.width + CONTAINER_INSET * 2;
  const titleWidth = 80 * CONTAINER_TITLE_CHAR_WIDTH + CONTAINER_INSET * 2;

  assert.ok(box.width > childrenWidth, `width ${box.width} should exceed ${childrenWidth}`);
  assert.ok(box.width >= titleWidth, `width ${box.width} should fit the title ${titleWidth}`);
  assert.ok(child.x >= box.x && child.x + size.width <= box.x + box.width);
  assert.ok(child.y >= box.y && child.y + size.height <= box.y + box.height);
});

test("a container with a short title keeps the width of its children", () => {
  const child = node({ id: "a", name: "A", x: 100, y: 200, parentId: "box" });
  const container = pkg("box", { name: "Ventas" });
  const box = containerBox(classDiagram([container, child]), container);
  assert.equal(box.width, measureNode(child, "er").width + CONTAINER_INSET * 2);
});

test("isContainer is true for package and region only", () => {
  assert.equal(isContainer(node()), false);
  assert.equal(isContainer(pkg("p")), true);
  assert.equal(isContainer(node({ role: "region" })), true);
});

test("bounds includes the container title strip above its topmost child", () => {
  const container = pkg("box");
  const child = node({ id: "a", x: 0, y: 0, parentId: "box" });
  const diagram = classDiagram([container, child]);
  const frame = bounds(diagram);
  const rect = containerBox(diagram, container);

  assert.ok(frame.x <= rect.x);
  assert.ok(frame.y <= rect.y);
  assert.ok(frame.x + frame.width >= rect.x + rect.width);
  assert.ok(frame.y + frame.height >= rect.y + rect.height);
});

test("containerTabPath draws a tab for a package and nothing for a region or an entity", () => {
  const box = { x: 10, y: 20, width: 300, height: 200 };

  const tab = containerTabPath(pkg("p"), box);
  assert.ok(tab !== null && tab.length > 0);
  assert.equal(containerTabPath(node({ role: "region" }), box), null);
  assert.equal(containerTabPath(node(), box), null);
});

test("the tab stays inside the title strip of the container", () => {
  const box = { x: 10, y: 20, width: 300, height: 200 };
  // Drop the arc radii and flags so only coordinate pairs remain.
  const path = (containerTabPath(pkg("p"), box) ?? "").replace(/A \d+(\.\d+)? \d+(\.\d+)? 0 0 1/g, "L");
  const numbers = path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];

  assert.ok(numbers.length > 0);
  for (let index = 0; index < numbers.length; index += 2) {
    assert.ok(numbers[index] >= box.x && numbers[index] <= box.x + box.width);
  }
  const ys = numbers.filter((_, index) => index % 2 === 1);
  assert.ok(Math.min(...ys) >= box.y);
  assert.ok(Math.max(...ys) <= box.y + CONTAINER_TITLE_HEIGHT);
});

test("a package and a region holding the same child get the same rectangle", () => {
  const child = node({ id: "a", name: "A", x: 100, y: 200, parentId: "box" });
  const size = measureNode(child, "er");
  const expected = {
    x: 100 - CONTAINER_INSET,
    y: 200 - CONTAINER_INSET - CONTAINER_TITLE_HEIGHT,
    width: size.width + CONTAINER_INSET * 2,
    height: size.height + CONTAINER_INSET * 2 + CONTAINER_TITLE_HEIGHT,
  };

  for (const role of ["package", "region"] as const) {
    const container = pkg("box", { role });
    assert.deepEqual(containerBox(classDiagram([container, child]), container), expected);
  }
});

test("a component box and an interface lollipop both have a size, and the lollipop fits in it", () => {
  const glyph = (role: GlyphNode["role"]): GlyphNode => ({ id: role, name: "X", x: 0, y: 0, role, parentId: null });
  const component = measureGlyph(glyph("component"));
  const lollipop = measureGlyph(glyph("interface"));
  assert.ok(component.width > 0 && component.height > 0);
  assert.ok(lollipop.width > 0 && lollipop.height > 0);
  assert.ok(INTERFACE_RADIUS * 2 + INTERFACE_STEM < lollipop.height, "circle and stem leave room for the name");
  for (const top of COMPONENT_TAB_TOPS) assert.ok(top + COMPONENT_TAB_HEIGHT <= component.height);
});
