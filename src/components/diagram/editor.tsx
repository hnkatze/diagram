"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parse, serialize } from "@/lib/diagram/dsl";
import { downloadJson, downloadPng, downloadSvg, fileNameFor } from "@/lib/diagram/export-image";
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from "@/lib/diagram/history";
import { layout, layoutNewNodes } from "@/lib/diagram/layout";
import { bounds, measureState } from "@/lib/diagram/measure";
import {
  addEdge,
  addField,
  addNode,
  createField,
  deleteEdge,
  deleteField,
  deleteNode,
  mergeStructure,
  moveNode,
  renameNode,
  setKind,
  setTitle,
  slugify,
  uniqueId,
  updateEdge,
  updateField,
} from "@/lib/diagram/model";
import { fromFile, readStorage, writeStorage } from "@/lib/diagram/persistence";
import { defaultDiagram, sampleById } from "@/lib/diagram/samples";
import { toSvg } from "@/lib/diagram/svg";
import type { Diagram, DiagramField, DiagramKind, ErDiagram, Result, StateDiagram } from "@/lib/diagram/types";
import { err, isClassDiagramKind, isErDiagram, isStateDiagram, ok } from "@/lib/diagram/types";
import { DiagramCanvas } from "./canvas";
import { Inspector, StateInspector } from "./inspector";
import { TextPanel } from "./text-panel";
import { Toolbar, type ExportFormat, type ExportTheme } from "./toolbar";

/**
 * The editing surface (spec S1). One `History` of `Diagram` snapshots is the
 * only source of truth; the canvas and the text panel are both projections of
 * `history.present`. Every operation dispatches on the family of the present
 * document (spec S8), so a class-only helper never sees a state machine.
 */

interface Draft {
  text: string;
  /** The snapshot this draft was typed against; a newer snapshot invalidates it. */
  base: Diagram;
  error: string | null;
}

const NEW_ENTITY_NAME = "Entidad";
const NEW_STATE_NAME = "Estado";

/** The bundled sample each kind starts from when the kind control switches. */
const SAMPLE_BY_KIND: Record<DiagramKind, string> = { er: "er", "uml-class": "uml", state: "estado" };

function nextEntityName(diagram: ErDiagram, base: string = NEW_ENTITY_NAME): string {
  const taken = new Set(diagram.nodes.map((node) => slugify(node.name)));
  if (!taken.has(slugify(base))) return base;
  let suffix = 2;
  while (taken.has(slugify(`${base} ${suffix}`))) suffix += 1;
  return `${base} ${suffix}`;
}

function nextStateName(diagram: StateDiagram, base: string = NEW_STATE_NAME): string {
  const taken = new Set(diagram.nodes.map((node) => node.id));
  if (!taken.has(slugify(base))) return base;
  let suffix = 2;
  while (taken.has(slugify(`${base} ${suffix}`))) suffix += 1;
  return `${base} ${suffix}`;
}

/**
 * State operations (spec S2). `model.ts` only owns the class families, so the
 * state machine mutations live here: same shape of `Result`, same id rule (the
 * id is the slug of the name), same "renaming rewrites every endpoint" rule.
 */
function addState(diagram: StateDiagram, name: string): Result<StateDiagram> {
  const trimmed = name.trim();
  if (!trimmed) return err("State name is empty");
  const slug = slugify(trimmed);
  if (diagram.nodes.some((node) => node.role === "state" && slugify(node.name) === slug)) {
    return err(`State "${trimmed}" already exists`);
  }
  const id = uniqueId(slug, diagram.nodes.map((node) => node.id));
  return ok({ ...diagram, nodes: [...diagram.nodes, { id, name: trimmed, x: 0, y: 0, role: "state" }] });
}

