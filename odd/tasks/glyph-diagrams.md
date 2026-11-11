# Glyph diagrams (use case, component, communication)

Three UML families whose nodes carry a name and a glyph and nothing else. They share one model family because they share one shape: a node with no fields, an edge with no cardinality, dagre for layout. Adding them as roles on `ErNode` would make a field-bearing actor and a cardinality-bearing link representable — the exact trap the union exists to prevent.

## Specs

**S1 — A third family, not more roles on the class one.** `Diagram` becomes `ErDiagram | StateDiagram | GlyphDiagram`, discriminated by `kind`, where `GlyphDiagram.kind` is `"use-case" | "component" | "communication"`. A glyph node is `{ id, name, x, y, role }` and a glyph edge is `{ id, source, target, relation, label }`. The family has no `fields` and no cardinalities, because no node in it has either. Every existing kind keeps working, and a test file may receive type-annotation-only edits, never a changed assertion.

**S2 — Each kind declares its own roles.** `use-case` declares `actor` and `usecase`; `component` declares `component` and `interface`; `communication` declares `object`. A role the kind does not declare is refused, naming the node and the role. The system boundary of a use case diagram is a `region` container, not a node — the container primitive already draws it.

**S3 — Each kind declares its own relations.** All three accept `association`, `directed-association`, `generalization`, `realization` and `dependency`. `composition` and `aggregation` are refused in this family, naming the kind: a use case diagram does not own its actors. The arrow tokens are the ones the class family already parses, so there is one arrow grammar in the whole app.

**S4 — The DSL names the node, not the kind.** `diagram use-case "..."`, `diagram component "..."` and `diagram communication "..."` open the document. Nodes are declared with their role keyword — `actor Ana`, `usecase Pagar`, `component Servicio`, `interface Pago`, `object pedido1` — one per line, no braces, because there are no members. `region` and `package` blocks still nest, so a system boundary and a component grouping need nothing new. A stereotype is label text, not a second notation: `Pagar ..> Validar : "«include»"`.

**S5 — One glyph per role, one measurement module.** `measure.ts` gains the glyph measurement and every renderer consumes it, so the canvas and the exported image agree on the size of an actor, an oval, a component box, a lollipop and an object box. Export and canvas both draw: a stick figure for `actor`, an oval for `usecase`, a box with the `«component»` keyword for `component`, a circle on a stem for `interface`, and a plain box with an underlined label for `object` — the label is free text, because the DSL has no `: type` separator, so the instance notation travels in a quoted name (`object "pedido1 : Pedido"`). The underline is what marks the node as an instance, not a type field only one role would read.

**S6 — Layout is shared.** Glyph diagrams lay out with the same dagre pass and the same determinism guarantee, containers included. No new layout strategy.

**S7 — Persistence is the same envelope.** `{ version: 1, diagram }` with the new kinds; a reader refuses an unknown role or relation naming the node and the value, and a file written by an older build still imports.

**S8 — Shared behaviour keeps working.** Autosave, undo/redo, kind switching, text sync, the light/dark export switch and the copy-JSON action all apply to the new kinds. Switching between two glyph kinds starts that kind's sample, the same rule the state family uses when it cannot convert elements.

## Tasks

| ID | Task | Specs | Route | Commit |
|----|------|-------|-------|--------|
| T1 | The glyph family in the model, the DSL and persistence, with the `use-case` kind rendered on both surfaces | S1-S8 | worker | `64d94d4` |
| T2 | `component`: the kind, its two roles and their glyphs | S2, S5 | worker | `bda10f4` |
| T3 | `communication`: the kind, its object glyph and numbered message labels | S2, S3, S5 | worker | `bda10f4` |
| T4 | README for the three kinds and the verification pass | S8 | inline | `ee658e7` |

## Log

L1 (user, verbatim): "vamos a hacer casos de uso, componente, y comunicacion los pdoemos agregar pls"

L2 (decision, parent): one new family for the three kinds instead of three families or three node roles on `ErNode`. Their node and edge shapes are identical, and only the allowed roles and the drawn glyph differ, so one type plus a per-kind role check expresses them without making an actor with fields representable. Three families would have triplicated measure, layout, persistence and DSL code.

L3 (decision, parent): delivered as three slices — use case, then component, then communication — one commit each, because each slice is a reviewable unit and the first one carries the family foundation the other two extend.

L4 (correction, parent): S5 promised an object header of `name : type`, but the DSL has no `: type` separator and the parser refuses one. Adding an optional `type` field that only the `object` role would ever read is the optional-field smell this family exists to avoid, so the label stays free text and the instance notation travels in a quoted name: `object "pedido1 : Pedido"`. The underline is what marks the node as an instance.

L5 (evidence, T1-T4): the family and the three kinds landed in three commits. `64d94d4` added the third family, the per-kind role and relation tables, the nested DSL with `actor`/`usecase` node lines, persistence, `measureGlyph`, the generalized container geometry, dagre layout and the stick figure and oval on both surfaces — 199 to 223 tests. It also made canvas editing work for the new family instead of falling back to "edit from the text": `addNode` and `addEdge` were generalized over `NestedDiagram`, and the kind selector now offers six kinds, each one starting its own bundled sample, because borrowing the ER sample would have put fields and cardinalities inside a use case document. `bda10f4` drew `component` (keyword plus two edge tabs), `interface` (lollipop) and `object` (underlined label), 223 to 229. `ee658e7` documented the three kinds. Every slice was verified by the parent without pipes: `npm test` exit 0 (223, then 229), `npx tsc --noEmit` exit 0, `npm run build` exit 0.

L6 (known gaps): the canvas is verified only by `tsc` and `build` — the repository has no DOM harness and no dev server was started, so none of the five glyphs has been looked at with the eyes. The inspector for a glyph node is minimal (rename, delete a node, delete a relation) because `inspector.tsx` is typed to `ErDiagram`, so editing a relation's label or kind on the canvas is not available. The use case sample leaves `Facturar` without a relation. Composition and aggregation are refused in this family on purpose.
