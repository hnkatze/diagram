import test from "node:test";
import assert from "node:assert/strict";

import { parse } from "./dsl.ts";
import { jsonExport } from "./export-image.ts";
import { measureNode, measureState } from "./measure.ts";
import { fromFile } from "./persistence.ts";
import { SAMPLES, defaultDiagram, sampleById } from "./samples.ts";
import type { ErDiagram, StateDiagram } from "./types.ts";

function overlaps(diagram: ErDiagram): boolean {
  for (let i = 0; i < diagram.nodes.length; i += 1) {
    for (let j = i + 1; j < diagram.nodes.length; j += 1) {
      const one = diagram.nodes[i];
      const two = diagram.nodes[j];
      const sizeOne = measureNode(one, diagram.kind);
      const sizeTwo = measureNode(two, diagram.kind);
      if (
        one.x < two.x + sizeTwo.width &&
        two.x < one.x + sizeOne.width &&
        one.y < two.y + sizeTwo.height &&
        two.y < one.y + sizeOne.height
      ) {
        return true;
      }
    }
  }
  return false;
}

test("every bundled sample is valid DSL of the kind it claims", () => {
  for (const sample of SAMPLES) {
    const parsed = parse(sample.text);
    assert.equal(parsed.ok, true, `${sample.id} must parse: ${parsed.ok ? "" : parsed.error}`);
    if (!parsed.ok) continue;
    assert.equal(parsed.value.kind, sample.kind);
    assert.ok(parsed.value.nodes.length >= 3, `${sample.id} needs real content`);
    assert.ok(parsed.value.edges.length >= 1, `${sample.id} needs relations`);
  }
});

test("the first visit shows the ER sample, already laid out", () => {
  const diagram = defaultDiagram();
  assert.equal(diagram.kind, "er");
  assert.equal(diagram.title, "Tienda");
  assert.equal(diagram.nodes.length, 4);
  assert.equal(diagram.edges.length, 3);
  assert.equal(overlaps(diagram), false);
  assert.ok(
    diagram.nodes.some((node) => node.x !== 0 || node.y !== 0),
    "layout must have positioned the entities",
  );
});

test("the UML sample keeps protected visibility", () => {
  const diagram = sampleById("uml");
  assert.equal(diagram.kind, "uml-class");
  const protectedField = diagram.nodes
    .flatMap((node) => node.fields)
    .find((field) => field.name === "password_hash");
  assert.ok(protectedField);
  assert.equal(protectedField.visibility, "#");
});

test("an unknown sample id falls back to the ER sample", () => {
  assert.equal(sampleById("nope").title, "Tienda");
});

test("every sample copies as JSON that imports back with its own kind", () => {
  assert.ok(SAMPLES.length >= 3, "one example per kind");
  for (const sample of SAMPLES) {
    const { text } = jsonExport(sampleById(sample.id));
    const restored = fromFile(text);
    assert.equal(restored.ok, true, `${sample.id} must import: ${restored.ok ? "" : restored.error}`);
    if (!restored.ok) continue;
    assert.equal(restored.value.kind, sample.kind);
    assert.ok(restored.value.nodes.length > 0, `${sample.id} must carry content`);
  }
});

/** Same check as `overlaps`, measured with the state geometry. */
function stateOverlaps(diagram: StateDiagram): boolean {
  for (let i = 0; i < diagram.nodes.length; i += 1) {
    for (let j = i + 1; j < diagram.nodes.length; j += 1) {
      const one = diagram.nodes[i];
      const two = diagram.nodes[j];
      const sizeOne = measureState(one);
      const sizeTwo = measureState(two);
      if (
        one.x < two.x + sizeTwo.width &&
        two.x < one.x + sizeOne.width &&
        one.y < two.y + sizeTwo.height &&
        two.y < one.y + sizeOne.height
      ) {
        return true;
      }
    }
  }
  return false;
}

test("the state sample parses, is laid out and does not overlap", () => {
  const sample = SAMPLES.find((candidate) => candidate.id === "estado");
  assert.ok(sample, "the state sample must be bundled");
  if (!sample) return;
  assert.equal(sample.kind, "state");

  const parsed = parse(sample.text);
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  if (!parsed.ok) return;
  assert.equal(parsed.value.kind, "state");

  const diagram = sampleById(sample.id);
  assert.equal(diagram.kind, "state");
  if (diagram.kind !== "state") return;

  const roles = diagram.nodes.map((node) => node.role);
  assert.equal(roles.filter((role) => role === "initial").length, 1);
  assert.equal(roles.filter((role) => role === "final").length, 1);
  assert.ok(diagram.nodes.filter((node) => node.role === "state").length >= 3);
  assert.ok(diagram.edges.length >= 4);
  assert.ok(
    diagram.nodes.some((node) => node.x !== 0 || node.y !== 0),
    "layout must have positioned the states",
  );
  assert.equal(stateOverlaps(diagram), false);
});

test("the UML sample draws a generalization and a composition, the ER sample neither", () => {
  const relations = (id: string): string[] => {
    const diagram = sampleById(id);
    return diagram.kind === "state" ? [] : diagram.edges.map((edge) => edge.relation);
  };

  assert.ok(relations("uml").includes("generalization"));
  assert.ok(relations("uml").includes("composition"));
  assert.deepEqual([...new Set(relations("er"))], ["association"]);
});
