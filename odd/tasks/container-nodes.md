# Container nodes (packages and regions)

A titled rectangle that can hold other nodes. It is the primitive the engine is missing: with boxes, arrows and markers in place, the gap between "boxes and arrows" and real UML is containment, and one primitive unlocks packages, use-case system boundaries, nested components, activity swimlanes and sequence fragments.

Slice 1 is the class family only (`er` and `uml-class`). The state family is untouched, so an existing `kind: "state"` document keeps its shape and its tests.

## Specs

**S1 — A node may belong to a container.** Every class-family node gains a required `parentId: string | null`, where `null` means "top level" — the same convention the relation cardinalities use, so nothing is optional and no caller has to guess. A container is itself a class-family node with a `role`: `"package"` (folder tab glyph) or `"region"` (plain titled rectangle). A container may not nest inside another container in slice 1; declaring one inside another is a parse error that names both.

**S2 — Container size is derived, never stored.** Positions stay the only geometry in the model. A container's rectangle is computed from the bounding box of its children plus a fixed inset, and its title strip height is fixed. Two surfaces computing it twice is the bug the border endpoints already taught us, so the computation lives in `measure.ts` once and both the canvas and the exporter call it. An empty container still renders, at the minimum size that fits its title.

**S3 — The DSL nests with braces.** The existing block syntax extends rather than growing a second syntax:

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

package Logistica {
  entity Envio {
    id int pk
  }
}
```

`package <Name> { ... }` opens a container and `region <Name> { ... }` opens a plain one; both close with `}`. Entities declared inside belong to it. `parse(serialize(d))` reconstructs the nesting exactly — container order, children order, and every child's parent. Indentation is two spaces per level in the serialized text and is not significant when parsing.

**S4 — Layout keeps children inside their container.** The automatic layout places the graph with dagre's compound support, so a container is a cluster: dagre sizes it from its children and the container's rectangle always contains them, with the inset reserved for the title strip. Layout stays deterministic — the same model yields the same coordinates — and a node that survives a text edit keeps its position and its parent.

**S5 — Export draws nesting.** `toSvg` renders each container before the nodes it holds, so children paint above the container, and the container's rectangle never shadows a child. The container uses a muted tone from the current palette, its title sits in the top strip, and both palettes keep working.

**S6 — The canvas mirrors the exporter.** React Flow renders containers as parent nodes with `extent: "parent"`, so dragging a child cannot take it outside its container, and the container's dimensions come from the same `measure.ts` computation as S5. Positions in the model are absolute; the canvas converts to a parent's relative coordinates for rendering only, and a drag writes absolute coordinates back.

**S7 — Notes attach to anything.** A note is a class-family node with `role: "note"` and a free-text body, linked to exactly one element by a `note-link` relation: dashed, no marker, and it carries no cardinality. A note may sit at top level or inside a container. Text is stored verbatim; `note:<Name>` is not a second, richer notation.

**S8 — Shared behaviour keeps working.** Autosave, JSON envelope, undo/redo, the kind switch, the light/dark export switch, the text panel sync and every relation form work with containers present. A file written before containers existed imports unchanged: a node with no `parentId` is top level.

## Tasks

| ID | Task | Specs | Route | Commit |
|----|------|-------|-------|--------|
| T1 | Model (`parentId`, container roles) + DSL nesting with round trip + JSON import of an old file | S1, S3, S8 | worker | `76e140d` |
| T2 | `measure.ts` container rect + dagre compound layout + determinism | S2, S4 | inline | `76e140d` |
| T3 | Exporter nesting and canvas parent nodes on one geometry rule | S5, S6 | inline | `76e140d` |
| T4 | Sample, README, and the full verification with an old file and a nested one | S8 | inline | `76e140d` |
| T5 | Notes: node role, `note-link` relation, both surfaces | S7 | inline | pending |

## Log

L1 (user, verbatim): "hagamoslo mas alto"

L2 (decision, parent): that reply answers the binary offer that closed the previous turn — containers versus a quick new diagram type — so the accepted scope is the larger one. It is a new capability rather than a new kind, so it gets its own feature document instead of reopening the hybrid editor.

L3 (decision, parent): slice 1 is the class family only. A container touches the union, the DSL grammar, the layout, both renderers and every existing test, and the state family would double that surface before the primitive is proven. The state family keeps its shape until containers are green there.

L4 (evidence, T1-T4, landed as `76e140d`): containers run end to end in the class family. T1 gave `ErNode` a required `role` and `parentId` and replaced the parser's single open block with a stack, so `package` and `region` nest and a container inside a container is refused by name; RED at 10 failing tests, GREEN at 180. T2 put the container rectangle in one function (`containerBox`) and made dagre compound, so a container is anchored to its children instead of sized twice; 187, then 189 once the two non-overlap guards landed. The overlap I predicted from `2*inset + title = 76` against dagre's 60 did not reproduce, and the arithmetic was wrong because compound mode inserts cluster border nodes and raises the effective separation: a throwaway fuzz of 300 random nested diagrams found 0 intersecting container rectangles, so no separation constant was invented and the prediction was recorded as a guard instead. T3 rendered containers in the exporter before their children and on the canvas as React Flow parent nodes with `extent: "parent"`, converting absolute positions to relative for rendering and back on drag stop; 193, then 197 when the missing `package` folder tab of S1 landed as `containerTabPath`, consumed by both surfaces.

L5 (decision, parent): a container with children now grows to fit its title, `width = max(children bbox, estimated title) + inset * 2`. The empty-container rule already reserved room for the name, and a titled box spilling its own label is the inconsistency T4's verification pass caught (an 80-character title in a 228px box). The height, the title strip and the origin are unchanged, so children do not move.

L6 (evidence, T4): README gained `### Containers` with an example that is parsed back in the check, not written twice. End-to-end on a nested document: `parse -> serialize -> parse` keeps roles, parent ids and order; the exported SVG is 564x536 with children inside their containers at 24px left/right and 52px top; two `container-tab` elements and both titles are present. An empty `package` and an empty `region` both give 165x188. The old-file path is covered by the existing test `a file without role or parentId imports as top-level entities`. Close checks, run by the parent without pipes: `npm test` exit 0 with 199 pass, `npx tsc --noEmit` exit 0, `npm run build` exit 0.

L7 (known gaps, deferred): the canvas is verified only by `tsc` and `build`, since the repository has no DOM harness and no dev server was started for this feature — a visual pass over a nested diagram is still owed. Notes (S7, T5) are not implemented. The container title width is estimated at 9px per character, not measured.
