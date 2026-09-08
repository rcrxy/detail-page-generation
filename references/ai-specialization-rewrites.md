# AI specialization rewrite rules

Use this checklist when generating Photoshop-specialized HTML according to
`specialized-html-protocol.md`.

The objective is not to redesign the page or mechanically rewrite every CSS
feature. The objective is to produce the smallest useful structural changes
that improve Photoshop editability while preserving the approved browser
render.

## Preconditions

Before specialization:

- identify the approved source HTML;
- inspect the rendered `#detail-page`, not only source markup;
- confirm that the source file is not being overwritten;
- read the current html-to-ps README and supported capabilities;
- identify the top-level sections and meaningful visual components;
- identify unsupported or ambiguous visual effects;
- capture or retain a source browser reference;
- treat the product imagery and confirmed copy as immutable content.

If the design is still being actively changed, finish or pause those design
changes before generating the handoff copy.

## Decision order

For each meaningful visual component, choose the first faithful option:

1. Keep the source structure and add naming or role annotations.
2. Split a source element into a small number of independently editable layers.
3. Materialize a browser-only visual such as a pseudo-element as a real node.
4. Restructure layout-only wrappers without changing rendered geometry.
5. Isolate the smallest unsupported visual as a rendered fallback.
6. Leave the original structure for converter inference when specialization
   would be more fragile than the source.

Do not rewrite an element merely because a rewrite is possible.

## Risk levels

### Low-risk rewrites

AI may perform these by default when the intent is clear:

- copy the source HTML to an independent specialized file;
- inline a local stylesheet into a `<style>` element without changing rule
  order, specificity, URLs, or computed styles;
- add `data-ps-name` to meaningful text, image, shape, and fallback layers;
- add `data-ps-group` to meaningful section or component groups;
- add `data-ps-role` when the node's role is unambiguous;
- add source-trace attributes;
- materialize a simple decorative `::before` or `::after` as a real element;
- split a simple solid background from content when its geometry is stable;
- split a uniform solid border into an independent shape node;
- remove a layout-only wrapper when the same final geometry and stacking can be
  preserved exactly;
- add handoff-only CSS selectors scoped to the specialized document.

### Medium-risk rewrites

AI may perform these only after inspecting the rendered result and documenting
the source mapping:

- split mixed-style text into independently editable text runs;
- separate multiple decorative layers from one element;
- convert a clipped image composition into image and shape/mask parts;
- replace generated CSS content with real DOM text when the content is purely
  decorative and remains identical;
- flatten unnecessary DOM nesting into a Photoshop-oriented group structure;
- replace a complex background stack with multiple generated visual nodes;
- isolate a filter, mask, blend mode, complex transform, or SVG region as a
  local fallback;
- alter box-model implementation while preserving outer and content geometry.

### High-risk rewrites

Do not perform these automatically. They require an explicit user requirement
or an unavoidable fidelity reason recorded in the specialized file:

- `data-ps-ignore` on any visible element;
- `data-ps-flatten` around customer-facing text, product imagery, or a complete
  section;
- `data-ps-font-postscript` overrides not confirmed by browser or user data;
- replacing supplied imagery with rendered screenshots;
- merging several independently editable components into one fallback;
- changing text layout to fit Photoshop behavior;
- reconstructing complex gradients, masks, filters, or blends approximately;
- changing section dimensions to simplify layer placement.

## Allowed rewrite checklist

### File and CSS packaging

- [ ] Create a separate specialized HTML file.
- [ ] Preserve the original source file unchanged.
- [ ] Keep all authored CSS required for the render in `<style>` elements.
- [ ] Preserve stylesheet order and selector specificity.
- [ ] Rewrite asset URLs only as needed to keep them resolving from the new
      file location.
- [ ] Keep generated assets separate from original product assets.
- [ ] Remove scripts only when they are not needed to create the approved final
      static render.
- [ ] Do not introduce network dependencies.

### Root and sections

