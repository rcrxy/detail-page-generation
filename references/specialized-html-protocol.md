# Photoshop-specialized HTML protocol

Version: `0.1-draft`

This document defines the intermediate HTML format used between an approved
browser design and `tools/html-to-ps`.

The specialized HTML is a generated, browser-renderable low-level visual IR.
It is not an annotated source document. AI may replace the complete source DOM
and CSS implementation, but the resulting pixels, content, geometry, and asset
identity must remain equivalent to the approved source render.

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

This protocol is the required contract for the specialization stage. The main
path grammar is intentionally small:

```text
group
text
image
shape
raster
```

The main path does not depend on the converter rediscovering arbitrary browser
components. Explicit roles, groups, pixel geometry, and source trace are part
of the IR contract. Legacy CSS inference remains a compatibility fallback only.

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

Declare required converter capabilities as a space-separated list:

```html
<main
  id="detail-page"
  data-ps-specialized-version="0.1"
  data-ps-required-capabilities="shape-fill shape-ellipse source-trace-report"
>
  ...
</main>
```

Initial capability names are:

- `shape-fill`
- `shape-ellipse`
- `source-trace-report`
- `specialized-fallback-boundary`

Unknown required capabilities must produce a clear preflight error. Optional
capabilities must not be declared as required.

## Sources of truth

Keep each kind of information in one authoritative place:

- The approved source render determines the required visual result.
- CSS in the specialized document determines the IR browser render used by the
  Visual Gate.
- Explicit `data-ps-*` attributes determine primitive role, layer intent,
  grouping, source traceability, and fallback boundaries.
- Chromium reads the specialized document's final bounds and computed values;
  it does not infer the original design layout intent.
- The converter determines whether the requested Photoshop reconstruction is
  supported and faithful.
- The generated scene records what was actually applied.

Visual values belong in specialized CSS. Geometry and typography should be
explicit px values rather than percentages, relative units, inherited values,
CSS variables, or layout calculations.

## Primitive semantics

The following attributes define the main primitive grammar:

- `data-ps-group="Layer group name"`
- `data-ps-name="Layer name"`
- `data-ps-role="text|image|shape|raster"`
- `data-ps-ignore`
- `data-ps-flatten`
- `data-ps-font-postscript="ExactPostScriptName"`
- `data-ps-text-mode="point|paragraph"`

Every visible leaf primitive must declare a role. Every top-level section must
declare `data-ps-group`. `data-ps-role="raster"` and `data-ps-flatten` identify
the smallest faithful local fallback boundary.

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

- `copy-primitive`
- `lower-layout`
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

Use DOM nesting to express intended Photoshop group nesting. Group nodes do not
carry implicit layout semantics; their child primitives must already have
explicit final geometry.

Use `data-ps-group` for meaningful Photoshop groups, including:

- top-level detail-page sections;
- product image compositions;
- one selling-point visual and its labels;
- a card or panel whose children should remain grouped;
- a generated set of background, border, content, and decoration layers.

Remove browser wrappers whose only purpose is Flexbox, Grid, centering,
measurement, or CSS scoping. Section groups are `position: relative` with an
explicit 1500 px width and px height; section children should normally be
absolutely positioned primitives.

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

Protocol 0.1 main-path shape kinds are:

- `rectangle`
- `ellipse`

The element's computed CSS remains authoritative for:

- bounds;
- background fill;
- opacity;
- transform.

Shapes use a solid fill. Protocol 0.1 does not require native stroke or rounded
rectangle support. Unsupported effects must degrade locally and be reported.

### Straight border and grid decomposition

Lower straight borders, dividers, underlines, and grid lines into filled
rectangle primitives. Do not preserve CSS border semantics in the main path:

```html
<div
  class="feature-card"
  data-ps-group="Feature card"
  data-ps-source-id="source-card-02"
>
  <div
    class="feature-card__ps-line"
    data-ps-role="shape"
    data-ps-shape-kind="rectangle"
    data-ps-name="Bottom border"
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

.feature-card__ps-line {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 2px;
  background: #c8a26b;
  pointer-events: none;
}
```

Use one narrow rectangle for each visible edge. Removing the source border must
not change content position, outer dimensions, or stacking. Rounded, patterned,
image-based, or otherwise complex borders use the smallest local fallback until
a later protocol version defines a faithful primitive.

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

Every text primitive must explicitly set `font-family`, `font-size`,
`line-height`, and `letter-spacing`, using px for numeric values. Do not author
`font-weight` or the `font` shorthand. Select a real face such as Bold, Heavy,
Black, Medium, or Light through `font-family`, and do not invent a PostScript
font name.

Text primitives must not carry backgrounds, borders, shadows, or layout
container responsibilities. Split those visual parts into sibling primitives.

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

## Visual Gate

Conversion must compare:

```text
source HTML browser render
  vs
specialized HTML browser render
```

Compare the complete `#detail-page` at 1500 px and `deviceScaleFactor: 1` using
the same browser, context, viewport, and font environment. The gate must check
root dimensions, normalized visible text, source image inventory, and full-root
pixel difference. Thresholds must be explicit and reported.

Failure is a hard stop before scene or JSX output. Only the specialized file
may be changed to repair a failed gate. The approved source must remain frozen.

## Regeneration rule

When the approved source HTML changes materially, regenerate or revalidate the
specialized HTML from the source. Do not carry forward old generated structure
without checking source identifiers, rendered geometry, text, images, and
required capabilities.
