# Hybrid diagram editor (UML class + ER)

Single-route Next.js 16 app. One diagram model, two synchronized authoring surfaces: a React Flow canvas and a text panel in a project DSL. Exports PNG/SVG.

Kind values: `er` (entity-relationship) and `uml-class` (UML class diagram). No other UML kinds in v1.

## Specs

**S1 — Two synchronized authoring surfaces.** The app authors ONE diagram through a canvas and a text panel that stay in sync. Canvas edits update the text; valid text edits update the canvas. Neither surface holds state of its own: both read and write a single `Diagram` model.

**S2 — Two diagram kinds.** The model has a `kind` of `er` or `uml-class`, switchable without losing entities, fields or relations. `kind` only changes rendering (key badges vs visibility glyphs) and the DSL header keyword (`diagram er "..."` / `diagram uml "...)"`).

**S3 — Blocks (entities).** An entity has a required unique `name` and ordered `fields`. A field is `{ name, type, visibility, pk, fk, uk, nullable }` where `visibility` is `+`, `-` or `#` (default `+`), and `pk`/`fk`/`uk`/`nullable` are independent booleans (a field may be both `pk` and `fk`). Entities can be created, renamed, duplicated, deleted, and dragged on the canvas. Renaming an entity is refused when the resulting slug collides with another entity.

**S4 — Relations.** A relation connects two entities with a `label` (may be empty) and a cardinality at each end, each one of `1`, `0..1`, `1..*`, `0..*`. Cardinality is rendered as text adjacent to each end, in both the canvas and the exported image. Self-relations (both ends the same entity) are allowed. A relation referencing an entity name that does not exist is a parse error, not a silently dropped edge.

**S5 — Text DSL, 1:1 with the model.** The panel text is the canonical structural form of the diagram:

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

Rules: `diagram <kind> "<title>"` opens the file and is optional (defaults to `er` with an empty title); `entity <Name> { ... }` one field per line as `<visibility?> <name> <type> <flags...>`; flags are any of `pk fk uk nullable` in any order; `//` starts a line comment anywhere, and `#` starts a line comment only outside an entity block because inside a block `#` is the protected-visibility glyph; blank lines are ignored. A relation line is `<From> <card> -- <card> <To> : "<label>"` where the label and the `: "<label>"` part are optional. Quoted names and labels support `\"` escapes.

**S6 — Parse safety.** `parse(serialize(d))` reconstructs `d` exactly for structure (kind, title, entity order, names, field order and flags, relation order, endpoints, cardinality, labels). While the text is invalid, the canvas keeps rendering the last valid model, the panel shows the error message with its line number, and the model is not mutated.

**S7 — Positions survive text edits.** Positions live in the model (`x`, `y`) and are NOT written to the DSL. After a text edit, entities that still exist keep their position; new entities are placed by the automatic layout; deleted entities' relations are removed. Entity ids are the slug of the name (lowercase, `[a-z0-9-]`, collisions get `-2`, `-3`, ...) so the round trip is stable.

**S8 — Automatic layout.** A `Layout` action and first-time placement of new entities use dagre, direction top to bottom, with node sizes from `measureNode` so the canvas and the exported image agree on geometry. Layout is deterministic: the same model yields the same coordinates.

**S9 — Export an image.** The toolbar exports the WHOLE diagram, not just the visible viewport: `PNG` at 1x, 2x or 3x, and `SVG`. Chosen file name is the diagram title slug (`untitled` when empty). The exporter is a pure function `toSvg(diagram, options) -> string`; PNG is produced in the browser by rasterizing that SVG at the chosen scale. The exported image has a solid background, the title, every entity with its fields, and every relation with its label and both cardinalities.

**S10 — Persistence.** The current diagram autosaves to `localStorage` and is restored on reload; corrupt or absent storage falls back to the bundled sample without an error screen. The toolbar imports and exports the diagram as a `.json` file (`{ version: 1, diagram }`); importing an invalid file shows a message and leaves the current diagram untouched. Undo/redo (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z) covers every model mutation.

