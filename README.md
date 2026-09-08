# Detail Page Generation + html-to-ps

This package uses the supplied optimized `SKILL.md` as its design baseline and
adds a one-time Photoshop handoff compiler.

The design stage remains HTML/CSS-first and intentionally flexible.

The Photoshop handoff stage starts only after the design is frozen:

```text
AI design
  -> approved source HTML/CSS/assets
  -> AI lowering to independent specialized HTML
  -> mandatory source-to-specialized Visual Gate
  -> deterministic scene.json + one-time JSX
  -> Photoshop 2024
```

## Important handoff principles

- Keep approved source HTML/CSS/assets unchanged during handoff.
- Treat specialized HTML as a browser-renderable low-level visual IR, not an
  annotated source copy or a new design.
- Allow complete specialized DOM/CSS rewrites while preserving exact visible
  content, imagery, geometry, stacking, and pixels.
- Require the Visual Gate to pass before scene extraction or JSX generation.
- Keep reconstructable content editable and degrade unsupported visuals through
  the smallest practical isolated local fallback.
- Photoshop 2024 is the first compatibility target.
- Document width: 1500 px.
- Resolution: 72 PPI.
- Photoshop canvas height grows downward per top-level section.
- The approved source render is imported as the hidden, locked top reference
  layer. The specialized render is validation-only and does not enter the PSD.
- Missing fonts remain a Photoshop/designer decision; the JSX does not
  substitute, rasterize, or convert text.
- The converter does not decide PSD vs PSB.
- After handoff, continue modifications in Photoshop rather than repeatedly
  round-tripping through HTML.

Current packaging requirements, conversion guards, supported editable
features, and known boundaries live in `tools/html-to-ps/README.md`; they are
tool implementation details rather than general design rules.

See:

- `references/specialized-html-protocol.md`
- `references/ai-specialization-rewrites.md`
- `references/html-to-ps.md`
- `tools/html-to-ps/README.md`
