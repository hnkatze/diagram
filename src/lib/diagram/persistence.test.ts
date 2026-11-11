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
import { isErDiagram, isStateDiagram } from "./types.ts";

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
      role: "entity",
      parentId: null,
    },
    { id: "pedido", name: "Pedido", x: 320, y: 80, fields: [], role: "entity", parentId: null },
  ],
  edges: [
    {
      id: "cliente->pedido",
      source: "cliente",
      target: "pedido",
      relation: "association",
      sourceCardinality: "1",
      targetCardinality: "0..*",
      label: "realiza",
    },
  ],
});

const stateGood = (): Diagram => ({
  version: 1,
  kind: "state",
  title: "Ciclo del pedido",
  nodes: [
    { id: "initial", name: "", x: 140, y: 40, role: "initial" },
    { id: "nuevo", name: "Nuevo", x: 100, y: 140, role: "state" },
    { id: "pagado", name: "Pagado", x: 220, y: 240, role: "state" },
    { id: "final", name: "", x: 140, y: 360, role: "final" },
  ],
  edges: [
    { id: "initial->nuevo", source: "initial", target: "nuevo", label: "" },
    { id: "nuevo->pagado", source: "nuevo", target: "pagado", label: "pagar [monto > 0] / emitir recibo" },
    { id: "pagado->pagado", source: "pagado", target: "pagado", label: "reintentar" },
    { id: "pagado->final", source: "pagado", target: "final", label: "" },
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

test("a state file round trips through toFile and fromFile unchanged", () => {
  const diagram = stateGood();
  const restored = fromFile(toFile(diagram));
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.deepEqual(restored.value, diagram);
});

function brokenState(mutate: (diagram: Record<string, unknown>) => void): string {
  const value = JSON.parse(toFile(stateGood())) as { diagram: Record<string, unknown> };
  mutate(value.diagram);
  return JSON.stringify(value);
}

function stateNodes(diagram: Record<string, unknown>): Record<string, unknown>[] {
  return diagram.nodes as Record<string, unknown>[];
}

function stateEdges(diagram: Record<string, unknown>): Record<string, unknown>[] {
  return diagram.edges as Record<string, unknown>[];
}

test("a state file with an unknown role is rejected", () => {
  const text = brokenState((diagram) => {
    stateNodes(diagram)[1].role = "esperando";
  });
  const result = fromFile(text);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /esperando/);
});

test("a state file with a transition to a missing state is rejected", () => {
  const text = brokenState((diagram) => {
    stateEdges(diagram)[1].target = "fantasma";
  });
  const result = fromFile(text);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /fantasma/);
});

test("a state file with a duplicated or non numeric position is rejected", () => {
  const duplicated = brokenState((diagram) => {
    stateNodes(diagram)[2].id = "nuevo";
  });
  const duplicatedResult = fromFile(duplicated);
  assert.equal(duplicatedResult.ok, false);
  if (!duplicatedResult.ok) assert.match(duplicatedResult.error, /nuevo/);

  const nonNumeric = brokenState((diagram) => {
    stateNodes(diagram)[1].x = "100";
  });
  const nonNumericResult = fromFile(nonNumeric);
  assert.equal(nonNumericResult.ok, false);
  if (!nonNumericResult.ok) assert.match(nonNumericResult.error, /nuevo/);

  const twoInitial = brokenState((diagram) => {
    stateNodes(diagram)[3].role = "initial";
  });
  const twoInitialResult = fromFile(twoInitial);
  assert.equal(twoInitialResult.ok, false);
  if (!twoInitialResult.ok) assert.match(twoInitialResult.error, /initial/i);

  const namelessState = brokenState((diagram) => {
    stateNodes(diagram)[1].name = "  ";
  });
  const namelessResult = fromFile(namelessState);
  assert.equal(namelessResult.ok, false);
  if (!namelessResult.ok) assert.match(namelessResult.error, /name/);
});

test("an old er file still imports", () => {
  const legacy = JSON.stringify({
    version: FILE_VERSION,
    diagram: {
      version: FILE_VERSION,
      kind: "er",
      title: "Viejo",
      nodes: [{ id: "cliente", name: "Cliente", x: 12, y: 24, fields: [], role: "entity", parentId: null }],
      edges: [],
    },
  });
  const result = fromFile(legacy);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.kind, "er");
  assert.equal(result.value.title, "Viejo");
  assert.equal(result.value.nodes.length, 1);
});

test("a state diagram is autosaved and restored", () => {
  const store = memoryStore();
  assert.equal(writeStorage(store, stateGood()), true);
  assert.deepEqual(readStorage(store), stateGood());
});

test("the UML * shorthand is read as 0..* instead of rejecting the file", () => {
  const value = JSON.parse(toFile(good())) as { diagram: Record<string, unknown> };
  const edges = value.diagram.edges as Record<string, unknown>[];
  edges[0].sourceCardinality = "*";
  edges[0].targetCardinality = " * ";

  const result = fromFile(JSON.stringify(value));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(isStateDiagram(result.value), false);
  if (!isErDiagram(result.value)) return;
  assert.equal(result.value.edges[0].sourceCardinality, "0..*");
  assert.equal(result.value.edges[0].targetCardinality, "0..*");
});

