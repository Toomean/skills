# brainstorm

A portable, project-agnostic method for exploring a hard design or ideation question before
choosing an approach. It produces a structured **divergence artifact** — idea clusters named by
meaning, provenance, tensions, dissent, and open gaps — for a downstream converger (a human or a
separate agent with fresh context). This skill owns divergence and handoff, not the decision. The
agent that generated the field may be biased by its framing, so a fresh-context handoff is intended
to mitigate that risk; it does not make selection impossible in the original context. The method is
in [`SKILL.md`](SKILL.md).

## Layout

- [`SKILL.md`](SKILL.md) — the provider-neutral method: divergent phase, capability-aware fan-out,
  artifact contract, and handoff spec.
- [`ideation-techniques.md`](ideation-techniques.md) — practical prompt moves
  such as exclusion constraints, inversion, SCAMPER, random seeds, analogy, and brainwriting.

## Install

`brainstorm` is available through the [public installation guide](https://github.com/Toomean/skills#install)
for Vercel Skills, npm, and Git-checkout options. It can be used on its own; `earned-done` is an
optional complement.

## Using it

Invoke `/brainstorm` in Claude Code or `$brainstorm` in Codex before committing to an approach when
several plausible choices exist — for example, in system/API design, strategy, naming, or product
and research ideation. Skip mechanical tasks with one obvious path. The skill runs a budgeted
divergent phase (20–40 substantive bullets for an ordinary session; hundreds only for an explicitly
requested deep session), using forcing techniques and independent generator contexts when
delegation is available and authorized. Otherwise it runs explicitly separated passes in one
session. It ends with an artifact and handoff; it does not choose a winner.

Convergence — diverse-subset selection, retrieval-grounded prior-art assessment, separate
feasibility evidence, and asymmetric refinement — belongs to the downstream converger. Retrieval
and evidence snippets can inform prior-art and novelty assessment; they do not by themselves verify
whether an idea is feasible. See the core [handoff](SKILL.md#handoff-what-the-converger-does-so-write-for-it).

## Relation to `earned-done`

These skills address separate concerns. `brainstorm` explores an open design question before a task
is shaped. `earned-done` is an optional workflow for carrying out a task with empirical
verification and independent review. A human or a designated fresh-context converger may use
`earned-done` after choosing an approach, but brainstorm works on its own and does not require that
skill.
