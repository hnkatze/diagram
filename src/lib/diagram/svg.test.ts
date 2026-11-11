import test from "node:test";
import assert from "node:assert/strict";

import {
  PSEUDO_STATE_SIZE,
  STATE_HEIGHT,
  bounds,
  formatFieldLabel,
  measureNode,
  measureState,
} from "./measure.ts";
import { toSvg } from "./svg.ts";
import type {
  DiagramEdge,
  DiagramField,
  DiagramNode,
  ErDiagram,
  StateDiagram,
  RelationKind,
  StateNode,
  Transition,
} from "./types.ts";

const field = (over: Partial<DiagramField> = {}): DiagramField => ({
  name: "id",
  type: "int",
  visibility: "+",
  pk: false,
  fk: false,
  uk: false,
  nullable: false,
  ...over,
});

const node = (over: Partial<DiagramNode> = {}): DiagramNode => ({
  id: "usuario",
  name: "Usuario",
  x: 0,
  y: 0,
  fields: [field({ name: "id", type: "int", pk: true })],
  role: "entity",
  parentId: null,
  ...over,
});

const edge = (over: Partial<DiagramEdge> = {}): DiagramEdge => ({
  id: "usuario->pedido",
  source: "usuario",
  target: "pedido",
  relation: "association",
  sourceCardinality: "1",
  targetCardinality: "0..*",
  label: "realiza",
  ...over,
});

const diagram = (over: Partial<ErDiagram> = {}): ErDiagram => ({
  version: 1,
  kind: "er",
  title: "",
  nodes: [node(), node({ id: "pedido", name: "Pedido", x: 260, y: 120 })],
  edges: [edge()],
  ...over,
});

const stateNode = (over: Partial<StateNode> = {}): StateNode => ({
  id: "nuevo",
  name: "Nuevo",
  x: 0,
  y: 0,
  role: "state",
  ...over,
});

const transition = (over: Partial<Transition> = {}): Transition => ({
  id: "nuevo->pagado",
  source: "nuevo",
  target: "pagado",
  label: "",
  ...over,
});

const stateDiagram = (over: Partial<StateDiagram> = {}): StateDiagram => ({
  version: 1,
  kind: "state",
  title: "",
  nodes: [
    stateNode({ id: "initial", name: "", role: "initial", x: 0, y: 0 }),
    stateNode({ x: 0, y: 120 }),
    stateNode({ id: "pagado", name: "Pagado", x: 0, y: 240 }),
    stateNode({ id: "final", name: "", role: "final", x: 0, y: 360 }),
  ],
  edges: [transition({ label: "pagar" })],
  ...over,
});

/**
 * The `er` document produced by the exporter before the state renderer landed.
 * Pinned verbatim so adding a second family cannot quietly reshuffle, reformat
 * or re-measure the image an existing file already exports.
 */
const ER_GOLDEN = `<svg xmlns="http://www.w3.org/2000/svg" width="536" height="288" viewBox="0 0 536 288" font-family="&apos;Plus Jakarta Sans&apos;, ui-sans-serif, system-ui, -apple-system, &apos;Segoe UI&apos;, sans-serif"><style>text{dominant-baseline:middle} .n{font-size:14px;font-weight:600;fill:#fafafa} .f{font-size:12px;fill:#a1a1a1} .c{font-size:11px;fill:#8f8f8f} .l{font-size:12px;fill:#d4d4d4} .t{font-size:20px;font-weight:700;fill:#fafafa}</style><rect x="0" y="0" width="536" height="288" fill="#0a0a0a"/><line x1="216" y1="120" x2="320" y2="168" stroke="#8f8f8f" stroke-width="1.5"/><text class="c" x="240.17" y="120.14" text-anchor="middle">1</text><text class="c" x="304.22" y="149.7" text-anchor="middle">0..*</text><rect x="239.5" y="125" width="57" height="18" fill="#0a0a0a"/><text class="l" x="268" y="134" text-anchor="middle">realiza</text><clipPath id="box-usuario"><rect x="48" y="48" width="180" height="72" rx="8"/></clipPath><g clip-path="url(#box-usuario)"><rect x="48" y="48" width="180" height="40" fill="#262626"/><text class="n" x="64" y="68">Usuario</text><line x1="48" y1="88" x2="228" y2="88" stroke="#3f3f3f" stroke-width="1"/><clipPath id="box-usuario-row-0"><rect x="48" y="88" width="172" height="24"/></clipPath><text class="f" clip-path="url(#box-usuario-row-0)" x="64" y="100" font-family="'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">id : int PK</text></g><rect x="48" y="48" width="180" height="72" rx="8" fill="none" stroke="#3f3f3f" stroke-width="1.5"/><clipPath id="box-pedido"><rect x="308" y="168" width="180" height="72" rx="8"/></clipPath><g clip-path="url(#box-pedido)"><rect x="308" y="168" width="180" height="40" fill="#262626"/><text class="n" x="324" y="188">Pedido</text><line x1="308" y1="208" x2="488" y2="208" stroke="#3f3f3f" stroke-width="1"/><clipPath id="box-pedido-row-0"><rect x="308" y="208" width="172" height="24"/></clipPath><text class="f" clip-path="url(#box-pedido-row-0)" x="324" y="220" font-family="'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">id : int PK</text></g><rect x="308" y="168" width="180" height="72" rx="8" fill="none" stroke="#3f3f3f" stroke-width="1.5"/></svg>`;

