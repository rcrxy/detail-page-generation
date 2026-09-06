# Detail page Generation + html-to-ps POC

This package uses the supplied optimized `SKILL.md` as its design baseline and
adds an experimental one-time Photoshop handoff tool.

The design stage remains HTML/CSS-first and intentionally flexible.

The Photoshop handoff stage is optional and starts only after the design is
considered frozen.

## Important handoff rules

- Photoshop 2024 is the first compatibility target.
- Document width: 1500 px.
- Resolution: 72 PPI.
- Photoshop canvas height grows downward per top-level section.
- Browser reference render is imported as the hidden top layer.
- `font-weight` is prohibited in generated CSS.
- Use explicit Bold/Heavy/Black/etc. font faces through `font-family`.
- Missing fonts remain a Photoshop/designer decision; the JSX does not
  substitute, rasterize, or convert text.
- The converter does not decide PSD vs PSB.
- After handoff, continue modifications in Photoshop rather than repeatedly
  round-tripping through HTML.

See:

- `references/html-to-ps.md`
- `tools/html-to-ps/README.md`
