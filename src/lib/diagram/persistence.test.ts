import test from "node:test";
import assert from "node:assert/strict";

import {
  FILE_VERSION,
  STORAGE_KEY,
  fromFile,
  readStorage,
  toFile,
  writeStorage,
  type KeyValueStore,
} from "./persistence.ts";
import type { Diagram } from "./types.ts";

const good = (): Diagram => ({
  version: 1,
  kind: "er",
  title: "Tienda",
  nodes: [
    {
      id: "cliente",
      name: "Cliente",
      x: 40,
      y: 80,
      fields: [{ name: "id", type: "int", visibility: "+", pk: true, fk: false, uk: false, nullable: false }],
    },
    { id: "pedido", name: "Pedido", x: 320, y: 80, fields: [] },
  ],
  edges: [
    {
      id: "cliente->pedido",
      source: "cliente",
      target: "pedido",
      sourceCardinality: "1",
      targetCardinality: "0..*",
      label: "realiza",
    },
  ],
});

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

test("the file round trip preserves the diagram exactly, positions included", () => {
  const diagram = good();
  const text = toFile(diagram);
  assert.match(text, /"version": 1/);
  const restored = fromFile(text);
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.deepEqual(restored.value, diagram);
});

test("a corrupt or foreign file is rejected instead of replacing the diagram", () => {
  assert.equal(fromFile("{oops").ok, false);
  assert.equal(fromFile("[]").ok, false);
  assert.equal(fromFile("{}").ok, false);
  assert.equal(fromFile(JSON.stringify({ version: 2, diagram: good() })).ok, false);
  assert.equal(fromFile(JSON.stringify({ version: FILE_VERSION })).ok, false);
});

test("structurally invalid diagrams are rejected", () => {
  const broken = (mutate: (value: Record<string, unknown>) => void): unknown => {
    const value = JSON.parse(toFile(good())) as { diagram: Record<string, unknown> };
    mutate(value.diagram);
    return value;
  };

  const cases: [string, unknown][] = [
    ["unknown kind", broken((d) => { d.kind = "sequence"; })],
    ["missing title", broken((d) => { delete d.title; })],
    ["nodes not a list", broken((d) => { d.nodes = "nope"; })],
    ["bad cardinality", broken((d) => {
      const edges = d.edges as Record<string, unknown>[];
      edges[0].sourceCardinality = "muchos";
    })],
    ["dangling relation", broken((d) => {
      const edges = d.edges as Record<string, unknown>[];
      edges[0].target = "fantasma";
    })],
    ["non numeric position", broken((d) => {
      const nodes = d.nodes as Record<string, unknown>[];
      nodes[0].x = "40";
    })],
    ["field flag of the wrong type", broken((d) => {
      const nodes = d.nodes as Record<string, unknown>[];
      const fields = nodes[0].fields as Record<string, unknown>[];
      fields[0].pk = "yes";
    })],
  ];

  for (const [label, payload] of cases) {
    assert.equal(fromFile(JSON.stringify(payload)).ok, false, label);
  }
});

test("storage saves, restores and tolerates corruption", () => {
  const store = memoryStore();
  assert.equal(writeStorage(store, good()), true);
  assert.ok(STORAGE_KEY in store.data);
  assert.deepEqual(readStorage(store), good());

  store.data[STORAGE_KEY] = "{ not json";
  assert.equal(readStorage(store), null);
});

test("storage never throws when the environment misbehaves", () => {
  assert.equal(readStorage(null), null);
  assert.equal(writeStorage(null, good()), false);
  assert.equal(readStorage(memoryStore()), null);

  const hostile: KeyValueStore = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("quota");
    },
  };
  assert.equal(readStorage(hostile), null);
  assert.equal(writeStorage(hostile, good()), false);
});
