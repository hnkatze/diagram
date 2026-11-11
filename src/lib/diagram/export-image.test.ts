import test from "node:test";
import assert from "node:assert/strict";

import { fileNameFor, jsonExport, svgSize } from "./export-image.ts";
import { fromFile, toFile } from "./persistence.ts";
import { toSvg } from "./svg.ts";
import type { Diagram } from "./types.ts";

const diagram = (title: string): Diagram => ({ version: 1, kind: "er", title, nodes: [], edges: [] });

test("the file name is the slug of the title plus the extension", () => {
  assert.equal(fileNameFor(diagram("Tienda Central"), "svg"), "tienda-central.svg");
  assert.equal(fileNameFor(diagram("Pedidos Añadidos"), "png"), "pedidos-anadidos.png");
});

test("an untitled diagram exports as untitled", () => {
  assert.equal(fileNameFor(diagram(""), "png"), "untitled.png");
  assert.equal(fileNameFor(diagram("   "), "svg"), "untitled.svg");
});

test("the json export reuses the exchange format and the title slug", () => {
  const target = jsonExport(diagram("Tienda Central"));
  assert.equal(target.fileName, "tienda-central.json");
  assert.equal(target.text, toFile(diagram("Tienda Central")));
  const restored = fromFile(target.text);
  assert.ok(restored.ok);
  assert.deepEqual(restored.value, diagram("Tienda Central"));
  assert.equal(jsonExport(diagram("")).fileName, "untitled.json");
});

test("svgSize reads the root size of an exported document", () => {
  const svg = toSvg({
    version: 1,
    kind: "er",
    title: "",
    nodes: [{ id: "a", name: "A", x: 0, y: 0, fields: [], role: "entity", parentId: null }],
    edges: [],
  });
  const size = svgSize(svg);
  assert.ok(size);
  assert.ok(size.width > 0);
  assert.ok(size.height > 0);
});

test("svgSize refuses a document without a usable size", () => {
  assert.equal(svgSize("<svg></svg>"), null);
  assert.equal(svgSize("not an svg"), null);
  assert.equal(svgSize('<svg width="0" height="0"></svg>'), null);
});