test("emits a complete standalone svg document", () => {
  const svg = toSvg(diagram());
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.endsWith("</svg>"));
  assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /width="\d+"/);
  assert.match(svg, /height="\d+"/);
  assert.match(svg, /viewBox="0 0 \d+ \d+"/);
  assert.match(svg, /<style>/);
});

test("draws every entity with its fields", () => {
  const svg = toSvg(diagram());
  assert.match(svg, />Usuario</);
  assert.match(svg, />Pedido</);
  assert.ok(svg.includes(formatFieldLabel(node().fields[0], "er")));
});

test("draws the relation label and both cardinalities", () => {
  const svg = toSvg(diagram());
  assert.match(svg, />realiza</);
  assert.match(svg, />1</);
  assert.match(svg, />0\.\.\*</);
  assert.match(svg, /<line x1=/);
});

test("the source cardinality sits outside the source entity box", () => {
  const drawing = diagram();
  const svg = toSvg(drawing);
  const outer = bounds(drawing, 48);
  const size = measureNode(node(), "er");
  const sourceBox = {
    left: node().x - outer.x,
    top: node().y - outer.y,
    right: node().x - outer.x + size.width,
    bottom: node().y - outer.y + size.height,
  };

  const match = /<text class="c" x="(-?[\d.]+)" y="(-?[\d.]+)"[^>]*>1<\/text>/.exec(svg);
  assert.ok(match, "the source cardinality text element is rendered");
  const x = Number(match[1]);
  const y = Number(match[2]);
  const outside =
    x <= sourceBox.left || x >= sourceBox.right || y <= sourceBox.top || y >= sourceBox.bottom;
  assert.ok(outside, `cardinality at ${x},${y} must not be covered by the box ${JSON.stringify(sourceBox)}`);
});

test("a self relation becomes a path instead of a line", () => {
  const selfLoop = diagram({
    nodes: [node()],
    edges: [edge({ id: "usuario->usuario", source: "usuario", target: "usuario", label: "delega" })],
  });
  const svg = toSvg(selfLoop);
  assert.match(svg, /<path d="M /);
  assert.match(svg, />delega</);
});

test("escapes every user provided string", () => {
  const tricky = diagram({
    title: 'A & B <x>',
    nodes: [node({ name: 'Pe&dro "<x>"' })],
    edges: [edge({ id: "usuario->usuario", source: "usuario", target: "usuario", label: 'say "hi" & <ok>' })],
  });
  const svg = toSvg(tricky);
  assert.ok(svg.includes("A &amp; B &lt;x&gt;"));
  assert.ok(svg.includes("Pe&amp;dro &quot;&lt;x&gt;&quot;"));
  assert.ok(svg.includes("say &quot;hi&quot; &amp; &lt;ok&gt;"));
  assert.equal(svg.includes("<x>"), false);
});

test("renders the title only when it is not empty", () => {
  assert.match(toSvg(diagram({ title: "Tienda" })), /class="t"[^>]*>Tienda</);
  assert.equal(toSvg(diagram()).includes('class="t"'), false);
});

test("the padding option changes the viewBox and the size", () => {
  const tight = toSvg(diagram(), { padding: 10 });
  const loose = toSvg(diagram(), { padding: 80 });
  const widthOf = (svg: string): number => Number(/width="(\d+)"/.exec(svg)?.[1] ?? 0);
  assert.ok(widthOf(loose) > widthOf(tight));
});

test("the background option paints the backdrop rect", () => {
  const svg = toSvg(diagram(), { background: "#0f172a" });
  assert.match(svg, /<rect x="0" y="0" width="\d+" height="\d+" fill="#0f172a"\/>/);
});

test("an empty diagram still produces a valid document", () => {
  const svg = toSvg(diagram({ nodes: [], edges: [] }));
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.endsWith("</svg>"));
  assert.equal(svg.includes("<clipPath"), false);
});