test("an unknown cardinality names the relation and the offending value", () => {
  const value = JSON.parse(toFile(good())) as { diagram: Record<string, unknown> };
  const edges = value.diagram.edges as Record<string, unknown>[];
  edges[0].sourceCardinality = "muchos";

  const result = fromFile(JSON.stringify(value));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /cliente->pedido/);
  assert.match(result.error, /muchos/);
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

test("an old file without a relation field reads as an association", () => {
  const value = JSON.parse(toFile(good())) as { diagram: { edges: Record<string, unknown>[] } };
  delete value.diagram.edges[0].relation;

  const restored = fromFile(JSON.stringify(value));
  assert.equal(restored.ok, true);
  if (!restored.ok || isStateDiagram(restored.value)) return;
  assert.equal(restored.value.edges[0].relation, "association");
});

test("a relation kind and missing cardinalities survive the file round trip", () => {
  const diagram = good();
  if (isStateDiagram(diagram)) return;
  diagram.edges[0] = { ...diagram.edges[0], relation: "composition", sourceCardinality: null, targetCardinality: null };

  const restored = fromFile(toFile(diagram));
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.deepEqual(restored.value, diagram);
});

test("a file with no cardinalities reads them as null", () => {
  const value = JSON.parse(toFile(good())) as { diagram: { edges: Record<string, unknown>[] } };
  delete value.diagram.edges[0].sourceCardinality;
  delete value.diagram.edges[0].targetCardinality;

  const restored = fromFile(JSON.stringify(value));
  assert.equal(restored.ok, true);
  if (!restored.ok || !isErDiagram(restored.value)) return;
  assert.equal(restored.value.edges[0].sourceCardinality, null);
  assert.equal(restored.value.edges[0].targetCardinality, null);
});

test("an unknown relation kind is refused and names the value", () => {
  const value = JSON.parse(toFile(good())) as { diagram: { edges: Record<string, unknown>[] } };
  value.diagram.edges[0].relation = "herencia";

  const restored = fromFile(JSON.stringify(value));
  assert.equal(restored.ok, false);
  if (restored.ok) return;
  assert.ok(restored.error.includes('"herencia"'), restored.error);
  assert.ok(restored.error.includes("relation"), restored.error);
});

test("a file with a single cardinality on a relation is refused and names the relation", () => {
  const value = JSON.parse(toFile(good())) as { diagram: { edges: Record<string, unknown>[] } };
  const id = value.diagram.edges[0].id as string;
  value.diagram.edges[0].targetCardinality = null;

  const restored = fromFile(JSON.stringify(value));
  assert.equal(restored.ok, false);
  if (restored.ok) return;
  assert.ok(restored.error.includes(`"${id}"`), restored.error);
});

const rawFile = (node: Record<string, unknown>, extra: Record<string, unknown>[] = []): string =>
  JSON.stringify({
    version: 1,
    diagram: { version: 1, kind: "er", title: "T", nodes: [node, ...extra], edges: [] },
  });

test("a file without role or parentId imports as top-level entities", () => {
  const result = fromFile(rawFile({ id: "a", name: "A", x: 1, y: 2, fields: [] }));
  assert.equal(result.ok, true);
  if (!result.ok || isStateDiagram(result.value)) return;
  assert.equal(result.value.nodes[0].role, "entity");
  assert.equal(result.value.nodes[0].parentId, null);
});

test("an unknown role is refused naming the value", () => {
  const result = fromFile(rawFile({ id: "a", name: "A", x: 1, y: 2, fields: [], role: "swimlane" }));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /"a"/);
    assert.match(result.error, /swimlane/);
  }
});

test("a parentId that resolves to nothing is refused naming the value", () => {
  const result = fromFile(rawFile({ id: "a", name: "A", x: 1, y: 2, fields: [], parentId: "ghost" }));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /"a"/);
    assert.match(result.error, /ghost/);
  }
});

test("a glyph document round-trips through the envelope", () => {
  const diagram: Diagram = {
    version: 1,
    kind: "use-case",
    title: "Tienda",
    nodes: [
      { id: "ana", name: "Ana", x: 10, y: 20, role: "actor", parentId: null },
      { id: "sistema", name: "Sistema", x: 0, y: 0, role: "region", parentId: null },
      { id: "pagar", name: "Pagar", x: 90, y: 20, role: "usecase", parentId: "sistema" },
    ],
    edges: [{ id: "ana->pagar", source: "ana", target: "pagar", relation: "dependency", label: "«include»" }],
  };
  const result = fromFile(toFile(diagram));
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value, diagram);
  assert.deepEqual(JSON.parse(toFile(diagram)).version, FILE_VERSION);
});

const glyphFile = (node: object, edge: object = {}): string =>
  JSON.stringify({
    version: 1,
    diagram: {
      version: 1,
      kind: "use-case",
      title: "",
      nodes: [
        { id: "ana", name: "Ana", x: 0, y: 0, role: "actor", parentId: null, ...node },
        { id: "pagar", name: "Pagar", x: 0, y: 0, role: "usecase", parentId: null },
      ],
      edges: [{ id: "e", source: "ana", target: "pagar", relation: "association", label: "", ...edge }],
    },
  });

test("a glyph document with an unknown role is refused naming the node and the value", () => {
  const result = fromFile(glyphFile({ role: "banana" }));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /ana/);
    assert.match(result.error, /banana/);
  }
});

test("a glyph document with a role of another kind is refused", () => {
  const result = fromFile(glyphFile({ role: "component" }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /component/);
});

test("a glyph document with a composition relation is refused naming the kind", () => {
  const result = fromFile(glyphFile({}, { relation: "composition" }));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /use-case/);
    assert.match(result.error, /composition/);
  }
});

test("a glyph relation to a missing node is refused", () => {
  const result = fromFile(glyphFile({}, { target: "nadie" }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /nadie/);
});
