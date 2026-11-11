# State machine diagrams (UML kind `state`)

Third diagram kind for the existing hybrid editor. States, initial/final pseudo-states and labelled transitions, authored from the canvas and from text, exported as SVG/PNG with the same dark/light palettes.

The existing `er` / `uml-class` behavior must not change: the app gains a kind, it does not get a second app.

## Context: why this is a model change

Today `Diagram` is one flat shape: nodes carry `fields`, edges carry `sourceCardinality`/`targetCardinality`. Neither concept exists in a state machine, and inventing an empty transition label or faking a cardinality would make invalid states representable. So `Diagram` becomes a discriminated union on `kind`, and each family owns its node and edge shapes. Everything else (text sync, history, persistence envelope, export pipeline, theme switch) is shared and must keep working identically.

## Specs

**S1 — The document is a union of diagram families.** `Diagram` is `ErDiagram | StateDiagram`, discriminated by `kind`. `ErDiagram` is `kind: "er" | "uml-class"` and keeps exactly today's nodes (`fields`, `x`, `y`) and edges (`sourceCardinality`, `targetCardinality`, `label`). `StateDiagram` is `kind: "state"` with state nodes and transitions. No `any`, no optional cardinality on the ER side, and every existing test keeps passing. Test files may receive **type-annotation-only** edits — fixture return types, helper parameter types — because a test that annotates its fixture as `Diagram` can no longer read `.fields` through the union; no assertion, expectation, test name or test count may change.

**S2 — State elements.** A `StateNode` is `{ id, name, x, y, role }` where `role` is `"state" | "initial" | "final"` and `name` is empty for the two pseudo-states. A state renders as a rounded box with the name centred; `initial` renders as a small filled circle; `final` as a ring with a filled inner circle. At most one `initial` may exist. `final` may repeat. State names are unique, and their ids are the slug of the name (pseudo-states get `initial`, `final`, `final-2`, ...).

**S3 — Transitions.** A `Transition` is `{ id, source, target, label }`. The label is free text and is stored and rendered verbatim — `evento [guarda] / acción` is NOT split into parts in this version. Self transitions (both ends the same state) are allowed and render as a loop. A transition whose endpoint does not exist is an error, never a silently dropped edge.

**S4 — Text DSL for state diagrams.**

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

`initial` and `final` declare the pseudo-states (`final` may appear more than once); `state <Name>` declares a state; `<From> --> <To> [": \"<label>\""]` declares a transition. Quoted names and labels keep the same escaping rules as the existing DSL, `//` comments out a line, and the `diagram state "<title>"` header is optional (defaults to an empty title). `parse(serialize(d))` must reconstruct the structure exactly.

**S5 — Parse safety is unchanged.** Invalid text shows its error with the line number and never mutates the canvas; the last valid model keeps rendering. Positions never appear in the text, and a re-parse preserves the position of every state that still exists.

**S6 — Layout.** dagre top to bottom, sizes from a shared `measureState` used by both the canvas and the exporter. Deterministic: the same model yields the same coordinates. New states created from text are laid out without moving the states that already exist.

**S7 — Export.** `toSvg` renders state diagrams with the same palettes and `theme` option as the other kinds, and states/transitions get elements the current exporter lacks: arrowheads on transitions and the initial/final glyphs. A diagram with only an initial state must still produce a valid document.

**S8 — Canvas.** State shapes mirror the exporter's geometry (same sizes, same glyph proportions). Transitions render with an arrowhead and the label off the line, and a drag never moves the model until the drag stops. Switching the kind in the toolbar between `er` and `uml` keeps converting as it does today; switching to or from `state` starts that family's bundled sample, because the two families share no elements.

**S9 — Shared behaviour keeps working for states.** Autosave to `localStorage`, JSON import/export (`{ version: 1, diagram }` with `kind: "state"`), undo/redo, the dark shell, the light/dark export switch, and the text panel sync all apply unchanged. An old `er`/`uml` file must still import.

**S10 — Documentation.** The README documents the state DSL with a runnable example and lists the kinds; the export section mentions that arrowheads appear on state transitions.

## Tasks

| ID | Task | Specs | Route | Commit |
|----|------|-------|-------|--------|
| T1 | `Diagram` union + every existing module migrated, 91 tests green and ER behavior identical | S1 | worker | yes |
| T2 | State DSL parse/serialize + tests | S4, S5 | worker | yes |
| T3 | `measureState` + state layout + tests | S6 | worker | yes |
| T4 | SVG renderer for states and transitions, arrowheads + tests | S7 | worker | yes |
| T5 | Canvas state shapes + toolbar kind switch | S8 | worker | yes |
| T6 | Sample, README, JSON round trip for `kind: "state"`, final verification | S9, S10 | worker | yes |

## Log

L1 (user, verbatim): "y vamos agregando mas formas de diagramas uml, hay varios de estados agreguemos y ese de secuencia creo que es podemos"

L2 (user choice, verbatim label): "Estados primero, secuencia después (recomendado)" — "Cerramos máquina de estados completo (estado inicial/final, estados, transiciones etiquetadas) y después atacamos secuencia con el alcance ya decidido."

L3 (decision, parent): the union replaces the flat model instead of adding `fields?: []` and optional cardinalities, because a flat model makes invalid combinations representable (a state with fields, a transition with cardinality) and every later check would have to defend against them by convention.

L4 (decision, parent): the transition label is stored verbatim in this version. Splitting `evento [guarda] / acción` into structured parts buys nothing until the app needs to validate or query it, and it would force the DSL to escape three separators.

L5 (correction, parent, during T1): the first T1 brief demanded the union AND zero edits to the existing test files. Both cannot hold: the tests annotate their fixtures as `Diagram` and then read ER-only members (`.fields`, `.sourceCardinality`), and they feed those values into the ER-only helpers the union is supposed to reject. Measured with `tsc` and a temporary `types.ts`: 65 errors, 24 of them inside 6 test files. Decision: type-annotation-only edits are authorized (no assertion, expectation, test name or test case count changes); the union stays, because weakening the model to keep the annotations would give up the invariant the feature needs.