test("output is deterministic", () => {
  assert.equal(toSvg(diagram()), toSvg(diagram()));
  assert.equal(toSvg(diagram(), { padding: 12 }), toSvg(diagram(), { padding: 12 }));
});

test("canvas size matches the shared geometry", () => {
  const empty = diagram();
  const box = bounds(empty, 48);
  const svg = toSvg(empty);
  const width = Number(/width="(\d+)"/.exec(svg)?.[1]);
  const height = Number(/height="(\d+)"/.exec(svg)?.[1]);
  assert.equal(width, Math.ceil(box.width));
  assert.equal(height, Math.ceil(box.height));
  assert.equal(measureNode(node(), "er").height, 72);
});

test("the image is dark by default, light on demand, and an explicit background wins", () => {
  const backdrop = (svg: string): string | undefined =>
    /<rect x="0" y="0"[^>]*fill="([^"]+)"/.exec(svg)?.[1];

  const byDefault = toSvg(diagram());
  assert.equal(backdrop(byDefault), "#0a0a0a");
  assert.equal(byDefault, toSvg(diagram(), { theme: "dark" }));

  const print = toSvg(diagram(), { theme: "light" });
  assert.equal(backdrop(print), "#ffffff");
  assert.notEqual(print, byDefault);

  assert.equal(backdrop(toSvg(diagram(), { theme: "light", background: "#123456" })), "#123456");
  assert.equal(backdrop(toSvg(diagram(), { theme: "dark", background: "#abcdef" })), "#abcdef");

  // Only colours change: the geometry is the same picture in both themes.
  const sizeOf = (svg: string): string => /viewBox="([^"]+)"/.exec(svg)?.[1] ?? "";
  assert.equal(sizeOf(print), sizeOf(byDefault));
});

test("a self relation stays inside the exported document", () => {
  const looped = diagram({
    nodes: [node()],
    edges: [edge({ id: "usuario->usuario", source: "usuario", target: "usuario", label: "delega" })],
  });
  const svg = toSvg(looped);
  const width = Number(/width="(\d+)"/.exec(svg)?.[1]);
  const height = Number(/height="(\d+)"/.exec(svg)?.[1]);
  const path = /<path d="M ([\d.-]+) ([\d.-]+) C ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)"/.exec(
    svg,
  );
  assert.ok(path, "the loop must be a cubic path");
  if (!path) return;

  const [p0x, p0y, c1x, c1y, c2x, c2y, p3x, p3y] = path.slice(1).map(Number);
  let maxX = -Infinity;
  let minY = Infinity;
  for (let step = 0; step <= 20; step += 1) {
    const t = step / 20;
    const u = 1 - t;
    const x = u * u * u * p0x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * p3x;
    const y = u * u * u * p0y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * p3y;
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
  }

  assert.ok(maxX <= width, `the loop reaches ${maxX} but the document is ${width} wide`);
  assert.ok(minY >= 0, `the loop reaches y ${minY}, above the document`);
  assert.ok(minY <= height);
});

test("uml-class diagrams keep the visibility glyph", () => {
  const uml = diagram({ kind: "uml-class", title: "Modelo" });
  assert.ok(toSvg(uml).includes(formatFieldLabel(node().fields[0], "uml-class")));
});

test("the er document is byte identical to the one shipped before states", () => {
  assert.equal(toSvg(diagram()), ER_GOLDEN);
});

