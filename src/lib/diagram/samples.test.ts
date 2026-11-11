import test from "node:test";
import assert from "node:assert/strict";

import { parse } from "./dsl.ts";
import { measureNode } from "./measure.ts";
import { SAMPLES, defaultDiagram, sampleById } from "./samples.ts";
import type { Diagram } from "./types.ts";

function overlaps(diagram: Diagram): boolean {
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