- [ ] Keep exactly one `#detail-page` root at 1500 px.
- [ ] Add `data-ps-specialized-version="0.1"` to the root.
- [ ] Record the source path when it can be expressed safely.
- [ ] Declare every required converter capability.
- [ ] Preserve top-level section order, bounds, and overlap.
- [ ] Give meaningful top-level sections `data-ps-group` names.
- [ ] Do not turn utility wrappers into noisy Photoshop groups.

### Naming and source mapping

- [ ] Name layers according to visible function, not HTML tag names.
- [ ] Assign one stable `data-ps-source-id` to each materially rewritten source
      element.
- [ ] Reuse that source ID on generated parts derived from the element.
- [ ] Mark generated nodes with `data-ps-generated="true"`.
- [ ] Record `data-ps-origin-part` and `data-ps-rewrite` on generated visual
      parts.
- [ ] Never add or preserve a manually authored `data-ps-node-id`.

### Backgrounds

- [ ] Keep simple backgrounds on the source element when they already produce a
      useful independent shape layer.
- [ ] Split a background only when content and background need independent PSD
      editing or when the source element would otherwise force a broad fallback.
- [ ] Make generated background nodes layout-neutral and correctly stacked.
- [ ] Preserve fill alpha and group opacity separately.
- [ ] Do not approximate gradients or background images with a solid color.
- [ ] Keep backdrop-dependent visuals in an appropriately scoped fallback.

### Borders

- [ ] Split a border when it belongs in PSD as an independent shape layer.
- [ ] Use `data-ps-role="shape"` and the correct `data-ps-shape-kind`.
- [ ] Preserve border width, style, color, alpha, radius, and bounds through
      computed CSS.
- [ ] Remove or disable the source border to prevent duplicate rendering.
- [ ] Preserve the original box model after removing the source border.
- [ ] Preserve the original stacking position relative to content and
      backgrounds.
- [ ] Declare `shape-stroke` and any required radius capability.
- [ ] Use local fallback for asymmetric, patterned, image-based, filtered, or
      otherwise unsupported borders.

### Pseudo-elements and decoration

- [ ] Materialize only visible pseudo-elements that can be represented exactly.
- [ ] Disable the original pseudo-element after materialization.
- [ ] Preserve generated text, dimensions, offsets, transforms, and stacking.
- [ ] Mark decorative DOM with `aria-hidden="true"` when appropriate.
- [ ] Do not convert CSS counters or dynamic generated content into stale text.
- [ ] Keep complex masks, filters, and ancestor-dependent blends in fallback.

### Text

- [ ] Preserve exact visible characters, punctuation, whitespace, and line
      breaks.
- [ ] Keep one text layer when one editable treatment is intended.
- [ ] Split only independently styled or independently positioned text runs.
- [ ] Preserve DOM order and browser wrapping after splitting.
- [ ] Use `data-ps-text-mode` only when point or paragraph intent is explicit.
- [ ] Do not use manual `<br>` changes to imitate Photoshop wrapping.
- [ ] Do not replace editable text with an image to hide font or measurement
      problems.
- [ ] Do not invent a PostScript font name.

### Images

- [ ] Preserve the exact supplied image file whenever possible.
- [ ] Preserve `object-fit`, crop, visible position, transparency, and
      transforms.
- [ ] Keep the image separate from labels and unrelated decoration.
- [ ] Split borders and backgrounds away from the image when useful.
- [ ] Keep clipping or masking as semantic parts only when the converter
      capability exists.
- [ ] Otherwise isolate the smallest composition that requires fallback.
- [ ] Never redraw, recolor, reshape, or replace the real product.

### Groups and wrappers

- [ ] Create groups around meaningful editable components.
- [ ] Preserve opacity at the correct group or child level.
- [ ] Remove or flatten layout-only wrappers only after preserving their final
      child geometry.
- [ ] Do not move a child across a stacking context without reproducing the
      original paint result.
- [ ] Do not use groups to conceal unsupported transforms or effects.

### Fallbacks

- [ ] Use fallback only after native annotation or faithful decomposition is
      unavailable.
