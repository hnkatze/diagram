# Diagram editor (UML class + ER)

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
- `//` comments anywhere; `#` only outside an entity block, where `#` is the protected
  glyph. Blank lines are ignored. Quoted names and labels support `\"` escapes.

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