test("renders the three state roles with their distinguishing glyphs", () => {
  const drawing = stateDiagram();
  const svg = toSvg(drawing);
  const outer = bounds(drawing, 48);
  const boxOf = (id: string): { x: number; y: number; width: number; height: number } => {
    const found = drawing.nodes.find((candidate) => candidate.id === id);
    assert.ok(found, `fixture state ${id} exists`);
    const size = measureState(found);
    return {
      x: found.x - outer.x,
      y: found.y - outer.y,
      width: size.width,
      height: size.height,
    };
  };

  const initial = boxOf("initial");
  assert.equal(initial.width, PSEUDO_STATE_SIZE);
  assert.equal(initial.height, PSEUDO_STATE_SIZE);
  assert.ok(
    svg.includes(
      `<circle cx="${initial.x + PSEUDO_STATE_SIZE / 2}" cy="${initial.y + PSEUDO_STATE_SIZE / 2}" r="${PSEUDO_STATE_SIZE / 2}" fill="#fafafa"/>`,
    ),
    "the initial state is one filled circle filling the pseudo-state square",
  );

  const final = boxOf("final");
  const finalX = final.x + PSEUDO_STATE_SIZE / 2;
  const finalY = final.y + PSEUDO_STATE_SIZE / 2;
  assert.ok(
    svg.includes(`<circle cx="${finalX}" cy="${finalY}" r="${PSEUDO_STATE_SIZE / 2}" fill="none"`),
    "the final state has an outer ring",
  );
  assert.ok(
    svg.includes(`<circle cx="${finalX}" cy="${finalY}" r="${PSEUDO_STATE_SIZE / 4}" fill="#fafafa"/>`),
    "the final state has a filled inner circle",
  );

  const state = boxOf("nuevo");
  assert.equal(state.height, STATE_HEIGHT);
  assert.equal(state.width, measureState(stateNode()).width);
  assert.ok(
    svg.includes(
      `<rect x="${state.x}" y="${state.y}" width="${state.width}" height="${state.height}" rx="8" fill="#262626" stroke="#3f3f3f" stroke-width="1.5"/>`,
    ),
    "a state is a rounded box sized by measureState and bordered like an entity",
  );
  assert.ok(
    svg.includes(
      `<text class="n" x="${state.x + state.width / 2}" y="${state.y + state.height / 2}" text-anchor="middle" font-size="14">Nuevo</text>`,
    ),
    "the state name is centred in its box",
  );
});

test("a transition declares an arrowhead marker and references it by a stable id", () => {
  const svg = toSvg(stateDiagram());
  const markerId = /<marker id="([^"]+)"/.exec(svg)?.[1];
  assert.ok(markerId, "the document declares one marker");
  assert.match(svg, /<marker id="[^"]+" viewBox="0 0 10 10"[^>]*>/);
  assert.ok(svg.includes('<path d="M 0 0 L 10 5 L 0 10 z"'), "the marker is an arrowhead path");
  assert.ok(svg.includes(`marker-end="url(#${markerId})"`), "the transition references the marker");
  assert.equal((svg.match(/<marker /g) ?? []).length, 1, "one marker definition is enough for the document");

  const other = toSvg(
    stateDiagram({
      nodes: [stateNode({ id: "a", name: "A" }), stateNode({ id: "b", name: "B", x: 0, y: 120 })],
      edges: [transition({ id: "a->b", source: "a", target: "b", label: "ir" })],
    }),
  );
  assert.equal(/<marker id="([^"]+)"/.exec(other)?.[1], markerId, "the marker id does not depend on the diagram");
  assert.equal(
    /<marker id="([^"]+)"/.exec(toSvg(stateDiagram(), { theme: "light" }))?.[1],
    markerId,
    "the marker id does not depend on the theme",
  );
});

test("a transition label is drawn off the line and escaped", () => {
  const svg = toSvg(
    stateDiagram({ edges: [transition({ label: 'pagar & <monto> "0" / emitir' })] }),
  );
  assert.ok(svg.includes('>pagar &amp; &lt;monto&gt; &quot;0&quot; / emitir</text>'));
  assert.equal(svg.includes("<monto>"), false);
  assert.equal(svg.includes("pagar & "), false);
});

test("an empty transition label draws no text", () => {
  const svg = toSvg(stateDiagram({ edges: [transition({ label: "" })] }));
  assert.match(svg, /<line x1=/);
  assert.equal(svg.includes('class="l"'), false);
});

