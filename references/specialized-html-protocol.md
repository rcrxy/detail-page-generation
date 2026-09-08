# Photoshop-specialized HTML protocol

Version: `0.1-draft`

This document defines the intermediate HTML format used between an approved
browser design and `tools/html-to-ps`.

The specialized HTML is a generated handoff artifact. It may restructure the
source DOM and CSS to express a useful Photoshop layer tree, but it must retain
the approved browser result as closely as practical.

## Pipeline position

```text
approved source HTML
  -> source browser reference
  -> AI specialization
  -> specialized HTML
  -> specialized browser reference and validation
  -> html-to-ps
  -> scene.json + JSX
  -> Photoshop
```

The source HTML remains the design source of truth. The specialized HTML is
disposable and may be regenerated whenever the source design changes.

Do not manually evolve the source and specialized files as two independent
designs.

## Status and capability boundary

This protocol is the target contract for the specialization stage. It includes:

- existing `data-ps-*` hints already consumed by html-to-ps 0.0.1;
- source-trace attributes for generated handoff HTML;
- structural conventions that a later converter revision must validate;
- shape semantics that require native Photoshop shape support before they can
  be considered faithfully implemented.

A specialized file must declare the protocol version and any converter
capabilities it requires. The converter must not silently claim support for a
required capability that it does not implement.

## Artifact naming

Use a nearby independent file by default:

```text
index.html
index.ps.html
ps-handoff/
```

Alternative names are allowed, but the specialized file must not overwrite the
approved source file.

Generated supporting assets should live in a dedicated directory such as:

```text
ps-specialized-assets/
```

Do not modify original supplied product assets.

## Document contract

The specialized document must:

- remain valid, directly renderable HTML;
- contain exactly one `#detail-page` handoff root;
- keep the root at 1500 px wide;
- preserve the source root's final height unless a documented browser rounding
  difference makes an exact match impossible;
- preserve visible text, imagery, geometry, stacking, opacity, and effects;
- keep authored CSS in `<style>` elements in the specialized HTML;
- resolve local assets from stable relative paths;
- avoid network-dependent assets unless the approved source already requires
  them and they can be materialized reliably;
- avoid JavaScript when static HTML and CSS can reproduce the final design;
- render deterministically without editor, debug, or analysis UI.

The root declares the specialization protocol:

```html
<main
  id="detail-page"
  data-ps-specialized-version="0.1"
  data-ps-source="./index.html"
>
  ...
</main>
```

When the file relies on capabilities beyond html-to-ps 0.0.1, declare them as
a space-separated list:

```html
<main
  id="detail-page"
  data-ps-specialized-version="0.1"
  data-ps-required-capabilities="shape-stroke shape-rounded-rectangle"
>
  ...
</main>
```

Initial capability names are:

- `shape-fill`
- `shape-stroke`
- `shape-rounded-rectangle`
- `shape-ellipse`
- `source-trace-report`
- `specialized-fallback-boundary`

Unknown required capabilities must produce a clear preflight error. Optional
capabilities must not be declared as required.

## Sources of truth

Keep each kind of information in one authoritative place:

- Chromium determines final bounds, computed styles, text content, image
  source, transforms, and paint geometry.
- CSS in the specialized document determines the visible appearance.
- `data-ps-*` attributes determine layer intent, naming, grouping, source
  traceability, and explicit fallback boundaries.
- The converter determines whether the requested Photoshop reconstruction is
  supported and faithful.
- The generated scene records what was actually applied.

Do not duplicate computed coordinates, colors, font sizes, transforms, or
opacity into semantic attributes. Duplicated visual values can drift away from
the rendered CSS.

## Existing handoff semantics

The following existing attributes retain their current meanings:

- `data-ps-group="Layer group name"`
- `data-ps-name="Layer name"`
- `data-ps-role="text|image|shape"`
- `data-ps-ignore`
- `data-ps-flatten`
- `data-ps-font-postscript="ExactPostScriptName"`
- `data-ps-text-mode="point|paragraph"`

Specialization does not make these attributes inherently trustworthy. The
converter must validate enum values, element compatibility, and supported
Photoshop behavior.

`data-ps-ignore`, `data-ps-flatten`, and `data-ps-font-postscript` are
high-impact instructions. Their use is restricted by
`references/ai-specialization-rewrites.md`.

