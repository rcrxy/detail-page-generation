---
name: detail-page-generation
description: >
    Create, refine, review, or hand off progressive visual-reference prototypes
    for Taobao/e-commerce product detail pages from partial product information,
    supplied image folders, and optional references. Use this skill for 1500 px
    mobile-oriented HTML/CSS detail-page concepts, editable Photoshop handoff,
    or auditing and improving the bundled html-to-ps conversion tool and its
    boundaries.
---

# Taobao Detail Reference

Create a **visual reference for a Taobao/e-commerce product detail page**.

The result is a design reference, not production frontend code and not a final
marketplace upload. It may later be recreated or refined manually in
Photoshop/PSD.

Use a fixed **1500 px** canvas width. Height follows the content.

Design primarily for **mobile users scrolling vertically**. The 1500 px canvas
is a high-resolution e-commerce design canvas, not a desktop website layout.

## Core objective

Turn the currently available product information, selling points, supplied
images, and optional references into a coherent product-detail visual concept.

The user may provide information and assets progressively. Do not require all
product data or all images before useful work can begin.

Favor strong product communication, clear hierarchy, coherent art direction,
appropriate information density, mobile readability, and layouts that are
practical to recreate in PSD.

## Creative freedom

Preserve broad visual and compositional freedom by default.

Use any suitable art direction, typography, layout system, layering, imagery,
decoration, effects, masks, gradients, transforms, or visual rhythm that helps
communicate the product while respecting the essential constraints below.

Conversion capability must adapt to the approved design. Do not omit, replace,
or simplify a visual idea merely because the current Photoshop handoff tool
cannot reconstruct it natively. Preserve it through the smallest practical
local fallback and improve the converter when possible.

Treat semantic handoff attributes and implementation conventions as optional
technical aids, not as a required design grammar.

## Essential constraints

### Preserve the real product

Prefer supplied real product images for the product itself.

Never alter the product's real:

- color;
- shape;
- structure;
- material appearance;
- design details;
- visible physical characteristics.

Supplied product photos may be cropped, rotated, scaled, repositioned, combined,
or visually emphasized with separate overlays.

AI-generated imagery may support backgrounds, scenes, models, atmosphere,
decoration, or conceptual reference visuals.

Do not silently replace a missing real product photo with an invented
AI-generated version of the product.

### Do not invent product facts

Never fabricate product-specific parameters, measurements, materials, colors,
sizes, heel heights, technical specifications, certifications, or factual
claims.

Unknown factual information may remain unknown.

General category knowledge may improve explanatory or marketing copy only when
it does not create unsupported product-specific claims.

Avoid absolute or exaggerated advertising claims.

### Keep internal planning language out of customer-facing copy

Internal merchandising and workflow labels must not appear in final
customer-facing copy unless the user explicitly wants them there.

Treat labels such as `主推`, `核心卖点`, `重点展示`, `高优先级`, `Hero`,
`卖点 1`, and similar planning notes as internal metadata by default.

Express the underlying intent naturally instead of exposing the planning label.

### Keep the page mobile-oriented

The prototype width is fixed at **1500 px**.

Design for vertical mobile browsing and long-page scrolling.

Do not treat the canvas as a desktop multi-column webpage.

Mobile-first does not mean sparse. Use whitespace intentionally, but do not
create large empty areas that contribute nothing to hierarchy, product focus,
information rhythm, or readability.

### Mobile text readability

Customer-facing text must remain comfortably readable when the 1500 px detail
page is viewed at normal mobile-screen width.

Do not use small text merely to imitate editorial, fashion, or desktop web
layouts.

Explanatory copy, selling-point descriptions, product information, and other
meaningful text must be large enough to read without zooming.

Very small type may be used only for non-essential decorative metadata,
eyebrows, numbering, or minor labels.

As a practical default on the 1500 px canvas:

- primary body / explanatory text should generally be at least 52–64 px;
- secondary but meaningful text should generally be at least 44–52 px;
- non-essential captions or decorative metadata should generally not go below
  36–40 px.

These are readability baselines, not a mandatory typography system. Larger type
is encouraged whenever the composition benefits from it.

Choose text width, wrapping, line breaks, transforms, font faces, and other
typographic treatments according to the composition. Do not change them merely
to obtain a preferred Photoshop text-layer type. The converter should infer or
locally preserve the rendered result.

### Implementation choice

Use plain **HTML + CSS** as the efficient default implementation.

JavaScript or a frontend framework may be used when it materially improves the
visual concept, interaction, iteration workflow, or a user-requested outcome.
The rendered design remains the handoff source of truth.

Do not impose html-to-ps packaging conventions during ordinary visual design.
When editable handoff is actually requested, read the current tool README and
apply only technical packaging changes that preserve the rendered result. If a
tool requirement conflicts with the approved design, improve the converter or
use a local fallback instead of reducing the design.

## Progressive work

Work with whatever information and assets currently exist.

Missing information or images should not block unrelated design work.

When new information or assets arrive:

- inspect them;
- incorporate them where useful;
- revise affected parts;
- avoid rebuilding unrelated sections without a reason.

Do not force the user to organize every image or fill every field before work
can continue.

## Images and references

Inspect supplied image folders proactively.

Folder names and filenames may contain useful hints, but they are not
authoritative. User instructions and visible image content matter more.

