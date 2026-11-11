import test from "node:test";
import assert from "node:assert/strict";

import { bounds, formatFieldLabel, measureNode } from "./measure.ts";
import { toSvg } from "./svg.ts";
import type { Diagram, DiagramEdge, DiagramField, DiagramNode } from "./types.ts";

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
  fields: [field({ name: "id", type: "int", pk: true })],
  ...over,
});

const edge = (over: Partial<DiagramEdge> = {}): DiagramEdge => ({
  id: "usuario->pedido",
  source: "usuario",
  target: "pedido",
  sourceCardinality: "1",
  targetCardinality: "0..*",
  label: "realiza",
  ...over,
});

const diagram = (over: Partial<Diagram> = {}): Diagram => ({
  version: 1,
  kind: "er",
  title: "",
  nodes: [node(), node({ id: "pedido", name: "Pedido", x: 260, y: 120 })],
  edges: [edge()],
  ...over,
});

test("emits a complete standalone svg document", () => {
  const svg = toSvg(diagram());
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.endsWith("</svg>"));
  assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /width="\d+"/);
  assert.match(svg, /height="\d+"/);
  assert.match(svg, /viewBox="0 0 \d+ \d+"/);
  assert.match(svg, /<style>/);
});

test("draws every entity with its fields", () => {
  const svg = toSvg(diagram());
  assert.match(svg, />Usuario</);
  assert.match(svg, />Pedido</);
  assert.ok(svg.includes(formatFieldLabel(node().fields[0], "er")));
});

test("draws the relation label and both cardinalities", () => {
  const svg = toSvg(diagram());
  assert.match(svg, />realiza</);
  assert.match(svg, />1</);
  assert.match(svg, />0\.\.\*</);
  assert.match(svg, /<line x1=/);
});

test("a self relation becomes a path instead of a line", () => {
  const selfLoop = diagram({
    nodes: [node()],
    edges: [edge({ id: "usuario->usuario", source: "usuario", target: "usuario", label: "delega" })],
  });
  const svg = toSvg(selfLoop);
  assert.match(svg, /<path d="M /);
  assert.match(svg, />delega</);
});

test("escapes every user provided string", () => {
  const tricky = diagram({
    title: 'A & B <x>',
    nodes: [node({ name: 'Pe&dro "<x>"' })],
    edges: [edge({ id: "usuario->usuario", source: "usuario", target: "usuario", label: 'say "hi" & <ok>' })],
  });
  const svg = toSvg(tricky);
  assert.ok(svg.includes("A &amp; B &lt;x&gt;"));
  assert.ok(svg.includes("Pe&amp;dro &quot;&lt;x&gt;&quot;"));
  assert.ok(svg.includes("say &quot;hi&quot; &amp; &lt;ok&gt;"));
  assert.equal(svg.includes("<x>"), false);
});

test("renders the title only when it is not empty", () => {
  assert.match(toSvg(diagram({ title: "Tienda" })), /class="t"[^>]*>Tienda</);
  assert.equal(toSvg(diagram()).includes('class="t"'), false);
});

test("the padding option changes the viewBox and the size", () => {
  const tight = toSvg(diagram(), { padding: 10 });
  const loose = toSvg(diagram(), { padding: 80 });
  const widthOf = (svg: string): number => Number(/width="(\d+)"/.exec(svg)?.[1] ?? 0);
  assert.ok(widthOf(loose) > widthOf(tight));
});

test("the background option paints the backdrop rect", () => {
  const svg = toSvg(diagram(), { background: "#0f172a" });
  assert.match(svg, /<rect x="0" y="0" width="\d+" height="\d+" fill="#0f172a"\/>/);
});

test("an empty diagram still produces a valid document", () => {
  const svg = toSvg(diagram({ nodes: [], edges: [] }));
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.endsWith("</svg>"));
  assert.equal(svg.includes("<clipPath"), false);
});

test("output is deterministic", () => {
  assert.equal(toSvg(diagram()), toSvg(diagram()));
  assert.equal(toSvg(diagram(), { padding: 12 }), toSvg(diagram(), { padding: 12 }));
});

test("canvas size matches the shared geometry", () => {
  const empty = diagram();
  const box = bounds(empty, 48);
  const svg = toSvg(empty);
  const width = Number(/width="(\d+)"/.exec(svg)?.[1]);
  const height = Number(/height="(\d+)"/.exec(svg)?.[1]);
  assert.equal(width, Math.ceil(box.width));
  assert.equal(height, Math.ceil(box.height));
  assert.equal(measureNode(node(), "er").height, 72);
});

test("uml-class diagrams keep the visibility glyph", () => {
  const uml = diagram({ kind: "uml-class", title: "Modelo" });
  assert.ok(toSvg(uml).includes(formatFieldLabel(node().fields[0], "uml-class")));
});
