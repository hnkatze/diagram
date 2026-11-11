import { parse } from "./dsl.ts";
import { layout } from "./layout.ts";
import { createDiagram } from "./model.ts";
import type { Diagram, DiagramKind, ErDiagram } from "./types.ts";
import { isErDiagram } from "./types.ts";

/**
 * Bundled content (spec S11). Samples are written in the DSL, so they double as
 * living documentation of the syntax and are parsed by the same code path.
 */

const ER_SAMPLE = `diagram er "Tienda"

entity Cliente {
  id int pk
  nombre text
  email text uk nullable
}

entity Pedido {
  id int pk
  cliente_id int fk
  fecha date
  total decimal
}

entity LineaPedido {
  id int pk
  pedido_id int fk
  producto_id int fk
  cantidad int
}

entity Producto {
  id int pk
  nombre text
  precio decimal
}

Cliente 1 -- 0..* Pedido : "realiza"
Pedido 1 -- 1..* LineaPedido : "contiene"
Producto 1 -- 0..* LineaPedido : "aparece en"
`;

const UML_SAMPLE = `diagram uml "Modelo de dominio"

entity Usuario {
  + id uuid pk
  + email text uk
  + nombre text
  # password_hash text
}

entity Pedido {
  + id uuid pk
  - usuario_id uuid fk
  + total decimal
  + creado_en timestamp
}

entity Pago {
  + id uuid pk
  + pedido_id uuid fk
  + metodo text
  + monto decimal nullable
}

entity Administrador {
  + permisos text
}

entity Direccion {
  + calle text
  + ciudad text
}

Usuario 1 -- 0..* Pedido : "realiza"
Pedido 1 -- 0..1 Pago : "se cobra con"
Usuario <|-- Administrador
Usuario *-- Direccion : "vive en"
`;

const STATE_SAMPLE = `diagram state "Ciclo del pedido"

initial
state Nuevo
state Pagado
state Enviado
state Entregado
final

Nuevo --> Pagado : "pagar [monto > 0] / emitir recibo"
Pagado --> Pagado : "reintentar"
Pagado --> Enviado : "despachar"
Enviado --> Entregado : "confirmar entrega"
Entregado --> final
`;

export const ER_SAMPLE_TEXT = ER_SAMPLE;
export const UML_SAMPLE_TEXT = UML_SAMPLE;
export const STATE_SAMPLE_TEXT = STATE_SAMPLE;

export interface Sample {
  id: string;
  label: string;
  kind: DiagramKind;
  text: string;
}

export const SAMPLES: readonly Sample[] = [
  { id: "er", label: "Tienda (ER)", kind: "er", text: ER_SAMPLE },
  { id: "uml", label: "Modelo de dominio (UML)", kind: "uml-class", text: UML_SAMPLE },
  { id: "estado", label: "Ciclo del pedido (estados)", kind: "state", text: STATE_SAMPLE },
];

function build(text: string): Diagram {
  const parsed = parse(text);
  // A broken bundled sample must never blank the editor. `layout` is
  // family-neutral and dispatches on `kind`, so each sample is positioned with
  // its own geometry.
  return parsed.ok ? layout(parsed.value) : layout(createDiagram("er", ""));
}

export function sampleById(id: string): Diagram {
  const sample = SAMPLES.find((candidate) => candidate.id === id);
  return sample ? build(sample.text) : build(ER_SAMPLE);
}

/** What a first visit shows, so the app is never an empty void. */
export function defaultDiagram(): ErDiagram {
  const sample = build(ER_SAMPLE);
  return isErDiagram(sample) ? sample : createDiagram("er", "");
}
