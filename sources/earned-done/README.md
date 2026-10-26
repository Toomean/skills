# Maintainer sources

Edit the [core catalogue](catalog.mjs) and [routing catalogue](model-routing.catalog.mjs) for
normative wording. Their paired [core template](skill.template.md) and
[routing template](model-routing.template.md) hold metadata, headings, ordering, and list layout;
keep prose in catalogue values. The core template owns frontmatter and the
`Protocol revision: YYYY-MM-DD-rNNN.` line. Each key is `ID — Meaning`; update its template
reference in the same change when renaming a key. C/T/W IDs in values are public normative IDs;
S#/MR# map keys are local authoring labels and never render. Neither local IDs nor key labels
version the source: Git commits version values and layout together.

Edit source, run `pnpm build:skills`, review the generated Markdown diff, then run
`pnpm check:skills`. Packing checks freshness before building the CLI; it does not regenerate
skill Markdown. Commit both source and generated output. The authoring sources and scripts are not
in the npm allowlist; public build and check need only Node's standard library, with no private
evidence or Git history.
