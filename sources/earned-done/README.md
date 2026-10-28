# Maintainer sources

Edit the [core catalogue](catalog.yml) and [routing catalogue](model-routing.catalog.yml) for
normative wording. Their paired [core template](skill.template.mjs) and
[routing template](model-routing.template.mjs) hold metadata, headings, ordering, and list layout;
keep prose in catalogue values as a maintainer convention. Templates are trusted JavaScript; the
core template may also contain its small numbered-list layout helper. The renderer checks catalogue
keys, nonempty values, unknown reads, and exactly one read per key, but does not inspect or sandbox
template code. The core template owns frontmatter and the
`Protocol revision: YYYY-MM-DD-rNNN.` line. Each key is
`ID — Meaning`; update its template reference in the same change when renaming a key. C/T/W IDs
in values are public normative IDs; S#/MR# map keys are local authoring labels and never render.
Neither local IDs nor key labels version the source: Git commits version values and layout together.
The read count does not prove a value is emitted exactly once or unchanged. Catalogue values use
YAML literal blocks (`|-`) with a uniform two-space base indent. Preserve internal indentation and
blank lines; do not use folded `>` blocks for prose. Markdown backticks, literal `${...}`, and
backslashes need no template-literal escaping. Core T/W rule bodies omit only the outer numbered-list
hanging indent; the core template supplies that layout.

Edit source, run `pnpm build:skills`, review the generated Markdown diff, then run
`pnpm check:skills`. Packing checks freshness before building the CLI; it does not regenerate
skill Markdown. Commit both source and generated output. The authoring sources and scripts are not
in the npm allowlist; public build and check use the maintainer-only `yaml` development dependency
to parse authoring sources. Installed skill directories are unchanged, and the CLI has no YAML
runtime dependency. Public build and check require no private evidence or Git history.