Reference images may influence composition, typography, color, photography,
spacing, density, or overall mood. Use them selectively rather than mechanically
copying or merging every characteristic.

See `references/asset-guidance.md` only when more detailed asset-handling
guidance is useful.

## Default page structure

A typical page may contain:

1. **Hero / Main Slogan**
2. **Selling Point Summary** — optional
3. **Selling Point Sections**
4. **Product Information**
5. **Product Gallery** — optional

This is a default structure, not a rigid template.

Adjust module count, order, composition, typography, color, spacing, visual
rhythm, and optional sections when another solution better communicates the
product.

Do not omit important purchase information merely for aesthetic minimalism.

## Selling points

Selling-point sections should **visually communicate the selling point**, not
merely place a related image beside text.

Use any suitable visual treatment when it improves communication while
preserving the real product.

Possible visual techniques are inspiration, not requirements. See
`references/visual-toolbox.md` when useful.

## Product information

Include important purchase information that is actually known.

For footwear this may include brand, item/model number, upper material, colors,
outsole material, size range, heel height, size chart, measurement method, and
other supplied attributes.

Do not fabricate missing measurements or specifications.

## Missing or generated assets

If a desired supporting image does not exist, continue with unaffected work.

When useful:

- describe the missing visual;
- create a placeholder;
- write an image-generation prompt;
- generate supporting imagery if an image-generation tool is available.

Image-generation failure must not block the overall page design.

Keep generated supporting assets separate from original supplied product images.

## Copywriting

The user may provide complete copy, partial copy, or only selling-point ideas.

Preserve confirmed facts and make the final text customer-facing.

Expand modestly when useful, without inventing product-specific facts.

If the user explicitly says specific copy must not be changed, preserve it.

## Working approach

Plan only as much as is useful before designing.

Create or refine the prototype progressively.

Do not create status documents, inventories, plans, or checklists merely to
satisfy this skill.

The exact design process is intentionally flexible.

When rendering is available, inspect the actual rendered page and improve the
parts that are visually weak, unclear, repetitive, overly sparse, or generic.

Do not perform production-style linting, refactoring, test coverage work, or
engineering cleanup unless the user asks for it.

## Modification requests

When the user asks to modify an existing design or section, first evaluate the
request for clarity and internal consistency.

If the request is clear and unambiguous, proceed with the modification directly.

If any part of the request is ambiguous, underspecified, internally conflicting,
or could reasonably lead to multiple materially different interpretations:

1. Do not modify the design yet.
2. Briefly explain how you currently understand the request.
3. Point out the ambiguous part only when necessary.
4. Ask the user to confirm or correct that interpretation.
5. Wait for confirmation before making the modification.

Do not invent missing intent merely to keep the workflow moving.

Minor implementation details that do not materially affect the user's intended
design do not require confirmation and may be decided autonomously.

## Output

Produce only what is useful for the current stage.

Possible outputs include:

- HTML/CSS prototype;
- rendered full-page reference;
- section renders;
- copy drafts;
- missing-asset requirements;
- image-generation prompts;
- brief design notes.

The result should remain useful if handed directly to a designer for manual PSD
recreation.

See `references/handoff-guidance.md` only when a more detailed PSD handoff is
requested.

## Photoshop handoff (html-to-ps)

When the user asks for an **editable PSD handoff** of a finished design, use the
optional `tools/html-to-ps` pipeline (see `references/html-to-ps.md`).

Before starting conversion, always generate an independent
Photoshop-specialized HTML file. Keep the approved source HTML unchanged. The
specialized copy may add handoff semantics, embed its required CSS, and
restructure selected visual parts into a clearer Photoshop layer model while
preserving the approved browser result.

Follow:

- `references/specialized-html-protocol.md` for the specialized-file contract;
- `references/ai-specialization-rewrites.md` for allowed AI rewrites and
  preservation rules.

Even when no structural rewrite is needed, create the independent specialized
file and use it as the converter input. In that case the specialization may be
limited to packaging, source traceability, layer naming, grouping, and role
annotations.

The specialized HTML is a generated handoff artifact, not a new design source.
Regenerate or revalidate it when the approved source changes. Do not silently
assume converter support for a protocol capability that the current tool README
does not implement.

Never reduce or change the visual design to make conversion easier; the pipeline
degrades locally instead. Current conversion behavior and boundaries live in
`tools/html-to-ps/README.md` and `tools/html-to-ps/scene-schema.json`; do not
copy their changing implementation details here.

## html-to-ps audit and maintenance

When reviewing conversion quality, tool boundaries, or a reported handoff
problem:

1. Read the tool's current known boundaries.
2. Inspect the actual extractor and JSX generator code before accepting a
   documented workaround as necessary.
3. Fix conversion behavior first in `tools/html-to-ps/src` whenever practical.
4. Update the scene schema and tool README to match the implemented behavior.
5. Update other reference files only when their stable handoff guidance changed.
6. Change this `SKILL.md` last, and only for stable workflow or target
   conditions rather than temporary converter limitations.

Do not solve a conversion defect by adding a new authoring prohibition unless
it is an unavoidable target condition. Prefer native editable reconstruction,
then the smallest isolated local fallback, and only then a contextual warning
or skipped node.

When the user limits verification scope, follow that scope. Source inspection
and editor diagnostics may be used without running conversion, packaging, or
test commands.