- [ ] Choose the smallest self-contained visual boundary.
- [ ] Add a short factual `data-ps-fallback-reason`.
- [ ] Avoid flattening editable text and product images with unrelated effects.
- [ ] Preserve geometry even when the fallback cannot be created.
- [ ] Allow the converter to reject, narrow, or replace an AI fallback choice.

## Controlled rewrite patterns

### Pattern: annotate without restructuring

Use when the rendered element already maps cleanly to one Photoshop layer.

```html
<h2
  data-ps-role="text"
  data-ps-name="Selling point title"
  data-ps-rewrite="annotate-only"
>
  Lightweight comfort
</h2>
```

Do not wrap it in a new element unless grouping or visual separation requires
one.

### Pattern: split border from content

Use when one browser box should become a content group plus an editable
Photoshop stroke shape.

Required checks:

- the overlay matches the original border box;
- removing the original border does not move content;
- radius and border alpha remain identical;
- the border does not cover content differently;
- required shape capabilities are declared.

Do not use this pattern for asymmetric borders until the protocol and converter
support them explicitly.

### Pattern: materialize pseudo-element

Use when the pseudo-element is a simple line, color block, label, or decorative
shape.

Required checks:

- the real node has the same containing block;
- the pseudo-element is disabled;
- `content`, dimensions, transform origin, and z-order remain identical;
- the generated node is marked as decorative where appropriate.

### Pattern: split mixed text runs

Use when a source text element contains visibly different editable treatments.

Required checks:

- concatenated visible text is unchanged;
- whitespace between runs is preserved;
- baseline and wrapping remain unchanged;
- each run maps back to the same source element;
- splitting does not create one layer per character.

### Pattern: isolate unsupported effect

Use when a specific effect cannot be reconstructed faithfully.

```html
<div
  data-ps-flatten
  data-ps-rewrite="isolate-fallback"
  data-ps-fallback-reason="backdrop-filter depends on surrounding pixels"
>
  ...
</div>
```

Before selecting the boundary, test whether text, product imagery, or simple
shapes can remain outside it as editable siblings.

## Prohibited changes

The specialization stage must not:

- rewrite customer-facing copy;
- add, remove, reorder, or summarize product information;
- invent measurements, materials, colors, claims, or product facts;
- change supplied product image pixels or substitute another product image;
- change the approved art direction;
- remove visual effects because Photoshop reconstruction is difficult;
- change visible colors, spacing, typography, scale, crop, or composition to
  make conversion easier;
- force a node to native mode or write final scene types and bounds;
- duplicate visual values into metadata that can disagree with CSS;
- create `data-ps-node-id` values;
- hide unsupported content with `data-ps-ignore`;
- flatten the complete page as a conversion strategy;
- treat the specialized HTML as the new long-term design source.

## Conflict rules

When instructions conflict, use this priority:

1. Preserve real product content and confirmed facts.
2. Preserve the approved browser render.
3. Preserve meaningful editability.
4. Keep fallback local.
5. Improve naming and layer organization.
6. Reduce DOM complexity.

Never sacrifice a higher-priority condition to improve a lower-priority one.

If faithful decomposition is uncertain, retain the source implementation or
use a local fallback. Do not invent an approximate editable reconstruction.

## Completion checklist

Before handing specialized HTML to html-to-ps:

- [ ] The source file is unchanged.
- [ ] The specialized file declares protocol version and required capabilities.
- [ ] The page renders without missing local assets.
- [ ] `#detail-page` remains 1500 px wide.
- [ ] Root height and section geometry have been compared.
- [ ] Visible text matches the source.
- [ ] Image sources and visible crops match the source.
- [ ] Every generated node has trace metadata.
- [ ] Every explicit fallback has a narrow boundary and reason.
- [ ] No manual `data-ps-node-id` exists.
- [ ] No unsupported capability is silently assumed.
- [ ] Source and specialized browser references have been compared.
- [ ] Remaining differences and risks are recorded for the handoff report.

When verification is limited to syntax and logic inspection, perform only that
scope and clearly leave visual comparison as pending. Do not claim visual
equivalence without rendering both documents.
