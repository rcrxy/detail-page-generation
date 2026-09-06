# html-to-ps handoff

`tools/html-to-ps` is an optional finishing tool for a design that has already
been visually approved.

Its job is **handoff**, not redesign.

## Lifecycle

```text
AI design
  -> HTML/CSS
  -> browser render/review
  -> design freeze
  -> html-to-ps
  -> one-time JSX
  -> Photoshop 2024
  -> editable PSD work continues in Photoshop
```

After the handoff starts, do not redesign the page, rewrite copy, replace
assets, or simplify the composition merely to make conversion easier.

If a visual feature is difficult to reconstruct natively, the converter should
degrade locally rather than change the approved design.

## Target

Initial target:

- Adobe Photoshop 2024
- RGB document
- 1500 px fixed width
- 72 PPI
- height grows downward while sections are imported
- output script is one-time ExtendScript (`.jsx`)
- PSD vs PSB is not decided by the converter

## Design root

The HTML prototype should have one explicit root:

```html
<main id="detail-page">
  ...
</main>
```

The converter:

- screenshots only `#detail-page`;
- extracts only content inside `#detail-page`;
- never uses the whole `body` as the design bounds.

This prevents body margins, debug UI, helper elements, or unrelated DOM from
expanding the handoff width.

## Stylesheet placement

Skill-generated prototypes must embed their authored CSS in `<style>` elements
inside the HTML document. Do not use `<link rel="stylesheet">`, CSS `@import`,
or a separate `.css` file for prototype styles.

Keeping authored rules in the document makes `CSSStyleSheet.cssRules`
available to the extractor, including explicit text `width` and `height`
declarations used to choose Photoshop paragraph text. The extractor retains
its computed-layout fallback for pre-existing or third-party pages, but that
fallback is not a substitute for following this rule in newly generated HTML.

## Font policy

Do not use CSS `font-weight`.

When weight variation is needed, select a specific named font face/family, such
as:

- Bold
- Heavy
- Black
- Medium
- Light

Example:

```css
.title {
  font-family: "Source Han Sans CN Heavy";
  font-size: 88px;
  line-height: 104px;
}
```

Do not write:

```css
.title {
  font-weight: 800;
}
```

The converter preserves the requested font name and typography data. Chromium
records the platform fonts actually used to render each text node, including
glyph fallback when the first CSS family does not contain Chinese or another
required character. The generated JSX gives an explicit
`data-ps-font-postscript` value first priority, otherwise uses the dominant
browser-rendered PostScript name, and only falls back to resolving the CSS face
name against Photoshop's installed fonts when rendered-font data is
unavailable.

The JSX assigns the selected PostScript name to `TextItem.font`.
Matching is limited to the exact PostScript name, exact font display name,
exact `family + style`, a unique family, or the family's unique
Regular/Normal/Roman face. It never chooses a different family or synthesizes
boldness.

Scene groups also retain their effective font family. If a text node has no
font family in its scene data, the JSX walks its scene ancestry implicitly by
using the nearest parent group's inherited family. This is a final safeguard
for incomplete or manually adjusted scene data; normal browser extraction
already includes CSS inheritance through `getComputedStyle()`.

When Chromium reports multiple fonts for one text element, the scene records
all of them with glyph counts and the handoff report identifies the element.
Because the current POC creates one editable Photoshop text layer per HTML text
element, that layer uses the font responsible for the most rendered glyphs.

If Photoshop cannot use that font, the handoff script records a warning and
continues. It does not choose a replacement font, rasterize text, or convert
text to another representation.

When the exact PostScript name is known, `data-ps-font-postscript` remains the
authoritative override and bypasses browser-font detection and automatic name
resolution.

When Chromium provides a numeric computed `line-height`, the generated JSX
disables Photoshop `TextItem.useAutoLeading` and assigns the measured value to
`TextItem.leading`. These are separate node-local operations: failure in one is
reported for the specific text element without blocking the other operation or
later nodes.

## Geometry principle

Photoshop does not perform layout.

Chromium performs layout first, then the extractor records the final geometry.

The handoff therefore operates on:

- x/y;
- width/height;
- element center;
- rotation;
- opacity;
- paint order;
- final computed typography.

Flex, Grid, percentage widths, `calc()`, and other browser layout mechanisms do
not need Photoshop equivalents.

Whenever practical, use explicit `px` for typography and fixed visual
dimensions, but the extractor still uses computed browser geometry as the
source of truth.

For placed images and raster fallbacks, Photoshop layer bounds are not the
source of truth for scaling. `layer.bounds` excludes fully transparent pixels,
so using it would enlarge content inside a transparent PNG. The generated JSX
reads the placed Smart Object's full `smartObjectMore.transform` quadrilateral
and uses that canvas geometry for scaling and positioning. If Photoshop cannot
expose the Smart Object transform, the node falls back locally to visible-pixel
bounds and records a contextual warning.

## Optional semantic hints

The design is not required to use these attributes, but they improve layer
naming and conversion clarity without constraining the visual layout.

```html
<section data-ps-group="03-鞋底卖点">
  <h2 data-ps-name="卖点标题">稳固抓地</h2>

  <img
    data-ps-name="鞋底商品图"
    data-ps-role="image"
    src="./assets/sole.png"
  >

  <div data-ps-role="shape" data-ps-name="背景"></div>
</section>
```

