"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { Cardinality, DiagramField, ErDiagram, StateDiagram, Visibility } from "@/lib/diagram/types";
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
  sourceCardinality?: Cardinality | null;
  targetCardinality?: Cardinality | null;
};

const CARDINALITY_LABELS: Record<Cardinality, string> = {
  "1": "1 (exactamente uno)",
  "0..1": "0..1 (opcional)",
  "1..*": "1..* (uno o varios)",
  "0..*": "0..* (muchos)",
};

/** An end with no stated cardinality, as every arrow relation has. */
const NO_CARDINALITY = "";
const CARDINALITY_OPTIONS = [
  { value: NO_CARDINALITY, text: "— (sin cardinalidad)" },
  ...CARDINALITIES.map((cardinality) => ({ value: cardinality, text: CARDINALITY_LABELS[cardinality] })),
];

/** "Sin cardinalidad" clears both ends: a relation states a cardinality on both or on neither. */
const cardinalityPatch = (end: "sourceCardinality" | "targetCardinality", value: string): DiagramEdgePatch =>
  value === NO_CARDINALITY ? { sourceCardinality: null, targetCardinality: null } : { [end]: value as Cardinality };


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

export interface StateInspectorProps {
  diagram: StateDiagram;
  selectedId: string | null;
  onRenameState: (id: string, name: string) => void;
  onDeleteState: (id: string) => void;
  onUpdateTransition: (id: string, label: string) => void;
  onDeleteTransition: (id: string) => void;
}

const ROLE_LABELS: Record<string, string> = {
  state: "Estado",
  initial: "Estado inicial",
  final: "Estado final",
};

/** Inspector of the state family: one state or one transition at a time. */
export function StateInspector(props: StateInspectorProps) {
  const { diagram, selectedId } = props;
  const node = diagram.nodes.find((candidate) => candidate.id === selectedId);
  const edge = diagram.edges.find((candidate) => candidate.id === selectedId);

  if (!node && !edge) {
    return (
      <div className="flex h-full flex-col gap-2 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inspector</h2>
        <p className="text-xs leading-5 text-muted-foreground">
          Elegí un estado o una transición en el canvas para editarla. Arrastrá desde el borde de un estado hasta otro
          para crear una transición.
        </p>
      </div>
    );
  }

  if (edge) {
    const sourceName = diagram.nodes.find((candidate) => candidate.id === edge.source);
    const targetName = diagram.nodes.find((candidate) => candidate.id === edge.target);
    const nameOf = (state: typeof sourceName, fallback: string): string =>
      !state ? fallback : state.role === "state" ? state.name : ROLE_LABELS[state.role];
    return (
      <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transición</h2>
          <Button variant="destructive" size="xs" onClick={() => props.onDeleteTransition(edge.id)}>
            Eliminar
          </Button>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">
          {nameOf(sourceName, edge.source)} → {nameOf(targetName, edge.target)}
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Etiqueta</span>
          <Input
            value={edge.label}
            onChange={(event) => props.onUpdateTransition(edge.id, event.target.value)}
            placeholder="evento [guarda] / acción"
            className="h-8 text-xs"
          />
          <span className="text-[11px] text-muted-foreground">Se guarda tal cual, sin separar evento, guarda y acción.</span>
        </label>
      </div>
    );
  }

  if (!node) return null;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {ROLE_LABELS[node.role] ?? "Estado"}
        </h2>
        <Button variant="destructive" size="xs" onClick={() => props.onDeleteState(node.id)}>
          Eliminar
        </Button>
      </div>

      {node.role === "state" ? (
        <Label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
          Nombre
          <Input
            value={node.name}
            onChange={(event) => props.onRenameState(node.id, event.target.value)}
            className="h-8 text-xs"
          />
        </Label>
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">
          Un pseudo-estado no se renombra: el inicial y el final se dibujan como glifo, sin texto.
        </p>
      )}
    </div>
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
          value={edge.sourceCardinality ?? NO_CARDINALITY}
          options={CARDINALITY_OPTIONS}
          onChange={(value) => props.onUpdateEdge(edge.id, cardinalityPatch("sourceCardinality", value))}
        />
        <Select
          label={`Cardinalidad en ${targetName}`}
          value={edge.targetCardinality ?? NO_CARDINALITY}
          options={CARDINALITY_OPTIONS}
          onChange={(value) => props.onUpdateEdge(edge.id, cardinalityPatch("targetCardinality", value))}
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