test("a self transition is a loop path, never a zero length line", () => {
  const svg = toSvg(
    stateDiagram({
      nodes: [stateNode()],
      edges: [transition({ id: "nuevo->nuevo", source: "nuevo", target: "nuevo", label: "reintentar" })],
    }),
  );
  assert.match(svg, /<path d="M [\d.]+ [\d.]+ C /);
  assert.equal(svg.includes("<line x1="), false, "a self transition must not become a zero length line");
  assert.match(svg, /<path d="M [^"]*" fill="none"[^>]*marker-end="url\(#[^)]+\)"\/>/);
  assert.ok(svg.includes(">reintentar</text>"));

  // The loop and its label must fit the one extent `bounds` computed: a second
  // extent calculation for the loop is exactly what the exporter must not do.
  const width = Number(/width="(\d+)"/.exec(svg)?.[1]);
  const labelX = Number(/<text class="l" x="([\d.]+)"/.exec(svg)?.[1]);
  assert.ok(labelX > 0 && labelX < width, "the self transition label stays inside the document");
});

test("state output is deterministic", () => {
  assert.equal(toSvg(stateDiagram()), toSvg(stateDiagram()));
  assert.equal(
    toSvg(stateDiagram(), { theme: "light", padding: 12 }),
    toSvg(stateDiagram(), { theme: "light", padding: 12 }),
  );
});

test("a state diagram is dark by default, light on demand, and an explicit background wins", () => {
  const backdrop = (svg: string): string | undefined =>
    /<rect x="0" y="0"[^>]*fill="([^"]+)"/.exec(svg)?.[1];

  const byDefault = toSvg(stateDiagram());
  assert.equal(backdrop(byDefault), "#0a0a0a");
  assert.equal(byDefault, toSvg(stateDiagram(), { theme: "dark" }));

  const print = toSvg(stateDiagram(), { theme: "light" });
  assert.equal(backdrop(print), "#ffffff");
  assert.notEqual(print, byDefault);

  assert.equal(backdrop(toSvg(stateDiagram(), { theme: "light", background: "#123456" })), "#123456");

  const sizeOf = (svg: string): string => /viewBox="([^"]+)"/.exec(svg)?.[1] ?? "";
  assert.equal(sizeOf(print), sizeOf(byDefault));
});

test("a state diagram matches the shared geometry", () => {
  const drawing = stateDiagram();
  const box = bounds(drawing, 48);
  const svg = toSvg(drawing);
  assert.equal(Number(/width="(\d+)"/.exec(svg)?.[1]), Math.ceil(box.width));
  assert.equal(Number(/height="(\d+)"/.exec(svg)?.[1]), Math.ceil(box.height));
});

test("an empty state diagram still produces a valid document", () => {
  const svg = toSvg(stateDiagram({ nodes: [], edges: [] }));
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.endsWith("</svg>"));
  assert.match(svg, /viewBox="0 0 \d+ \d+"/);
  assert.equal(svg.includes("<circle"), false);
  assert.equal(svg.includes('class="n"'), false);
});

test("a diagram with only an initial state is still a valid document", () => {
  const svg = toSvg(
    stateDiagram({ nodes: [stateNode({ id: "initial", name: "", role: "initial" })], edges: [] }),
  );
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.endsWith("</svg>"));
  assert.match(svg, /<circle /);
});

const classWith = (relation: RelationKind, over: Partial<DiagramEdge> = {}): ErDiagram =>
  diagram({
    kind: "uml-class",
    edges: [edge({ relation, sourceCardinality: null, targetCardinality: null, label: "", ...over })],
  });

const markerOf = (svg: string, relation: RelationKind): string => {
  const found = svg.match(new RegExp(`<path class="marker marker-${relation}"[^>]*/>`));
  assert.ok(found, `no marker-${relation} in the output`);
  return found[0];
};

const fillOf = (path: string): string | undefined => path.match(/ fill="([^"]*)"/)?.[1];

test("a generalization draws a hollow triangle in the background colour", () => {
  const path = markerOf(toSvg(classWith("generalization")), "generalization");

  assert.equal(fillOf(path), "#0a0a0a");
  assert.match(path, /stroke="#8f8f8f"/);
  assert.equal((path.match(/ L /g) ?? []).length, 2);
});

test("a composition draws a diamond filled with the line colour", () => {
  const path = markerOf(toSvg(classWith("composition")), "composition");

  assert.equal(fillOf(path), "#8f8f8f");
  assert.equal((path.match(/ L /g) ?? []).length, 3);
});

test("an aggregation draws a hollow diamond, unlike the composition", () => {
  const svg = toSvg(classWith("aggregation"));
  const hollow = markerOf(svg, "aggregation");
  const filled = markerOf(toSvg(classWith("composition")), "composition");

  assert.equal(fillOf(hollow), "#0a0a0a");
  assert.notEqual(fillOf(hollow), fillOf(filled));
});