function renameState(diagram: StateDiagram, id: string, name: string): Result<StateDiagram> {
  const target = diagram.nodes.find((node) => node.id === id);
  if (!target) return err(`Unknown state "${id}"`);
  // A pseudo-state renders as a glyph, so it has no name to change.
  if (target.role !== "state") return ok(diagram);
  const trimmed = name.trim();
  if (!trimmed) return err("State name is empty");
  if (trimmed === target.name) return ok(diagram);
  const slug = slugify(trimmed);
  if (diagram.nodes.some((node) => node.id !== id && node.role === "state" && slugify(node.name) === slug)) {
    return err(`State "${trimmed}" already exists`);
  }
  if (slug === "initial" || slug === "final") return err(`"${trimmed}" is reserved for a pseudo-state`);

  const nextId = uniqueId(
    slug,
    diagram.nodes.filter((node) => node.id !== id).map((node) => node.id),
  );
  const nodes = diagram.nodes.map((node) => (node.id === id ? { ...node, id: nextId, name: trimmed } : node));
  const edges = diagram.edges.map((edge) => ({
    ...edge,
    source: edge.source === id ? nextId : edge.source,
    target: edge.target === id ? nextId : edge.target,
  }));
  return ok({ ...diagram, nodes, edges });
}

function deleteState(diagram: StateDiagram, id: string): StateDiagram {
  return {
    ...diagram,
    nodes: diagram.nodes.filter((node) => node.id !== id),
    edges: diagram.edges.filter((edge) => edge.source !== id && edge.target !== id),
  };
}

function moveState(diagram: StateDiagram, id: string, x: number, y: number): StateDiagram {
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => (node.id === id ? { ...node, x, y } : node)),
  };
}

function findState(diagram: StateDiagram, id: string): boolean {
  return diagram.nodes.some((node) => node.id === id);
}

function addTransition(diagram: StateDiagram, source: string, target: string): Result<StateDiagram> {
  if (!findState(diagram, source)) return err(`Transition from unknown state "${source}"`);
  if (!findState(diagram, target)) return err(`Transition to unknown state "${target}"`);
  const id = uniqueId(`${source}->${target}`, diagram.edges.map((edge) => edge.id));
  return ok({ ...diagram, edges: [...diagram.edges, { id, source, target, label: "" }] });
}

function updateTransition(diagram: StateDiagram, id: string, label: string): StateDiagram {
  return {
    ...diagram,
    edges: diagram.edges.map((edge) => (edge.id === id ? { ...edge, label } : edge)),
  };
}

function deleteTransition(diagram: StateDiagram, id: string): StateDiagram {
  return { ...diagram, edges: diagram.edges.filter((edge) => edge.id !== id) };
}

/**
 * The state twin of `mergeStructure` (spec S5/S6): a re-parse keeps the position
 * of every state that still exists and stacks the new ones below the diagram, so
 * `layoutNewNodes` only has to place those.
 */
function mergeStateStructure(
  parsed: StateDiagram,
  previous: StateDiagram,
): { diagram: StateDiagram; addedIds: string[] } {
  const known = new Map(previous.nodes.map((node) => [node.id, node]));
  const addedIds = parsed.nodes.filter((node) => !known.has(node.id)).map((node) => node.id);
  const box = previous.nodes.length > 0 ? bounds(previous) : { x: 0, y: 0, width: 0, height: 0 };

  let cursorY = box.y + box.height + 60;
  const nodes = parsed.nodes.map((node) => {
    const previousNode = known.get(node.id);
    if (previousNode) return { ...node, x: previousNode.x, y: previousNode.y };
    const size = measureState(node);
    const placed = { ...node, x: box.x, y: cursorY };
    cursorY += size.height + 40;
    return placed;
  });

  return { diagram: { ...parsed, nodes }, addedIds };
}

/** Keeps positions of the states that survive a re-parse; lays out the new ones. */
function withPositions(parsed: Diagram, previous: Diagram): Diagram {
  if (isStateDiagram(parsed) && isStateDiagram(previous)) {
    const merged = mergeStateStructure(parsed, previous);
    return layoutNewNodes(merged.diagram, merged.addedIds);
  }
  if (isErDiagram(parsed) && isErDiagram(previous)) {
    const merged = mergeStructure(parsed, previous);
    return layoutNewNodes(merged.diagram, merged.addedIds);
  }
  // The text declared the other family: nothing to preserve, lay it out whole.
  return layout(parsed);
}

/** Both families carry a title, but `model.setTitle` is class-only. */
function withTitle(diagram: Diagram, title: string): Diagram {
  return isErDiagram(diagram) ? setTitle(diagram, title) : { ...diagram, title };
}

