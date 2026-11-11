"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { Cardinality, DiagramField, ErDiagram, Visibility } from "@/lib/diagram/types";
import { CARDINALITIES, VISIBILITIES } from "@/lib/diagram/types";

export interface InspectorProps {
  diagram: ErDiagram;
  selectedId: string | null;
  onRenameEntity: (id: string, name: string) => void;
  onDeleteEntity: (id: string) => void;
  onDuplicateEntity: (id: string) => void;
  onAddField: (nodeId: string) => void;
  onUpdateField: (nodeId: string, index: number, patch: Partial<DiagramField>) => void;
  onDeleteField: (nodeId: string, index: number) => void;
  onUpdateEdge: (edgeId: string, patch: Partial<DiagramEdgePatch>) => void;
  onDeleteEdge: (edgeId: string) => void;
}

type DiagramEdgePatch = {
  label?: string;
  sourceCardinality?: Cardinality;
  targetCardinality?: Cardinality;
};

const CARDINALITY_LABELS: Record<Cardinality, string> = {
  "1": "1 (exactamente uno)",
  "0..1": "0..1 (opcional)",
  "1..*": "1..* (uno o varios)",
  "0..*": "0..* (muchos)",
};

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; text: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Inspector(props: InspectorProps) {
  const { diagram, selectedId } = props;
  const node = diagram.nodes.find((candidate) => candidate.id === selectedId);
  const edge = diagram.edges.find((candidate) => candidate.id === selectedId);

  if (!node && !edge) {
    return (
      <div className="flex h-full flex-col gap-2 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inspector</h2>
        <p className="text-xs leading-5 text-muted-foreground">
          Elegí una entidad o una relación en el canvas para editarla. Arrastrá desde el borde de una entidad hasta otra
          para crear una relación.
        </p>
      </div>
    );
  }

  if (edge) {
    const sourceName = diagram.nodes.find((candidate) => candidate.id === edge.source)?.name ?? edge.source;
    const targetName = diagram.nodes.find((candidate) => candidate.id === edge.target)?.name ?? edge.target;
    return (
      <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Relación</h2>
          <Button variant="destructive" size="xs" onClick={() => props.onDeleteEdge(edge.id)}>
            Eliminar
          </Button>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">
          {sourceName} → {targetName}
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Etiqueta</span>
          <Input
            value={edge.label}
            onChange={(event) => props.onUpdateEdge(edge.id, { label: event.target.value })}
            placeholder="realiza"
            className="h-8 text-xs"
          />
        </label>
        <Select
          label={`Cardinalidad en ${sourceName}`}
          value={edge.sourceCardinality}
          options={CARDINALITIES.map((cardinality) => ({ value: cardinality, text: CARDINALITY_LABELS[cardinality] }))}
          onChange={(value) => props.onUpdateEdge(edge.id, { sourceCardinality: value as Cardinality })}
        />
        <Select
          label={`Cardinalidad en ${targetName}`}
          value={edge.targetCardinality}
          options={CARDINALITIES.map((cardinality) => ({ value: cardinality, text: CARDINALITY_LABELS[cardinality] }))}
          onChange={(value) => props.onUpdateEdge(edge.id, { targetCardinality: value as Cardinality })}
        />
      </div>
    );
  }

  if (!node) return null;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entidad</h2>
        <div className="flex gap-1">
          <Button variant="outline" size="xs" onClick={() => props.onDuplicateEntity(node.id)}>
            Duplicar
          </Button>
          <Button variant="destructive" size="xs" onClick={() => props.onDeleteEntity(node.id)}>
            Eliminar
          </Button>
        </div>
      </div>

      <Label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
        Nombre
        <Input
          value={node.name}
          onChange={(event) => props.onRenameEntity(node.id, event.target.value)}
          className="h-8 text-xs"
        />
      </Label>

      <Separator />

      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Campos</h3>
        <Button variant="outline" size="xs" onClick={() => props.onAddField(node.id)}>
          + Campo
        </Button>
      </div>

      <ul className="flex flex-col gap-2">
        {node.fields.map((field, index) => (
          <li key={`${field.name}-${index}`} className="flex flex-col gap-1 rounded-md border border-border p-2">
            <div className="flex gap-1">
              <Input
                value={field.name}
                aria-label={`Nombre del campo ${index + 1}`}
                onChange={(event) => props.onUpdateField(node.id, index, { name: event.target.value })}
                className="h-7 flex-1 font-mono text-xs"
              />
              <Input
                value={field.type}
                aria-label={`Tipo del campo ${index + 1}`}
                onChange={(event) => props.onUpdateField(node.id, index, { type: event.target.value })}
                className="h-7 w-24 font-mono text-xs"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  ["pk", "PK"],
                  ["fk", "FK"],
                  ["uk", "UK"],
                  ["nullable", "NULL"],
                ] as const
              ).map(([flag, text]) => (
                <Button
                  key={flag}
                  size="xs"
                  variant={field[flag] ? "default" : "outline"}
                  aria-pressed={field[flag]}
                  onClick={() => props.onUpdateField(node.id, index, { [flag]: !field[flag] })}
                >
                  {text}
                </Button>
              ))}
              {diagram.kind === "uml-class" ? (
                <div className="ml-auto flex gap-1">
                  {VISIBILITIES.map((visibility) => (
                    <Button
                      key={visibility}
                      size="xs"
                      variant={field.visibility === visibility ? "default" : "outline"}
                      aria-pressed={field.visibility === visibility}
                      aria-label={`Visibilidad ${visibility}`}
                      onClick={() => props.onUpdateField(node.id, index, { visibility: visibility as Visibility })}
                    >
                      {visibility}
                    </Button>
                  ))}
                </div>
              ) : null}
              <Button
                size="xs"
                variant="destructive"
                aria-label={`Eliminar el campo ${index + 1}`}
                onClick={() => props.onDeleteField(node.id, index)}
              >
                ×
              </Button>
            </div>
          </li>
        ))}
        {node.fields.length === 0 ? <li className="text-xs text-muted-foreground">Sin campos todavía.</li> : null}
      </ul>
    </div>
  );
}
