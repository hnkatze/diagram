"use client";

import { Textarea } from "@/components/ui/textarea";

export interface TextPanelProps {
  value: string;
  error: string | null;
  onChange: (value: string) => void;
}

export function TextPanel({ value, error, onChange }: TextPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Código</h2>
        <span className="text-[11px] text-slate-400">sincronizado con el canvas</span>
      </div>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        aria-label="Diagrama en texto"
        aria-invalid={error !== null}
        className="min-h-0 flex-1 resize-none rounded-md font-mono text-xs leading-5"
      />
      {error === null ? (
        <p className="text-[11px] text-slate-400">El canvas no cambia mientras el texto tenga errores.</p>
      ) : (
        <p role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1 font-mono text-[11px] text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
