import test from "node:test";
import assert from "node:assert/strict";

import { layout, layoutNewNodes } from "./layout.ts";
import { CONTAINER_INSET, CONTAINER_TITLE_HEIGHT, containerBox, isContainer, measureNode, measureState } from "./measure.ts";
import type {
  ClassDiagramKind,
  DiagramEdge,
  DiagramNode,
  ErDiagram,
  Rect,
  StateDiagram,
  StateNode,
  StateRole,
  Transition,
} from "./types.ts";

const node = (id: string, name: string): DiagramNode => ({ id, name, x: 0, y: 0, fields: [], role: "entity", parentId: null });

const edge = (source: string, target: string, id = `${source}->${target}`): DiagramEdge => ({
  id,
  source,
  target,
  relation: "association",
  sourceCardinality: "1",
  targetCardinality: "0..*",
  label: "",
});

const chain = (): ErDiagram => ({
  version: 1,
  kind: "er",
  title: "",
  nodes: [node("a", "Alpha"), node("b", "Beta"), node("c", "Gamma")],
  edges: [edge("a", "b"), edge("b", "c")],
});

function overlaps(first: DiagramNode, second: DiagramNode, kind: ClassDiagramKind): boolean {
  const one = measureNode(first, kind);
  const two = measureNode(second, kind);
  return (
    first.x < second.x + two.width &&
    second.x < first.x + one.width &&
    first.y < second.y + two.height &&
    second.y < first.y + one.height
  );
}

const stateNode = (id: string, role: StateRole, name = ""): StateNode => ({ id, name, x: 0, y: 0, role });

const transition = (source: string, target: string): Transition => ({
  id: `${source}->${target}`,
  source,
  target,
  label: "",
});

const stateChain = (): StateDiagram => ({
  version: 1,
  kind: "state",
  title: "",
  nodes: [stateNode("initial", "initial"), stateNode("nuevo", "state", "Nuevo"), stateNode("final", "final")],
  edges: [transition("initial", "nuevo"), transition("nuevo", "final")],
});

function statesOverlap(first: StateNode, second: StateNode): boolean {
  const one = measureState(first);
  const two = measureState(second);
  return (
    first.x < second.x + two.width &&
    second.x < first.x + one.width &&
    first.y < second.y + two.height &&
    second.y < first.y + one.height
  );
}

test("layout is deterministic", () => {
  assert.deepEqual(layout(chain()), layout(chain()));
});

test("layout keeps the structure and only moves nodes", () => {
  const before = chain();
  const after = layout(before);
  assert.deepEqual(
    after.nodes.map((n) => n.id),
    before.nodes.map((n) => n.id),
  );
  assert.deepEqual(after.edges, before.edges);
  assert.equal(after.kind, before.kind);
});

test("a chain flows top to bottom without overlapping boxes", () => {
  const placed = layout(chain());
  const [a, b, c] = placed.nodes;
  assert.ok(a.y < b.y, "b is below a");
  assert.ok(b.y < c.y, "c is below b");
  for (const [one, two] of [
    [a, b],
    [b, c],
    [a, c],
  ]) {
    assert.equal(overlaps(one, two, placed.kind), false, `${one.id} and ${two.id} must not overlap`);
  }
});

test("siblings of the same rank do not overlap horizontally", () => {
  const wide: ErDiagram = {
    version: 1,
    kind: "er",
    title: "",
    nodes: [node("root", "Root"), node("left", "Left"), node("right", "Right")],
    edges: [edge("root", "left"), edge("root", "right")],
  };
  const placed = layout(wide);
  const left = placed.nodes.find((n) => n.id === "left");
  const right = placed.nodes.find((n) => n.id === "right");
  assert.ok(left && right);
  assert.equal(overlaps(left, right, placed.kind), false);
});

test("an isolated node is still positioned", () => {
  const placed = layout({
    version: 1,
    kind: "er",
    title: "",
    nodes: [node("solo", "Solo")],
    edges: [],
  });
  assert.equal(Number.isFinite(placed.nodes[0].x), true);
  assert.equal(Number.isFinite(placed.nodes[0].y), true);
});

test("self relations do not break the layout", () => {
  const placed = layout({
    version: 1,
    kind: "er",
    title: "",
    nodes: [node("a", "Alpha")],
    edges: [edge("a", "a")],
  });
  assert.equal(Number.isFinite(placed.nodes[0].x), true);
  assert.equal(placed.edges.length, 1);
});

test("an empty diagram is returned untouched", () => {
  const empty: ErDiagram = { version: 1, kind: "er", title: "", nodes: [], edges: [] };
  assert.deepEqual(layout(empty), empty);
});

test("layoutNewNodes moves only the new entities", () => {
  const before = chain();
  const pinned = before.nodes.map((node, index) => ({ ...node, x: 500 + index * 300, y: 700 }));
  const withNew: ErDiagram = {
    ...before,
    nodes: [...pinned, node("d", "Delta")],
    edges: [...before.edges, edge("c", "d")],
  };

  const placed = layoutNewNodes(withNew, ["d"]);

  for (const original of pinned) {
    const after = placed.nodes.find((node) => node.id === original.id);
    assert.ok(after);
    assert.deepEqual([after.x, after.y], [original.x, original.y], `${original.id} keeps its position`);
  }

  const added = placed.nodes.find((node) => node.id === "d");
  assert.ok(added);
  assert.notDeepEqual([added.x, added.y], [0, 0]);
  assert.equal(Number.isFinite(added.x) && Number.isFinite(added.y), true);
});