**S11 — Ships with content.** Two bundled samples, one `er` and one `uml-class`, loadable from the toolbar; the `er` sample is what a first visit shows so the app is never an empty void.

**S12 — Dark is the only theme.** The app always renders dark: no theme toggle and no `prefers-color-scheme` branch, the `dark` class is set on the document root and `color-scheme: dark` is declared so browser-native controls, selects and scrollbars match. Every surface (canvas, entity nodes, relation edges, text panel, inspector, toolbar, dialogs, React Flow controls) uses the shared shadcn semantic tokens (`background`, `foreground`, `card`, `muted`, `border`, `input`, `primary`, `destructive`) and never a hardcoded `slate`/`gray`/`zinc` step. The exported image uses the same dark palette by default (`toSvg` gains an optional `theme`, default `dark`) so the file matches the screen, while `theme: "light"` remains available for print.

## Tasks

| ID | Task | Specs | Route | Commit |
|----|------|-------|-------|--------|
| T1 | Model + geometry contract (`types.ts`, `measure.ts`, `model.ts`) | S2, S3, S4, S7, S8 | inline | `31446a4` |
| T2 | DSL parser + serializer + tests | S5, S6, S7 | inline | `31446a4` |
| T3 | SVG exporter + tests | S9 | inline | `74206e1` |
| T4 | dagre layout + tests | S8 | inline | `74206e1` |
| T5 | Canvas: entity nodes, relation edges, toolbar shell | S1, S3, S4 | inline | `5d31dd9` |
| T6 | Text panel + sync + error surface | S1, S6, S7 | inline | `3265067` |
| T7 | Export UI (PNG 1x/2x/3x, SVG), persistence, undo/redo, JSON import | S9, S10 | inline | `ff3c1f0` + `3265067` |
| T8 | Samples, first-run state, README, build + server verification | S11 | worker | `29320bb` |
| T9 | Dark everywhere (S12) plus the JSON export the toolbar is still missing (S10 gap found by T8) | S10, S12 | worker | pending |
| T10 | Browser verification of the dark shell, typefaces and layout | S12 | inline | pending |
| T11 | Edge endpoints on the box border from shared geometry, so relation cardinalities are never hidden by an entity | S4, S9, S12 | worker | pending |
| T12 | Export background switch (dark or light) for SVG and PNG | S9 | inline | pending |
| T14 | Accept the standard `*` cardinality shorthand at input boundaries and name the failing relation in the error | S5, S10 | inline | pending |
| T13 | Diagnose the "missing relation edges" report after T11: not a code regression — the dev server refuses `/_next/hmr` on `127.0.0.1`, the client never hydrates, and only the SSR markup is measured | S4 | worker | no code change |

## Log

L1 (user, verbatim): "quiero construir algo para generar diagramas uml y ER que pueda crear los bloques y eso y al final sacar una imagen"

L2 (user choice, verbatim option label): "Híbrido: canvas + panel de código" — "El canvas visual y un panel de texto sincronizados (editás uno, se refleja el otro). Lo mejor de ambos, pero es ~2x el trabajo inicial."

L3 (decision, parent): single-route client-only app on Next.js 16.4.6 + React 19, no backend and no database in v1. Rationale: the whole value is local authoring and image export; a server would add cost without changing behaviour.

L4 (decision, parent): the model is the single source of truth and the DSL is its canonical structural projection; positions stay in the model and out of the DSL, because writing coordinates into text makes the panel unreadable and the round trip unstable.

L5 (decision, parent): image export goes through a pure `model -> SVG` serializer rasterized in the browser, instead of screenshotting the DOM (html-to-image/foreignObject). Rationale: deterministic, unit-testable, full control of fonts and background, and independent of the visible viewport.

L6 (decision, parent): field `pk`/`fk`/`uk`/`nullable` are independent booleans rather than a single `key` enum, because a field can legitimately be both a primary and a foreign key.

L7 (correction, parent): implementing S5 surfaced a conflict between the `#` line comment and the `#` protected-visibility glyph — `# password_hash text` was being swallowed as a comment. S5 now scopes `#` comments to lines outside an entity block; inside a block only `//` comments out. Pinned by a round-trip test.

