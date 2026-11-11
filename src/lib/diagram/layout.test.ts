import test from "node:test";
import assert from "node:assert/strict";

import { layout, layoutNewNodes } from "./layout.ts";
import { measureNode } from "./measure.ts";
import type { Diagram, DiagramEdge, DiagramNode } from "./types.ts";

const node = (id: string, name: string): DiagramNode => ({ id, name, x: 0, y: 0, fields: [] });

const edge = (source: string, target: string, id = `${source}->${target}`): DiagramEdge => ({
  id,
  source,
  target,
  sourceCardinality: "1",
  targetCardinality: "0..*",
  label: "",
});

const chain = (): Diagram => ({
  version: 1,
  kind: "er",
  title: "",
  nodes: [node("a", "Alpha"), node("b", "Beta"), node("c", "Gamma")],
  edges: [edge("a", "b"), edge("b", "c")],
});

function overlaps(first: DiagramNode, second: DiagramNode, kind: Diagram["kind"]): boolean {
  const one = measureNode(first, kind);
  const two = measureNode(second, kind);
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
  const wide: Diagram = {
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
  const empty: Diagram = { version: 1, kind: "er", title: "", nodes: [], edges: [] };
  assert.deepEqual(layout(empty), empty);
});

test("layoutNewNodes moves only the new entities", () => {
  const before = chain();
  const pinned = before.nodes.map((node, index) => ({ ...node, x: 500 + index * 300, y: 700 }));
  const withNew: Diagram = {
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
