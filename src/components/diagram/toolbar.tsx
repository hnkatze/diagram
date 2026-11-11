"use client";

import { useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SAMPLES } from "@/lib/diagram/samples";
import type { Diagram, DiagramKind } from "@/lib/diagram/types";

export type ExportFormat = "svg" | "png1" | "png2" | "png3";

export interface ToolbarProps {
  diagram: Diagram;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onTitle: (title: string) => void;
  onKind: (kind: DiagramKind) => void;
  onAddEntity: () => void;
  onLayout: () => void;
  onLoadSample: (id: string) => void;
  onImportFile: (file: File) => void;
  onExport: (format: ExportFormat) => void;
}

export function Toolbar(props: ToolbarProps) {
  const { diagram } = props;
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
      <Input
        value={diagram.title}
        onChange={(event) => props.onTitle(event.target.value)}
        placeholder="Título del diagrama"
        aria-label="Título del diagrama"
        className="h-8 w-56 text-sm font-semibold"
      />

      <div className="flex overflow-hidden rounded-md border border-slate-300">
        <Button
          size="xs"
          variant={diagram.kind === "er" ? "default" : "ghost"}
          aria-pressed={diagram.kind === "er"}
          onClick={() => props.onKind("er")}
          className="rounded-none"
        >
          ER
        </Button>
        <Button
          size="xs"
          variant={diagram.kind === "uml-class" ? "default" : "ghost"}
          aria-pressed={diagram.kind === "uml-class"}
          onClick={() => props.onKind("uml-class")}
          className="rounded-none"
        >
          UML
        </Button>
      </div>

      <Button size="xs" variant="outline" onClick={props.onAddEntity}>
        + Entidad
      </Button>
      <Button size="xs" variant="outline" onClick={props.onLayout}>
        Acomodar
      </Button>

      <div className="flex gap-1">
        <Button size="xs" variant="outline" disabled={!props.canUndo} onClick={props.onUndo} aria-label="Deshacer">
          ↶ Deshacer
        </Button>
        <Button size="xs" variant="outline" disabled={!props.canRedo} onClick={props.onRedo} aria-label="Rehacer">
          ↷ Rehacer
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <span className="mr-1 text-[11px] text-slate-400">Ejemplos:</span>
        {SAMPLES.map((sample) => (
          <Button key={sample.id} size="xs" variant="ghost" onClick={() => props.onLoadSample(sample.id)}>
            {sample.id.toUpperCase()}
          </Button>
        ))}

        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) props.onImportFile(file);
            event.target.value = "";
          }}
        />
        <Button size="xs" variant="outline" onClick={() => fileInput.current?.click()}>
          Importar
        </Button>

        <Dialog>
          <DialogTrigger render={<Button size="xs" disabled={props.busy}>Exportar imagen</Button>} />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Exportar imagen</DialogTitle>
              <DialogDescription>
                Se exporta el diagrama completo, no sólo lo que se ve en pantalla. SVG es vectorial; PNG se rasteriza a
                1x, 2x o 3x.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => props.onExport("svg")}>
                SVG (vectorial)
              </Button>
              <Button variant="outline" onClick={() => props.onExport("png1")}>
                PNG 1x
              </Button>
              <Button variant="outline" onClick={() => props.onExport("png2")}>
                PNG 2x
              </Button>
              <Button variant="outline" onClick={() => props.onExport("png3")}>
                PNG 3x
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
}
