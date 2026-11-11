"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parse, serialize } from "@/lib/diagram/dsl";
import { downloadJson, downloadPng, downloadSvg, fileNameFor } from "@/lib/diagram/export-image";
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from "@/lib/diagram/history";
import { layout, layoutNewNodes } from "@/lib/diagram/layout";
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
  updateEdge,
  updateField,
} from "@/lib/diagram/model";
import { fromFile, readStorage, writeStorage } from "@/lib/diagram/persistence";
import { defaultDiagram, sampleById } from "@/lib/diagram/samples";
import { toSvg } from "@/lib/diagram/svg";
import type { Diagram, DiagramField } from "@/lib/diagram/types";
import { DiagramCanvas } from "./canvas";
import { Inspector } from "./inspector";
import { TextPanel } from "./text-panel";
import { Toolbar, type ExportFormat } from "./toolbar";

/**
 * The editing surface (spec S1). One `History` of `Diagram` snapshots is the
 * only source of truth; the canvas and the text panel are both projections of
 * `history.present`.
 */

interface Draft {
  text: string;
  /** The snapshot this draft was typed against; a newer snapshot invalidates it. */
  base: Diagram;
  error: string | null;
}

const NEW_ENTITY_NAME = "Entidad";

function nextEntityName(diagram: Diagram, base: string = NEW_ENTITY_NAME): string {
  const taken = new Set(diagram.nodes.map((node) => slugify(node.name)));
  if (!taken.has(slugify(base))) return base;
  let suffix = 2;
  while (taken.has(slugify(`${base} ${suffix}`))) suffix += 1;
  return `${base} ${suffix}`;
}

export function DiagramEditor() {
  const [history, setHistory] = useState<History>(() => createHistory(defaultDiagram()));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const backup = useRef<Diagram | null>(null);

  const diagram = history.present;
  const text = draft && draft.base === diagram ? draft.text : serialize(diagram);
  const textError = draft && draft.base === diagram ? draft.error : null;

  // A client component is still prerendered, so storage is only touched after mount.
  useEffect(() => {
    const stored = readStorage(window.localStorage);
    if (stored) setHistory(createHistory(stored));
    backup.current = stored;
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) writeStorage(window.localStorage, diagram);
  }, [diagram, ready]);

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

  /** Text is only allowed to change the model when it parses cleanly (spec S6). */
  const handleTextChange = useCallback(
    (raw: string) => {
      const parsed = parse(raw);
      if (!parsed.ok) {
        setDraft({ text: raw, base: diagram, error: parsed.error });
        return;
      }
      const merged = mergeStructure(parsed.value, diagram);
      const next = layoutNewNodes(merged.diagram, merged.addedIds);
      if (serialize(next) === serialize(diagram)) {
        setDraft({ text: raw, base: diagram, error: null });
        return;
      }
      setHistory((current) => commit(current, next));
      setDraft({ text: raw, base: next, error: null });
    },
    [diagram],
  );

  const handleAddEntity = useCallback(() => {
    const result = addNode(diagram, nextEntityName(diagram));
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    const created = result.value.nodes[result.value.nodes.length - 1];
    apply(layoutNewNodes(result.value, [created.id]));
    setSelectedId(created.id);
  }, [apply, diagram]);

  const handleDuplicateEntity = useCallback(
    (id: string) => {
      const source = diagram.nodes.find((node) => node.id === id);
      if (!source) return;
      const result = addNode(diagram, nextEntityName(diagram, source.name));
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      const created = result.value.nodes[result.value.nodes.length - 1];
      const duplicated: Diagram = {
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
    [apply, diagram],
  );

  const handleRenameEntity = useCallback(
    (id: string, name: string) => {
      const result = renameNode(diagram, id, name);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      if (result.value !== diagram) {
        setSelectedId(result.value.nodes.find((node) => node.name === name.trim())?.id ?? null);
        apply(result.value);
      }
    },
    [apply, diagram],
  );

  const handleDeleteEntity = useCallback(
    (id: string) => {
      apply(deleteNode(diagram, id));
      setSelectedId(null);
    },
    [apply, diagram],
  );

  const handleConnect = useCallback(
    (source: string, target: string) => {
      const result = addEdge(diagram, source, target);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      apply(result.value);
      setSelectedId(result.value.edges[result.value.edges.length - 1].id);
    },
    [apply, diagram],
  );

  const handleUpdateField = useCallback(
    (nodeId: string, index: number, patch: Partial<DiagramField>) => apply(updateField(diagram, nodeId, index, patch)),
    [apply, diagram],
  );

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (format === "json") {
        downloadJson(diagram);
        setMessage("JSON descargado.");
        return;
      }
      const svg = toSvg(diagram);
      if (format === "svg") {
        downloadSvg(svg, fileNameFor(diagram, "svg"));
        setMessage("SVG descargado.");
        return;
      }
      const scale = format === "png1" ? 1 : format === "png2" ? 2 : 3;
      setBusy(true);
      try {
        await downloadPng(svg, fileNameFor(diagram, "png"), scale);
        setMessage(`PNG ${scale}x descargado.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "No se pudo exportar el PNG.");
      } finally {
        setBusy(false);
      }
    },
    [diagram],
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
        diagram={diagram}
        canUndo={canUndo(history)}
        canRedo={canRedo(history)}
        busy={busy}
        onUndo={doUndo}
        onRedo={doRedo}
        onTitle={(title) => apply(setTitle(diagram, title))}
        onKind={(kind) => apply(setKind(diagram, kind))}
        onAddEntity={handleAddEntity}
        onLayout={() => apply(layout(diagram))}
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
            diagram={diagram}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={(id, x, y) => apply(moveNode(diagram, id, x, y))}
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
              <Inspector
                diagram={diagram}
                selectedId={selectedId}
                onRenameEntity={handleRenameEntity}
                onDeleteEntity={handleDeleteEntity}
                onDuplicateEntity={handleDuplicateEntity}
                onAddField={(nodeId) => apply(addField(diagram, nodeId, createField()))}
                onUpdateField={handleUpdateField}
                onDeleteField={(nodeId, index) => apply(deleteField(diagram, nodeId, index))}
                onUpdateEdge={(edgeId, patch) => apply(updateEdge(diagram, edgeId, patch))}
                onDeleteEdge={(edgeId) => {
                  apply(deleteEdge(diagram, edgeId));
                  setSelectedId(null);
                }}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