Do not author `data-ps-node-id`. It is reserved for converter-internal DOM and
scene correlation.

## Source traceability

Every source-derived element that is materially renamed, moved, split, merged,
or replaced should carry a stable source identifier:

```html
<section
  data-ps-source-id="source-section-03"
  data-ps-origin="main#detail-page > section:nth-of-type(3)"
>
  ...
</section>
```

Generated visual parts should additionally declare their origin part and
rewrite operation:

```html
<div
  data-ps-source-id="source-card-02"
  data-ps-generated="true"
  data-ps-origin-part="border"
  data-ps-rewrite="split-border"
></div>
```

Trace attributes are diagnostic metadata. They must not affect layout or visual
styling.

Defined trace attributes:

- `data-ps-source-id`: stable identifier shared by nodes derived from one
  source element;
- `data-ps-origin`: human-readable source locator captured at generation time;
- `data-ps-generated="true"`: identifies a node created only for handoff;
- `data-ps-origin-part`: visual part such as `background`, `border`,
  `before`, `after`, `shadow`, `text-run`, or `mask`;
- `data-ps-rewrite`: rewrite operation from the controlled vocabulary below.

Initial rewrite operation names:

- `annotate-only`
- `group-layer-tree`
- `split-background`
- `split-border`
- `materialize-before`
- `materialize-after`
- `split-text-run`
- `split-decoration`
- `specialize-image-clip`
- `isolate-fallback`
- `remove-layout-wrapper`
- `inline-stylesheet`

The converter should preserve source trace information in scene nodes and the
handoff report when `source-trace-report` is supported.

## Layer-tree semantics

Use DOM nesting to express intended Photoshop group nesting only when that
nesting does not change the browser render.

Use `data-ps-group` for meaningful Photoshop groups, including:

- top-level detail-page sections;
- product image compositions;
- one selling-point visual and its labels;
- a card or panel whose children should remain grouped;
- a generated set of background, border, content, and decoration layers.

Do not preserve every browser layout wrapper as a Photoshop group. Wrappers
whose only purpose is Flexbox, Grid, centering, measurement, or CSS scoping may
remain ungrouped or be removed in the specialized copy when their rendered
result remains unchanged.

The DOM order and computed stacking order must continue to reproduce the
approved browser paint order. Layer naming must not be used as a substitute for
correct stacking.

## Shape protocol

A generated or source-derived editable shape uses:

```html
<div
  data-ps-role="shape"
  data-ps-shape-kind="rectangle"
  data-ps-name="Card border"
></div>
```

Initial shape kinds are:

- `rectangle`
- `rounded-rectangle`
- `ellipse`

The element's computed CSS remains authoritative for:

- bounds;
- background fill;
- border color, width, style, and alpha;
- corner radius;
- opacity;
- transform.

The converter must validate that the CSS can be represented by the requested
shape kind. Unsupported asymmetric borders, per-corner geometry, non-solid
strokes, complex transforms, or effects must degrade locally and be reported.

### Border decomposition

When a source element combines content and a border, the specialized copy may
split the border into an independent overlay shape:

```html
<div
  class="feature-card"
  data-ps-group="Feature card"
  data-ps-source-id="source-card-02"
>
  <div
    class="feature-card__ps-border"
    data-ps-role="shape"
    data-ps-shape-kind="rounded-rectangle"
    data-ps-name="Card border"
    data-ps-source-id="source-card-02"
    data-ps-generated="true"
    data-ps-origin-part="border"
    data-ps-rewrite="split-border"
  ></div>

  <h2 data-ps-role="text" data-ps-name="Card title">Lightweight comfort</h2>
</div>
```

```css
.feature-card {
  position: relative;
  border: 0;
}

.feature-card__ps-border {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  border: 4px solid #c8a26b;
  border-radius: 24px;
  background: transparent;
  pointer-events: none;
}
```

The generated border node must cover the same border box and paint at the same
stacking position as the source border. Removing the original border must not
change box sizing, content position, or outer dimensions. Preserve the source
space with equivalent padding, explicit dimensions, or another layout-neutral
method when needed.

`shape-stroke` and, when applicable, `shape-rounded-rectangle` must be listed
as required capabilities. Until the JSX generator creates these faithfully,
the converter must warn, reject, or use a local rendered fallback rather than
pretending the border is editable.