export function DiagramEditor() {
  const [history, setHistory] = useState<History>(() => createHistory(defaultDiagram()));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const backup = useRef<Diagram | null>(null);

  const present = history.present;
  const text = draft && draft.base === present ? draft.text : serialize(present);
  const textError = draft && draft.base === present ? draft.error : null;

  // A client component is still prerendered, so storage is only touched after mount.
  useEffect(() => {
    const stored = readStorage(window.localStorage);
    if (stored) setHistory(createHistory(stored));
    backup.current = stored;
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) writeStorage(window.localStorage, present);
  }, [present, ready]);

  const apply = useCallback((next: Diagram, note: string | null = null) => {
    setHistory((current) => commit(current, next));
    setMessage(note);
  }, []);

  const doUndo = useCallback(() => setHistory((current) => undo(current)), []);
  const doRedo = useCallback(() => setHistory((current) => redo(current)), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (editing) return;
      if (!event.metaKey && !event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        doUndo();
        return;
      }
      if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        doRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [doUndo, doRedo]);

  /** Text is only allowed to change the model when it parses cleanly (spec S5). */
  const handleTextChange = useCallback(
    (raw: string) => {
      const parsed = parse(raw);
      if (!parsed.ok) {
        setDraft({ text: raw, base: present, error: parsed.error });
        return;
      }
      const next = withPositions(parsed.value, present);
      if (serialize(next) === serialize(present)) {
        setDraft({ text: raw, base: present, error: null });
        return;
      }
      setHistory((current) => commit(current, next));
      setDraft({ text: raw, base: next, error: null });
    },
    [present],
  );

  const handleAddElement = useCallback(() => {
    if (isStateDiagram(present)) {
      const result = addState(present, nextStateName(present));
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      const created = result.value.nodes[result.value.nodes.length - 1];
      apply(layoutNewNodes(result.value, [created.id]));
      setSelectedId(created.id);
      return;
    }
    const result = addNode(present, nextEntityName(present));
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    const created = result.value.nodes[result.value.nodes.length - 1];
    apply(layoutNewNodes(result.value, [created.id]));
    setSelectedId(created.id);
  }, [apply, present]);

  const handleDuplicateEntity = useCallback(
    (id: string) => {
      if (!isErDiagram(present)) return;
      const source = present.nodes.find((node) => node.id === id);
      if (!source) return;
      const result = addNode(present, nextEntityName(present, source.name));
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      const created = result.value.nodes[result.value.nodes.length - 1];
      const duplicated: ErDiagram = {
        ...result.value,
        nodes: result.value.nodes.map((node) =>
          node.id === created.id
            ? { ...node, x: source.x + 40, y: source.y + 40, fields: source.fields.map((field) => ({ ...field })) }
            : node,
        ),
      };
      apply(duplicated);
      setSelectedId(created.id);
    },
    [apply, present],
  );

  const handleRename = useCallback(
    (id: string, name: string) => {
      if (isStateDiagram(present)) {
        const renamed = renameState(present, id, name);
        if (!renamed.ok) {
          setMessage(renamed.error);
          return;
        }
        if (renamed.value === present) return;
        // The id follows the name, so the selection follows the id.
        const target = renamed.value.nodes.find((node) => node.role === "state" && node.name === name.trim());
        setSelectedId(target ? target.id : null);
        apply(renamed.value);
        return;
      }
      const result = renameNode(present, id, name);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      if (result.value !== present) {
        setSelectedId(result.value.nodes.find((node) => node.name === name.trim())?.id ?? null);
        apply(result.value);
      }
    },
    [apply, present],
  );

  const handleDelete = useCallback(
    (id: string) => {
      apply(isStateDiagram(present) ? deleteState(present, id) : deleteNode(present, id));
      setSelectedId(null);
    },
    [apply, present],
  );

  const handleConnect = useCallback(
    (source: string, target: string) => {
      const result = isStateDiagram(present) ? addTransition(present, source, target) : addEdge(present, source, target);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      apply(result.value);
      setSelectedId(result.value.edges[result.value.edges.length - 1].id);
    },
    [apply, present],
  );

  const handleMove = useCallback(
    (id: string, x: number, y: number) => {
      apply(isStateDiagram(present) ? moveState(present, id, x, y) : moveNode(present, id, x, y));
    },
    [apply, present],
  );

  const handleUpdateField = useCallback(
    (nodeId: string, index: number, patch: Partial<DiagramField>) => {
      if (!isErDiagram(present)) return;
      apply(updateField(present, nodeId, index, patch));
    },
    [apply, present],
  );

  const handleKind = useCallback(
    (kind: DiagramKind) => {
      if (kind === present.kind) return;
      // Spec S8: `er` <-> `uml` keeps converting the document; the state family
      // shares no element with the others, so entering or leaving it starts that
      // family's bundled sample instead of half-converting anything.
      if (kind === "state" || present.kind === "state") {
        apply(sampleById(SAMPLE_BY_KIND[kind]));
        setSelectedId(null);
        return;
      }
      if (!isClassDiagramKind(kind) || !isErDiagram(present)) return;
      apply(setKind(present, kind));
    },
    [apply, present],
  );

  const handleExport = useCallback(
    async (format: ExportFormat, theme: ExportTheme) => {
      if (format === "json") {
        downloadJson(present);
        setMessage("JSON descargado.");
        return;
      }
      const svg = toSvg(present, { theme });
      if (format === "svg") {
        downloadSvg(svg, fileNameFor(present, "svg"));
        setMessage(`SVG descargado (fondo ${theme === "dark" ? "oscuro" : "claro"}).`);
        return;
      }
      const scale = format === "png1" ? 1 : format === "png2" ? 2 : 3;
      setBusy(true);
      try {
        await downloadPng(svg, fileNameFor(present, "png"), scale);
        setMessage(`PNG ${scale}x descargado (fondo ${theme === "dark" ? "oscuro" : "claro"}).`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "No se pudo exportar el PNG.");
      } finally {
        setBusy(false);
      }
    },
    [present],
  );

  const handleImportFile = useCallback(
    async (file: File) => {
      const result = fromFile(await file.text());
      if (!result.ok) {
        setMessage(`No se importó: ${result.error}`);
        return;
      }
      apply(result.value, `Importado ${file.name}.`);
      setSelectedId(null);
    },
    [apply],
  );

  return (
    <div className="flex h-dvh flex-col bg-background">
      <Toolbar
        diagram={present}
        canUndo={canUndo(history)}
        canRedo={canRedo(history)}
        busy={busy}
        onUndo={doUndo}
        onRedo={doRedo}
        onTitle={(title) => apply(withTitle(present, title))}
        onKind={handleKind}
        onAddElement={handleAddElement}
        onLayout={() => apply(layout(present))}
        onLoadSample={(id) => {
          apply(sampleById(id));
          setSelectedId(null);
        }}
        onImportFile={handleImportFile}
        onExport={handleExport}
      />

      {message === null ? null : (
        <div
          role="status"
          className="border-b border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-200"
        >
          {message}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1">
          <DiagramCanvas
            diagram={present}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={handleMove}
            onConnect={handleConnect}
          />
        </main>

        <aside className="flex w-[380px] shrink-0 flex-col border-l border-border bg-card">
          <Tabs defaultValue="text" className="min-h-0 flex-1">
            <TabsList className="mx-3 mt-2 w-fit">
              <TabsTrigger value="text">Texto</TabsTrigger>
              <TabsTrigger value="inspector">Inspector</TabsTrigger>
            </TabsList>
            <TabsContent value="text" className="min-h-0 flex-1">
              <TextPanel value={text} error={textError} onChange={handleTextChange} />
            </TabsContent>
            <TabsContent value="inspector" className="min-h-0 flex-1">
              {isStateDiagram(present) ? (
                <StateInspector
                  diagram={present}
                  selectedId={selectedId}
                  onRenameState={handleRename}
                  onDeleteState={handleDelete}
                  onUpdateTransition={(edgeId, label) => apply(updateTransition(present, edgeId, label))}
                  onDeleteTransition={(edgeId) => {
                    apply(deleteTransition(present, edgeId));
                    setSelectedId(null);
                  }}
                />
              ) : (
                <Inspector
                  diagram={present}
                  selectedId={selectedId}
                  onRenameEntity={handleRename}
                  onDeleteEntity={handleDelete}
                  onDuplicateEntity={handleDuplicateEntity}
                  onAddField={(nodeId) => apply(addField(present, nodeId, createField()))}
                  onUpdateField={handleUpdateField}
                  onDeleteField={(nodeId, index) => apply(deleteField(present, nodeId, index))}
                  onUpdateEdge={(edgeId, patch) => apply(updateEdge(present, edgeId, patch))}
                  onDeleteEdge={(edgeId) => {
                    apply(deleteEdge(present, edgeId));
                    setSelectedId(null);
                  }}
                />
              )}
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