Supported hints in the POC:

- `data-ps-group`
- `data-ps-name`
- `data-ps-role="text|image|shape"`
- `data-ps-ignore`
- `data-ps-flatten`
- `data-ps-font-postscript`
- `data-ps-text-mode="point|paragraph"`

Text is handed off as editable Photoshop point text by default. When the text
element itself matches an authored CSS rule or inline style that explicitly
declares `width` or `height`, the extractor automatically uses paragraph text.
Computed dimensions caused only by normal block layout do not trigger paragraph
mode.

For paragraph text, Chromium measures the final rendered element first. The
Photoshop script uses that measured `bounds.width` and `bounds.height` directly
as the paragraph text-box dimensions. It must not enlarge the height by a fixed
ratio or guess it from font size or line height.

Prefer text without an authored `width` or `height` for headings, labels,
captions, short descriptions, and text whose line breaks are explicitly
authored in HTML. Add a text-box dimension when fixed-width automatic wrapping
is part of the intended design.

Do not use `width` as a default styling habit for text. Before adding it, check
whether the content actually needs to wrap. In particular:

- a single-line heading or label should normally have no `width` or `height`;
- use parent layout, `left` / `right`, or transforms for placement instead of a
  redundant text width;
- keep `width` when browser wrapping at that boundary is intentional;
- use `height` only when the fixed vertical text-box boundary is intentional;
- an explicit `<br>` does not require paragraph text by itself and can remain
  point text when no text-box dimension is declared.

```css
/* Single line: becomes point text. */
.feature-title {
  position: absolute;
  left: 120px;
  top: 330px;
}

/* Intended automatic wrapping: becomes paragraph text. */
.feature-copy {
  position: absolute;
  left: 120px;
  top: 500px;
  width: 780px;
}
```

The generated Photoshop script names every non-empty text layer from the exact
text content assigned to that layer. `data-ps-name` remains useful for scene
diagnostics, but it does not override the final Photoshop text-layer name.

`data-ps-text-mode` has higher priority than automatic CSS detection. Use it
when the desired Photoshop behavior differs from the authored dimensions, or
when automatic detection must be overridden. If a local-file or cross-origin
stylesheet applies but does not expose its CSS rules, the extractor probes the
element's effective layout by temporarily comparing its rendered dimensions
with `width` / `height` set to `auto`, then restores the original inline style.
Apply an explicit mode to the text element itself:

```html
<p data-ps-name="卖点说明" data-ps-text-mode="paragraph">
  需要在固定宽度文本框内继续自动换行的说明文字。
</p>
```

Do not add paragraph mode merely because the HTML element is a `p`, heading, or
block element. The choice describes the desired Photoshop text-layer behavior,
not the HTML display type.

`data-ps-flatten` explicitly asks the extractor to preserve the rendered result
of that element as a local raster fallback.

## Conversion philosophy

Prefer editability, but preserve visual structure first.

Three conceptual outcomes are allowed:

1. `native`
   - editable text;
   - placed image / Smart Object;
   - simple background/color layer;
   - group.

2. `smart`
   - unsupported local visual is rendered and placed as a Smart Object.

3. `skipped`
   - conversion failed;
   - geometry is still preserved;
   - the rest of the document continues;
   - failure is written to the handoff report.

A failed element must never cause later sections to collapse upward. Geometry is
calculated before Photoshop import begins.

Every new DOM-node extractor, asset conversion, fallback, and Photoshop
scene-node builder must use the tool's per-node isolation boundary. A node
failure must be recorded with its top-level section, DOM locator, node ID, and
node type; conversion must then continue with the next sibling. Do not rely on a
section-wide catch as the normal node error boundary.

## Canvas growth

Do not create the final very tall canvas at startup.

Start with:

- width: 1500 px;
- a small initial height;
- 72 PPI.

Before importing each top-level section:

1. read the section's required bottom edge;
2. if it exceeds the current canvas height, extend the canvas;
3. anchor the resize to the top;
4. add new space only at the bottom;
5. import the section.

Resize once per section, not once per element.

## Browser reference layer

The root element is rendered to `reference.png`.

After all editable content is created, the generated JSX places that image at
the top of the Photoshop layer stack as:

`[REFERENCE] Browser Render - DO NOT EDIT`

The layer is:

- hidden by default;
- intended only for visual comparison;
- not used as the editable source.

## Current POC scope

The first implementation prioritizes:

- root-only screenshot;
- section groups;
- editable text;
- placed image Smart Objects;
- simple raster color blocks;
- position/size/opacity;
- basic rotation;
- layer naming;
- per-section canvas extension;
- local raster fallback;
- hidden browser reference;
- per-node error isolation;
- handoff report.

Later work may improve:

- vector shape layers;
- masks;
- gradients;
- shadows;
- border radius;
- complex SVG;
- more accurate text box reconstruction;
- advanced layer effects.

Field-verified conversion issues and authoring-avoidance notes live in
`tools/html-to-ps/README.md` (section *Known conversion issues & authoring
avoidance*); read it before handoff so known silent losses are not reintroduced.