test("a realization draws a hollow triangle on a dashed line", () => {
  const svg = toSvg(classWith("realization"));

  assert.equal(fillOf(markerOf(svg, "realization")), "#0a0a0a");
  assert.match(svg, /<line [^>]*stroke-dasharray="6 4"/);
});

test("a dependency draws an open arrow on a dashed line", () => {
  const svg = toSvg(classWith("dependency"));

  assert.equal(fillOf(markerOf(svg, "dependency")), "none");
  assert.match(svg, /<line [^>]*stroke-dasharray="6 4"/);
});

test("a plain association draws no marker and no dash", () => {
  const svg = toSvg(diagram());

  assert.doesNotMatch(svg, /class="marker/);
  assert.doesNotMatch(svg, /stroke-dasharray/);
});

test("the line stops short of the marker it leads to", () => {
  const plain = toSvg(classWith("association"));
  const marked = toSvg(classWith("generalization"));

  assert.notEqual(plain.match(/<line [^>]*\/>/)?.[0], marked.match(/<line [^>]*\/>/)?.[0]);
});

test("the light theme draws the same markers with light colours", () => {
  const dark = markerOf(toSvg(classWith("generalization")), "generalization");
  const light = markerOf(toSvg(classWith("generalization"), { theme: "light" }), "generalization");

  assert.equal(fillOf(light), "#ffffff");
  assert.equal(dark.match(/ d="([^"]*)"/)?.[1], light.match(/ d="([^"]*)"/)?.[1]);
  assert.match(light, /stroke="#64748b"/);
});

test("a relation with null cardinalities renders no cardinality text", () => {
  const svg = toSvg(classWith("generalization", { label: "es un" }));

  assert.doesNotMatch(svg, /class="c"/);
  assert.doesNotMatch(svg, /null/);
  assert.match(svg, />es un</);
});

test("a directed association draws an open arrow on a solid line", () => {
  const svg = toSvg(classWith("directed-association"));

  assert.equal(fillOf(markerOf(svg, "directed-association")), "none");
  assert.doesNotMatch(svg, /stroke-dasharray/);
});

const nested = (over: Partial<ErDiagram> = {}): ErDiagram =>
  diagram({
    nodes: [
      node({ id: "ventas", name: "Ventas", role: "package", fields: [], x: 0, y: 0 }),
      node({ id: "pedido", name: "Pedido", x: 100, y: 100, parentId: "ventas" }),
    ],
    edges: [],
    ...over,
  });

test("a container is drawn before the first node it holds", () => {
  const svg = toSvg(nested());

  const container = svg.indexOf('class="container"');
  const child = svg.indexOf('id="box-pedido"');
  assert.ok(container >= 0);
  assert.ok(child >= 0);
  assert.ok(container < child);
});

test("the container title is drawn and escaped", () => {
  const svg = toSvg(
    nested({
      nodes: [
        node({ id: "ventas", name: 'Ven"tas & <Co>', role: "region", fields: [] }),
        node({ id: "pedido", name: "Pedido", x: 100, y: 100, parentId: "ventas" }),
      ],
    }),
  );

  assert.match(svg, /class="container-title"[^>]*>Ven&quot;tas &amp; &lt;Co&gt;</);
  assert.doesNotMatch(svg, /Ven"tas/);
});

test("the light theme gives the container a different fill", () => {
  const fillOfContainer = (svg: string): string | undefined =>
    svg.match(/<rect class="container"[^>]* fill="([^"]*)"/)?.[1];

  const dark = fillOfContainer(toSvg(nested()));
  const light = fillOfContainer(toSvg(nested(), { theme: "light" }));

  assert.ok(dark && light);
  assert.notEqual(dark, light);
});

test("a diagram without containers never draws container markup", () => {
  const plain = diagram({ nodes: [node(), node({ id: "pedido", name: "Pedido", x: 300 })], edges: [edge()] });

  assert.equal(toSvg(plain), toSvg(structuredClone(plain)));
  assert.doesNotMatch(toSvg(plain), /container/);
});

test("a package draws a folder tab and a region does not", () => {
  const withRole = (role: "package" | "region"): ErDiagram =>
    nested({
      nodes: [
        node({ id: "ventas", name: "Ventas", role, fields: [] }),
        node({ id: "pedido", name: "Pedido", x: 100, y: 100, parentId: "ventas" }),
      ],
    });

  assert.match(toSvg(withRole("package")), /class="container-tab"/);
  assert.doesNotMatch(toSvg(withRole("region")), /class="container-tab"/);
});