L8 (user, verbatim): "solo falta que los estilos tengan sentido, pongamos darkmode siempre en este proyecto pls"

L9 (decision, parent): L8 resolves to one permanent dark theme rather than a theme toggle, and the exported image follows it by default so the file matches the screen; `theme: "light"` stays as an explicit export option for print.

L10 (evidence, T8): `npm run build` exit 0 on Next 16.4.6 + Turbopack with `.ts`-extension relative imports, CSS imported from a client component and the shadcn CSS imports; `npm test` 82/82; dev server answered 200 with the editor shell. T8 also found that spec S10 requires JSON **export** from the toolbar and only JSON **import** was wired — reopened as part of T9.

L11 (defect, parent, found in the browser): relation endpoints were anchored to fixed `Right`/`Left` handles, so an edge leaving a box's right handle towards a target on the left runs back across its own box and the source cardinality renders underneath the entity. Verified in the DOM: the `1` element measured at x 407..411 while the entity box ended at x 412. The exported SVG never had this bug because it clips the line to the rectangle. Decision: move the border-intersection maths into the shared geometry module and use it on the canvas too, so both surfaces resolve endpoints the same way instead of teaching the canvas a second rule.

L12 (user, verbatim): "que podamos exportar los modelos en white o dark que tengamos esa opcion pls"

L13 (decision, parent): the export background becomes an explicit choice in the export dialog (`Oscuro` default, `Claro` for documents and print), applied to SVG and PNG alike. The app shell stays dark — the switch describes the delivered file, not the editor.

L14 (evidence, T13): the report that `cdc9a97` made the relation edges vanish does not reproduce as a code defect.At HEAD with a healthy dev server, `127.0.0.1:3000` yields 0 `.react-flow__edge`, an identity viewport transform, no `__reactFiber` key on `.react-flow` and no `diagram-editor:v1` in `localStorage` — that is the *server-rendered* page, i.e. no hydration at all — while `localhost:3000` and `foo.localhost:3000` on the same server hydrate and return 3 edges, 3 paths and 4369 bytes of autosave. `192.168.1.3:3000` fails like `127.0.0.1`. Next 16's `blockCrossSiteDEV` (`node_modules/next/dist/server/lib/router-utils/block-cross-site-dev.js`) 403s `/_next/*` dev resources whose origin is not in `['**.localhost', 'localhost', ...allowedDevOrigins]`; the only blocked request is `ws://…/_next/hmr` (`ERR_INVALID_HTTP_RESPONSE`), and blocking that same socket on `localhost` through CDP reproduces the identical dead state, so the failed dev socket is what stops the client before `hydrateRoot`. The served HTML is byte-identical for both hosts, so the page itself is not the difference. The production server (`next start` on `127.0.0.1:3100`) renders 3 edges, 9 relation labels, autosave present and 0 console errors, which closes the question of a T11 regression: `useInternalNode` inside a custom edge is legal in @xyflow/react 12 and keeps endpoints on the border while a node is dragged (Pedido moved 253,364 → 454,294, every endpoint still `out: 0`, `coveredBy: []`). Remedy is one line in `next.config.ts` — `allowedDevOrigins` — which is outside T13's allowed edit surfaces.

L15 (decision, user): the user chose not to touch `next.config.ts`. Development happens on `http://localhost:3000`; the constraint is documented in the README together with the fact that `npm start` is unaffected. Verdict on T13: no code change, and the earlier "edges do not render" claim was a measurement error on an unhydrated page, not a defect.

L16 (user report + fix, T14): `modelo-clases-mercadito.json` was refused with a bare "The diagram contains an invalid relation". The file is well formed (envelope, 16 entities, 14 relations); four of its relations spell the target cardinality as `*`, the standard UML shorthand for "many". `readEdge` only accepted the four canonical values, so one shorthand rejected the whole document, and the message named neither the relation nor the value. Fix: `normalizeCardinality` on both input boundaries (JSON import and DSL parse) maps `*` to `0..*` while the model stays canonical, and the reader error now names the relation and the offending value. Verified against the real file: it imports as 16 entities and 14 relations.