## Pseudo-element materialization

A visible `::before` or `::after` may be replaced with a real generated element
when all of its rendered content and styling can be preserved:

```html
<span
  aria-hidden="true"
  data-ps-generated="true"
  data-ps-origin-part="before"
  data-ps-rewrite="materialize-before"
  data-ps-name="Title decoration"
></span>
```

The source pseudo-element must be disabled in the specialized CSS to avoid
double rendering. Generated decorative nodes must not introduce customer-facing
text semantics or accessibility behavior.

If the pseudo-element depends on counters, dynamic generated content, complex
masking, filters, or ancestor-dependent blending, keep it inside the smallest
faithful fallback instead of approximating it.

## Text specialization

Text may be split into multiple real elements only to preserve independently
editable browser text runs, such as different font faces, sizes, colors, or
positions.

The specialization must preserve:

- exact visible text and punctuation;
- whitespace behavior and explicit line breaks;
- run order;
- computed font face and fallback behavior;
- final wrapping and alignment;
- text opacity and transforms.

Do not split individual characters merely to reproduce tracking, ordinary line
wrapping, or effects that should remain one text layer or one local fallback.

Use `data-ps-text-mode` only when point or paragraph intent is known from the
approved layout. Do not use it to repair a converter measurement defect.

## Image specialization

Keep supplied product imagery unchanged. A source image may be wrapped,
unwrapped, or separated from a clipping/decorative container when the visible
pixels remain identical.

Do not replace an image with a screenshot merely because its HTML structure is
complex. Prefer:

1. the original image as an editable Smart Object;
2. separate shape or mask semantics when supported;
3. the smallest local rendered fallback that preserves the crop or effect.

Never bake unrelated text, adjacent products, or section backgrounds into an
image fallback.

## Fallback boundaries

`data-ps-flatten` explicitly requests one rendered Smart Object for the marked
element and its descendants. In specialized HTML it should also include:

```html
data-ps-rewrite="isolate-fallback"
data-ps-fallback-reason="short factual reason"
```

`data-ps-fallback-reason` is diagnostic metadata. The converter still decides
whether a native reconstruction is possible and records its actual decision.

Fallback boundaries must be the smallest self-contained visual region that
preserves the approved result. Do not flatten an entire section when only one
decoration or effect requires rendered preservation.

## Content-preservation invariants

Specialization must not intentionally change:

- customer-facing copy;
- confirmed product facts;
- product image pixels;
- image crop, scale, or visible position;
- visible colors, gradients, borders, shadows, and decoration;
- typography, wrapping, or line breaks;
- section order;
- root width or meaningful vertical rhythm;
- final stacking and overlap;
- the visibility of approved content.

Internal metadata and handoff-only elements may be added when they do not
change the render.

## Preflight and reporting contract

Before conversion, the specialization stage should record or verify:

- source and specialized file paths;
- source content digest;
- protocol version;
- required converter capabilities;
- root width and height comparison;
- visible text comparison;
- image source inventory comparison;
- generated nodes and rewrite operations;
- explicit fallback nodes;
- unresolved or risky rewrites.

The converter should report:

- unsupported protocol versions or required capabilities;
- invalid enum values and incompatible roles;
- missing or duplicate source identifiers when traceability is expected;
- rejected shape semantics;
- actual native, smart, or skipped result for each rewritten node;
- any mismatch between declared and executed fallback behavior.

One invalid specialized node must not prevent unrelated sibling nodes or later
sections from converting.

## Visual validation

The minimum visual validation compares:

```text
source HTML browser render
  vs
specialized HTML browser render
```

Compare the complete `#detail-page` at 1500 px and
`deviceScaleFactor: 1`. A later PSD comparison does not replace this check:
otherwise a specialization error can be mistaken for a converter success.

Pixel comparison is evidence, not permission to alter content. Review visible
differences around text rasterization, fractional geometry, filters, and font
loading before deciding whether a mismatch is acceptable.

## Regeneration rule

When the approved source HTML changes materially, regenerate or revalidate the
specialized HTML from the source. Do not carry forward old generated structure
without checking source identifiers, rendered geometry, text, images, and
required capabilities.
