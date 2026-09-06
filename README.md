# Detail page Generation + html-to-ps POC

This package uses the supplied optimized `SKILL.md` as its design baseline and
adds an experimental one-time Photoshop handoff tool.

The design stage remains HTML/CSS-first and intentionally flexible.

The Photoshop handoff stage is optional and starts only after the design is
considered frozen.

## Important handoff principles

- Preserve the approved browser design; do not simplify typography, effects,
  composition, or markup merely to make conversion easier.
- Keep reconstructable content editable and degrade unsupported visuals through
  the smallest practical isolated local fallback.
- Photoshop 2024 is the first compatibility target.
- Document width: 1500 px.
- Resolution: 72 PPI.
- Photoshop canvas height grows downward per top-level section.
- Browser reference render is imported as the hidden top layer.
- Missing fonts remain a Photoshop/designer decision; the JSX does not
  substitute, rasterize, or convert text.
- The converter does not decide PSD vs PSB.
- After handoff, continue modifications in Photoshop rather than repeatedly
  round-tripping through HTML.

Current packaging requirements, conversion guards, supported editable
features, and known boundaries live in `tools/html-to-ps/README.md`; they are
tool implementation details rather than general design rules.

See:

- `references/html-to-ps.md`
- `tools/html-to-ps/README.md`