test("layoutNewNodes is a no-op when nothing is new", () => {
  const before = chain();
  assert.equal(layoutNewNodes(before, []), before);
});

test("layout keeps the er chain coordinates unchanged", () => {
  const placed = layout(chain());
  assert.deepEqual(
    placed.nodes.map((node) => [node.id, node.x, node.y]),
    [
      ["a", 40, 40],
      ["b", 40, 202],
      ["c", 40, 364],
    ],
  );
});

test("a state chain puts the pseudo-states on their own ranks without overlapping", () => {
  const placed = layout(stateChain());
  const initial = placed.nodes.find((node) => node.role === "initial");
  const state = placed.nodes.find((node) => node.role === "state");
  const final = placed.nodes.find((node) => node.role === "final");
  assert.ok(initial && state && final);

  assert.ok(initial.y < state.y, "the initial glyph is above the state");
  assert.ok(state.y < final.y, "the final glyph is below the state");

  for (const [one, two] of [
    [initial, state],
    [state, final],
    [initial, final],
  ]) {
    assert.equal(statesOverlap(one, two), false, `${one.id} and ${two.id} must not overlap`);
  }
});

test("state layout is deterministic", () => {
  assert.deepEqual(layout(stateChain()), layout(stateChain()));
});

test("layoutNewNodes moves only the new state", () => {
  const before = stateChain();
  const pinned = before.nodes.map((node, index) => ({ ...node, x: 500 + index * 300, y: 700 }));
  const withNew: StateDiagram = {
    ...before,
    nodes: [...pinned, stateNode("pagado", "state", "Pagado")],
    edges: [...before.edges, transition("nuevo", "pagado")],
  };

  const placed = layoutNewNodes(withNew, ["pagado"]);

  for (const original of pinned) {
    const after = placed.nodes.find((node) => node.id === original.id);
    assert.ok(after);
    assert.deepEqual([after.x, after.y], [original.x, original.y], `${original.id} keeps its position`);
  }

  const added = placed.nodes.find((node) => node.id === "pagado");
  assert.ok(added);
  assert.notDeepEqual([added.x, added.y], [0, 0]);
  assert.equal(Number.isFinite(added.x) && Number.isFinite(added.y), true);
});

const packaged = (): ErDiagram => ({
  version: 1,
  kind: "er",
  title: "",
  nodes: [
    { ...node("ventas", "Ventas"), role: "package" },
    { ...node("logistica", "Logistica"), role: "package" },
    { ...node("pedido", "Pedido"), parentId: "ventas" },
    { ...node("item", "Item"), parentId: "ventas" },
    { ...node("envio", "Envio"), parentId: "logistica" },
    { ...node("ruta", "Ruta"), parentId: "logistica" },
  ],
  edges: [edge("pedido", "item"), edge("pedido", "envio"), edge("envio", "ruta")],
});

test("layout keeps every child inside its container rectangle", () => {
  const placed = layout(packaged());
  for (const container of placed.nodes.filter(isContainer)) {
    const rect = containerBox(placed, container);
    assert.equal(container.x, rect.x);
    assert.equal(container.y, rect.y);
    const children = placed.nodes.filter((child) => child.parentId === container.id);
    assert.equal(children.length, 2);
    for (const child of children) {
      const size = measureNode(child, "er");
      assert.ok(child.x >= rect.x + CONTAINER_INSET);
      assert.ok(child.y >= rect.y + CONTAINER_INSET + CONTAINER_TITLE_HEIGHT);
      assert.ok(child.x + size.width <= rect.x + rect.width - CONTAINER_INSET);
      assert.ok(child.y + size.height <= rect.y + rect.height - CONTAINER_INSET);
    }
  }
});

test("layout with containers is deterministic", () => {
  assert.deepEqual(layout(packaged()), layout(packaged()));
});

test("a diagram without containers lays out exactly as dagre did before", () => {
  // Coordinates captured at HEAD before compound support existed.
  assert.deepEqual(
    layout(chain()).nodes.map((n) => [n.id, n.x, n.y]),
    [
      ["a", 40, 40],
      ["b", 40, 202],
      ["c", 40, 364],
    ],
  );
});

/** Pixels two rectangles share along the axis where they overlap least; 0 or less means they do not intersect. */
function overlapDepth(one: Rect, two: Rect): number {
  const across = Math.min(one.x + one.width, two.x + two.width) - Math.max(one.x, two.x);
  const down = Math.min(one.y + one.height, two.y + two.height) - Math.max(one.y, two.y);
  return Math.min(across, down);
}

const twoPackages = (links: DiagramEdge[]): ErDiagram => ({
  version: 1,
  kind: "er",
  title: "",
  nodes: [
    { ...node("uno", "Uno"), role: "package" },
    { ...node("dos", "Dos"), role: "package" },
    { ...node("a", "Alpha"), parentId: "uno" },
    { ...node("b", "Beta"), parentId: "dos" },
  ],
  edges: links,
});

test("containers stacked vertically do not intersect", () => {
  const placed = layout(twoPackages([edge("a", "b")]));
  const [uno, dos] = placed.nodes.filter(isContainer).map((container) => containerBox(placed, container));
  assert.ok(dos.y >= uno.y + uno.height, `overlap of ${overlapDepth(uno, dos)}px`);
});

test("containers side by side do not intersect", () => {
  const placed = layout(twoPackages([]));
  const [uno, dos] = placed.nodes.filter(isContainer).map((container) => containerBox(placed, container));
  assert.ok(overlapDepth(uno, dos) <= 0, `overlap of ${overlapDepth(uno, dos)}px`);
});
