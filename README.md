# Diagram editor (UML class, ER and state)

A single-page editor for entity-relationship (`er`) and UML class (`uml-class`) diagrams.
The same diagram is authored from two synchronized surfaces: a React Flow canvas and a
text panel in a project DSL. Canvas edits rewrite the text, valid text edits redraw the
canvas, both read and write one `Diagram` model, and the result exports to PNG, SVG or JSON.
The app is dark-only by design: the screen and the exported image share one palette.

## Stack

- Next.js 16.4.6 (App Router, client-only — no backend, no database), React 19, TypeScript
- Tailwind CSS 4 + shadcn/ui (`base-nova` style, `@base-ui/react`)
- `@xyflow/react` 12 for the canvas, `@dagrejs/dagre` for automatic layout
- `node --test` for unit tests over the pure modules in `src/lib/diagram`

## Run it

```bash
npm install
npm run dev       # http://localhost:3000
npm test          # node --test — DSL, model, layout, SVG, export, persistence
npm run build     # production build
npm run typecheck # tsc --noEmit
```

Open the dev server as **`http://localhost:3000`** — not `127.0.0.1` and not the LAN IP.
Next 16 blocks the `/_next/hmr` socket for any other origin, and the page then renders
without hydrating: the canvas shows no relations and nothing is autosaved. `npm start`
(production) is not affected by this gate.

## The DSL

The panel text is the canonical structural form of the diagram; positions live in the
model only, never in the text.

```
diagram er "Tienda"

entity Usuario {
  id int pk
  email text uk nullable
  nombre text
}

entity Pedido {
  id int pk
  usuario_id int fk
  total decimal
}

Usuario 1..* -- 0..1 Pedido : "realiza"
```

- `diagram <kind> "<title>"` opens the file; optional (defaults to `er`, empty title).
- `entity <Name> { ... }` holds one field per line: `<visibility?> <name> <type> <flags...>`.
  Visibility is `+` (public, the default), `-` (private) or `#` (protected); flags are any of
  `pk`, `fk`, `uk`, `nullable`, in any order and freely combinable.
- A relation is `<From> <card> -- <card> <To> : "<label>"`; the label and its `: "..."`
  part are optional. Cardinalities are `1`, `0..1`, `1..*`, `0..*`. Self-relations are allowed.
- A relation can also be written with an arrow, `<From> <arrow> <To>`, which states no
  cardinality. The arrow names the relation and where its marker is drawn:

  | Arrow | Relation | Marker |
  |-------|----------|--------|
  | `--` | association | plain line |
  | `-->` | directed association | open arrow at `<To>`, solid line |
  | `<\|--` | generalization | hollow triangle at `<From>` (the parent) |
  | `<..` | realization | hollow triangle at `<From>` (the interface), dashed line |
  | `*--` | composition | filled diamond at `<From>` (the whole) |
  | `o--` | aggregation | hollow diamond at `<From>` (the whole) |
  | `..>` | dependency | open arrow at `<To>`, dashed line |

  ```
  diagram uml "Animales"

  entity Animal {
    + nombre text
  }

  entity Perro {
    + raza text
  }

  Animal <|-- Perro : "es un"
  ```

  Both forms work in every class diagram, so an existing `er` document is unchanged.
- `//` comments anywhere; `#` only outside an entity block, where `#` is the protected
  glyph. Blank lines are ignored. Quoted names and labels support `\"` escapes.

### Containers

`package <Name> { ... }` and `region <Name> { ... }` open a container: a titled rectangle that
holds other nodes. A `package` carries a folder tab; a `region` is a plain titled rectangle.
Entities declared inside the block belong to that container.

```
diagram uml "Ventas"

package Ventas {
  entity Pedido {
    id int pk
    total decimal
  }
  entity Item {
    id int pk
  }
}

region Logistica {
  entity Envio {
    id int pk
  }
}

Pedido 1 -- 0..* Item
Pedido 1 -- 0..1 Envio : "se despacha"
```

- Containers hold nodes but do not nest: a container inside another container is refused.
- The editor writes the text back with two spaces per level; when you write it, indentation is
  not significant.
- Relation lines stay outside the blocks and can connect entities that live in different
  containers, as `Pedido` and `Envio` do above.

### State diagrams

`diagram state "..."` swaps entities and relations for states and transitions. Same panel,
same sync, same export:

```
diagram state "Ciclo del pedido"

initial
state Nuevo
state Pagado
final

Nuevo --> Pagado : "pagar [monto > 0] / emitir recibo"
Pagado --> Pagado : "reintentar"
Pagado --> final
```

- `initial` declares the single initial pseudo-state; a second one is an error.
- `final` declares a final pseudo-state and may repeat.
- `state <Name>` declares a state; names are unique and the id is the slug of the name.
- `<From> --> <To> : "<label>"` declares a transition. The label is free text stored
  verbatim — `evento [guarda] / acción` is not parsed into parts.
- Switching between `er` and `uml` converts the open document; switching to or from `state`
  loads that family's example, because the families share no elements.

While the text is invalid the model is untouched, the canvas keeps the last valid diagram and
the panel shows the error with its line number.

## Editing

- Canvas: click to select, drag to move, drag from a node handle to another node to create
  a relation. The inspector edits the selected entity or relation.
- Toolbar: title, diagram kind (`ER` / `UML`), `+ Entidad`, `Acomodar` (re-run the dagre
  layout), undo/redo, the two bundled samples, `.json` import and export.
- Shortcuts: `Ctrl/Cmd+Z` undo, `Shift+Ctrl/Cmd+Z` or `Ctrl+Y` redo; ignored while a
  text field has focus.
- The diagram autosaves to `localStorage`, is restored on reload, and a first visit shows
  the bundled ER sample.

## Export

`Exportar imagen` exports the whole diagram, not the visible viewport:

- `SVG` — vector output from the pure `toSvg(diagram, options)` serializer.
- `PNG 1x / 2x / 3x` — that same SVG rasterized in the browser at the chosen scale.
- `JSON` — re-openable copy of the model, written by `toFile()`.

The export dialog has a **Fondo del archivo** switch (`Oscuro` / `Claro`) that applies to every
format. The app shell is always dark, so this only decides what the delivered file looks like:
`Oscuro` matches the screen, `Claro` is what you want for a document or a print.

The file name is the slug of the diagram title (`untitled` when empty). The image has a solid
background, the title, every entity with its fields, and every relation with label and cardinalities.
The relation markers (triangles, diamonds, open arrows and dashed lines) appear in the exported image too.
Containers are drawn as well, each with its title, and the light theme keeps them.

`toSvg` paints the dark palette by default, so the exported file matches the screen;
`toSvg(diagram, { theme: "light" })` is the light version, and an explicit `background` option still
overrides either palette.

### JSON (round trip)

`Exportar JSON` next to `Importar` downloads the same `{ version: 1, diagram }` document the app
autosaves, built by `persistence.toFile` and named `<title slug>.json` (`untitled.json` when the
title is empty). Nothing is re-serialised for the download, so an exported file imports back into
an identical diagram — positions and all. Importing an invalid file shows a message and leaves the
current diagram untouched.

So: `SVG` and `PNG 1x/2x/3x` are for sharing a picture, JSON is for sharing the editable diagram.
