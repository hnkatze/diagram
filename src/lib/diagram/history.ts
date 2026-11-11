import type { Diagram } from "./types.ts";

/**
 * Model snapshot history for undo/redo (spec S10). The diagram is a small
 * immutable JSON value, so whole snapshots are cheaper and safer than events.
 */

export interface History {
  past: Diagram[];
  present: Diagram;
  future: Diagram[];
}

export const HISTORY_LIMIT = 100;

export function createHistory(present: Diagram): History {
  return { past: [], present, future: [] };
}

/** Records a new snapshot. The same reference twice is not a new step. */
export function commit(history: History, next: Diagram, limit: number = HISTORY_LIMIT): History {
  if (next === history.present) return history;
  const past = [...history.past, history.present];
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    present: next,
    future: [],
  };
}

export function undo(history: History): History {
  if (history.past.length === 0) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
  };
}

export function redo(history: History): History {
  if (history.future.length === 0) return history;
  const [present, ...rest] = history.future;
  return { past: [...history.past, history.present], present, future: rest };
}

export function canUndo(history: History): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History): boolean {
  return history.future.length > 0;
}
