# html-to-ps 0.1

One-time compiler for the final half of the handoff pipeline:

```text
approved source HTML
  + AI-generated specialized HTML
  -> protocol preflight
  -> mandatory Visual Gate
  -> scene.json
  -> one-time Photoshop ExtendScript
  -> Photoshop 2024
```

The tool does not design the page and does not generate specialized HTML.
After the JSX runs, Photoshop becomes the working source.

## Requirements

- Node.js 20+
- Playwright / Chromium
- Adobe Photoshop 2024
- Windows is the first supported environment

Install:

```bash
npm install
npx playwright install chromium
```

## Inputs

The main path requires two different documents:

- `--source`: frozen approved design HTML;
- `--specialized`: independent protocol 0.1 low-level visual IR.

The source and specialized paths cannot identify the same file. The build does
not modify either input.

The specialized root must declare:

```html
<main
  id="detail-page"
  data-ps-specialized-version="0.1"
  data-ps-source="./source.html"
  data-ps-required-capabilities="shape-fill shape-ellipse source-trace-report"
>
  ...
</main>
```

Read `../../references/specialized-html-protocol.md` for the complete IR
contract and `../../references/ai-specialization-rewrites.md` for lowering
rules.

## Build

```bash
npm run build -- \
  --source ./source.html \
  --specialized ./source.ps.html \
  --out ./handoff-output
```

Options:

```text
--source          approved source HTML file or http(s) URL (required)
--specialized     specialized HTML file or http(s) URL (required)
--out             output directory (default: ./handoff-output)
--root            design root selector (default: #detail-page)
--name            Photoshop document name (default: detail-page)
--initial-height  initial Photoshop canvas height (default: 1000)
--no-headless     show Chromium while extracting
```

Example:

```bash
npm run demo
```

The example contains:

- independent `example/source.html` and `example/specialized.html`;
- rectangle and ellipse primitives;
- editable text and image primitives;
- a rotated product image;
- one smallest-boundary raster fallback.

## Build order

The build uses one Chromium browser and one context for both inputs:

1. Load source and specialized pages with the same viewport and
   `deviceScaleFactor: 1`.
2. Wait for fonts and images.
3. Validate specialized protocol version, capabilities, groups, roles, shape
   kinds, source trace, primitive rules, and font policy.
4. Capture `source-reference.png` and `specialized-reference.png`.
5. Compare canvas geometry, normalized visible text, source image inventory,
   and full-root pixels.
6. Stop on any Visual Gate failure.
7. Extract scene nodes only from the validated specialized page.
8. Package portable paths and generate the one-time JSX.

Default pixel thresholds are strict:

```text
max changed pixels: 0
max changed pixel ratio: 0
max channel delta: 0
```

Thresholds and observed values are written to `visual-validation.json`.

## Outputs

```text
handoff-output/
├─ source-reference.png
├─ specialized-reference.png
├─ visual-validation.json
├─ scene.json
├─ assets/
├─ fallback/
└─ build-detail-page.jsx
```

`handoff-report.txt` is written when the JSX runs in Photoshop.

All paths embedded in `scene.json` and JSX are relative to the handoff output
directory, so the complete package can be moved together.

## Protocol capabilities

The current capability registry supports:

- `shape-fill`
- `shape-ellipse`
- `source-trace-report`
- `specialized-fallback-boundary`

Unknown required capabilities fail preflight. The tool does not silently
downgrade a required editable capability.

## Scene 0.1

`scene.json` records:

- canvas geometry and 72 PPI resolution;
- specialization protocol version and required capabilities;
- SHA-256 source digest;
- Visual Gate result path;
- approved and specialized reference paths;
- `group`, `text`, `image`, `shape`, and `raster` nodes;
- structured `sourceTrace` on scene nodes;
- native, smart, or skipped outcomes and warnings.

`referenceImage` remains as a compatibility alias for
`approvedReferenceImage`. It never refers to the specialized render.

## Photoshop output

The generated JSX creates:

- a 1500 px wide, 72 PPI RGB document;
- downward canvas growth before each top-level section;
- editable text layers;
- placed image Smart Objects;
- native vector rectangle and ellipse fill layers;
- local rendered Smart Objects for explicit raster fallbacks;
- `[REFERENCE] Approved Design - DO NOT EDIT` as the hidden, locked top layer.

`specialized-reference.png` is not placed in the PSD.

The script does not save PSD or PSB. Photoshop and the designer decide the
final format.

Run in Photoshop 2024:

1. Open File -> Scripts -> Browse.
2. Select `build-detail-page.jsx`.
3. Review warnings and skipped nodes in `handoff-report.txt`.
4. Toggle the approved design reference layer when comparing the reconstruction.
5. Continue subsequent editing in Photoshop.

## Font policy

Specialized HTML must not author `font-weight` or the `font` shorthand. Select
real Bold, Heavy, Black, Medium, or Light faces through `font-family`.

Chromium records the rendered PostScript face when available. JSX applies that
exact face and does not synthesize weight, silently replace a family, or
automatically rasterize missing fonts. Missing faces are warnings for the
designer.

## Failure isolation

Every browser node extractor and Photoshop scene-node builder keeps failures
local:

- a failed node preserves measured geometry when possible;
- image materialization failure attempts a local raster fallback;
- a failed group allows children to continue in the parent group;
- later siblings and sections continue;
- warnings include section, locator, node id, type, source id, and rewrite.

## Compatibility path

`extractScene({ validateProtocol: false })` exists only for internal regression
tests of the previous arbitrary-HTML heuristics. The public CLI does not expose
a raw single-input mode. Flex/Grid text probing, pseudo capture, border/backdrop
inference, and similar logic are compatibility fallbacks rather than the 0.1
main path.

## Current boundaries

- native shapes currently support solid rectangle and ellipse fills only;
- stroke, rounded rectangle, gradients, masks, clipping, blend modes, filters,
  and transformed groups require the smallest faithful local fallback;
- Photoshop text layout can still differ from Chromium and must be checked
  against the approved source reference;
- native Shape Layer execution requires manual Photoshop 2024 acceptance;
- Photoshop versions other than 2024 are outside the current target.

## Verification

```bash
npm run check
npm test
npm run demo
```

`npm run check` performs syntax checks only. `npm test` runs protocol, Visual
Gate, primitive/source trace/reference, failure isolation, and compatibility
fidelity tests. `npm run demo` executes the full source + specialized build.
