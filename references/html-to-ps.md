# html-to-ps handoff

`tools/html-to-ps` is an optional finishing tool for a design that has already
been visually approved.

Its job is **handoff**, not redesign.

## Lifecycle

```text
AI design
  -> source HTML/CSS
  -> source browser render/review
  -> design freeze
  -> AI-generated Photoshop-specialized HTML
  -> specialized browser comparison
  -> html-to-ps
  -> one-time JSX
  -> Photoshop 2024
  -> editable PSD work continues in Photoshop
```

After the handoff starts, do not redesign the page, rewrite copy, replace
assets, or simplify the composition merely to make conversion easier.

If a visual feature is difficult to reconstruct natively, the converter should
degrade locally rather than change the approved design.

## Specialized HTML stage

Conversion must use an independent Photoshop-specialized HTML file rather than
the approved source file directly.

The specialized file is allowed to:

- add layer names, groups, roles, source mapping, and fallback hints;
- embed the CSS required by the current extractor;
- materialize browser-only visuals such as simple pseudo-elements;
- split a browser box into meaningful Photoshop parts such as background,
  border, content, and decoration;
- remove or reorganize layout-only wrappers when the browser result remains
  unchanged;
- isolate the smallest unsupported visual for rendered fallback.

It must not alter the approved content or visual design. The source HTML remains
the design source of truth, and the specialized file is regenerated or
revalidated after relevant source changes.

Read these documents before creating the specialized file:

- `specialized-html-protocol.md` defines the file and converter contract;
- `ai-specialization-rewrites.md` defines the allowed AI rewrite checklist.

The specialized file must declare capabilities that it requires from the
converter. A rewrite must not be described as editable when the current tool
does not yet implement the corresponding capability. Unsupported features keep
the smallest faithful local fallback until native reconstruction exists.

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

Prototype packaging requirements belong to `tools/html-to-ps/README.md` because
they depend on the current extractor implementation. They must not be expanded
into general visual-design restrictions.

When the current tool requires embedded authored CSS for reliable inspection,
follow that packaging requirement without changing the visual composition.
Pre-existing pages may still use the extractor's computed-layout fallback.

## Typography handoff

Typography should follow the approved visual design. The converter is
responsible for preserving editable text runs, rendered font faces, spacing,
line height, opacity, scale, and rotation whenever Photoshop can represent them
faithfully.

Current font-scanner restrictions and exact font-resolution behavior are tool
implementation details documented in `tools/html-to-ps/README.md`. They are not
a reason to reduce typographic variety. If an exact face cannot be applied,
record the issue for the designer rather than silently choosing a different
family or synthetic weight.

## Geometry principle

Photoshop does not perform layout.

Chromium performs layout first, then the extractor records the final geometry.

The prototype may freely use Flex, Grid, percentages, transforms, `calc()`, and
other browser layout features. The converter should consume their rendered
result rather than require Photoshop equivalents or restrict the composition.

Scene fields and Photoshop reconstruction details are defined by
`tools/html-to-ps/scene-schema.json` and `tools/html-to-ps/README.md`.

## Semantic hints

The source design is not required to use handoff attributes. The generated
specialized HTML should add them where they clarify the intended Photoshop
layer structure without changing the visual layout.

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

These attributes are optional handoff hints, not a required authoring grammar.
They are optional in the source HTML and selectively generated in the
specialized HTML. Use them only when they communicate useful handoff intent.
`data-ps-flatten` explicitly chooses one local rendered Smart Object; it must
not be added merely to compensate for a converter defect that can be fixed in
the tool.

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

The Photoshop document remains 1500 px wide at 72 PPI and grows downward while
top-level sections are imported. Canvas-resize mechanics belong to the
converter and must not influence the page composition.

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

This reference defines the stable handoff intent. Current extraction behavior,
scene fields, local fallback semantics, known boundaries, and future tool work
live only in:

- `tools/html-to-ps/README.md`;
- `tools/html-to-ps/scene-schema.json`.

The stable guarantees are:

- preserve the approved browser design rather than redesigning for Photoshop;
- keep text, images, shapes, and groups editable whenever reconstruction is
  faithful;
- degrade unsupported visuals through the smallest practical isolated local
  fallback;
- keep conversion failures local and report them with element context;
- include the hidden browser reference layer for visual comparison;
- leave PSD/PSB format and later editing decisions to the designer.
