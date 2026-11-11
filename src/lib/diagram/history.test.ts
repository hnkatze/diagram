import test from "node:test";
import assert from "node:assert/strict";

import { canRedo, canUndo, commit, createHistory, redo, undo, HISTORY_LIMIT } from "./history.ts";
import type { Diagram } from "./types.ts";

const diagram = (title: string): Diagram => ({ version: 1, kind: "er", title, nodes: [], edges: [] });

test("a fresh history holds the present with nothing to undo", () => {
  const start = diagram("a");
  const history = createHistory(start);
  assert.deepEqual(history.past, []);
  assert.equal(history.present, start);
  assert.deepEqual(history.future, []);
  assert.equal(canUndo(history), false);
  assert.equal(canRedo(history), false);
});

test("commit records a step and clears the redo branch", () => {
  const one = diagram("a");
  const two = diagram("b");
  const three = diagram("c");

  let history = createHistory(one);
  history = commit(history, two);
  history = undo(history);
  assert.equal(canRedo(history), true);

  history = commit(history, three);
  assert.equal(history.present, three);
  assert.deepEqual(history.past, [one]);
  assert.deepEqual(history.future, []);
  assert.equal(canRedo(history), false);
});

test("committing the same snapshot twice is not a new step", () => {
  const start = diagram("a");
  const history = createHistory(start);
  assert.equal(commit(history, start), history);
});

test("undo and redo walk the whole chain", () => {
  const one = diagram("a");
  const two = diagram("b");
  const three = diagram("c");

  let history = createHistory(one);
  history = commit(history, two);
  history = commit(history, three);

  history = undo(history);
  assert.equal(history.present, two);
  history = undo(history);
  assert.equal(history.present, one);
  history = undo(history);
  assert.equal(history.present, one, "undo at the beginning is a no-op");

  history = redo(history);
  assert.equal(history.present, two);
  history = redo(history);
  assert.equal(history.present, three);
  history = redo(history);
  assert.equal(history.present, three, "redo at the end is a no-op");
});

test("the past is capped by the limit", () => {
  let history = createHistory(diagram("0"));
  for (let index = 1; index <= 5; index += 1) {
    history = commit(history, diagram(String(index)), 2);
  }
  assert.equal(history.past.length, 2);
  assert.equal(history.present.title, "5");
  assert.equal(HISTORY_LIMIT, 100);
});
