# Handoff Guidance

The normal output is a visual reference. When an editable Photoshop handoff is
requested, read `html-to-ps.md`, generate an independent specialized HTML file
according to `specialized-html-protocol.md` and
`ai-specialization-rewrites.md`, then use `tools/html-to-ps` as the current
conversion implementation source of truth.

Starting handoff must not trigger a redesign. Preserve the approved visual and
fix conversion losses in the tool when practical; otherwise degrade only the
unsupported local visual.
