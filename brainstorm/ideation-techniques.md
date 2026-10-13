# Ideation techniques

Use these practical heuristics against mode collapse (see the core [`SKILL.md`](SKILL.md)). They aim to move generation
away from generic, training-frequent patterns, but their effects depend on the task and model.
A useful recurring move is to replace an unbounded request for an "interesting" version with
explicit exclusions of obvious patterns; inspect semantic coverage rather than assuming novelty.

Legend: **[S]** single-agent prompt move · **[M]** natural fit for multi-agent (one variant
per parallel generator) · **[S/M]** either.

| # | Technique | When to reach for it | The concrete move |
|---|-----------|----------------------|-------------------|
| 1 | **Exclusion constraints** [S/M] | At the start, or whenever output turns generic | Name the 3–5 obvious answers and forbid them: "every idea must differ structurally from these." This aims generation away from the obvious region; verify the semantic result. |
| 2 | **Inversion / reverse brainstorming** [S/M] | Direct ideation stalls; failure modes are more legible than success modes | "List all the ways to *guarantee the worst outcome* / actively cause the problem," then mirror each answer back into a preventive or constructive idea. |
| 3 | **SCAMPER** [S] | Improving an *existing* thing (not greenfield) | Loop the target through seven prompts/lenses: **S**ubstitute, **C**ombine, **A**dapt, **M**odify/magnify, **P**ut to another use, **E**liminate, **R**everse/rearrange. These are prompts, not guaranteed orthogonal directions. |
| 4 | **Random-seed / random-word** [S/M] | Breaking fixation; a problem that resisted conventional angles | Inject an unrelated word/string, force a bridge to the problem, derive ideas from the link. Multi-agent: a *different* seed per generator. Treat this as a low-cost alternative to changing temperature, not a guaranteed better one. |
| 5 | **Morphological analysis (Zwicky box)** [S] | Multi-component problems where the solution is a *combination* of sub-choices | List 5–7 independent parameters; 3–5 options each; generate by picking one *non-obvious* option per parameter. Prune incompatible combos. |
| 6 | **Analogy / biomimicry / cross-domain** [S/M] | The problem's deep structure resembles a solved problem elsewhere; you want a step-change | "Name 3 distant domains facing a structurally analogous problem; describe their solution; translate the *mechanism* (not the surface) back." Multi-agent: one source domain per generator. |
| 7 | **First-principles decomposition** [S] | Inherited assumptions seem to be the real constraint | "What is definitely true here (physics, cost floors, hard requirements)? Separate facts from assumptions; rebuild a solution from only the facts, ignoring how it's normally done." |
| 8 | **Worst-possible-idea** [S/M] | Over-filtering; a cautious model or a stalled warm-up | "Generate the 5 worst, most absurd, guaranteed-to-backfire ideas," then extract the useful kernel from each or flip it into a viable one. This may surface hidden "we can't do that" assumptions. |
| 9 | **Assumption-busting** [S/M] | The solution space feels artificially narrow | "List every assumption and constraint. For each, generate ideas assuming it's false/absent (budget infinite, no time limit, users behave oppositely)." |
| 10 | **Six Thinking Hats** [S/M] | Structuring a whole session, or coordinating a panel | Sequence by mode — White=facts, Red=intuition, Black=risks, Yellow=value, Green=new ideas/provocation, Blue=process. Generate under Green. Black and Yellow can surface risks and tensions; neither ranks ideas nor filters the field. Multi-agent: one hat per agent, Blue = facilitator. |
| 11 | **Brainwriting / 6-3-5** [M] | You want breadth *and* independence before convergence — the canonical multi-agent map | N generators each produce K ideas *without seeing each other's output*; then one pass-around round where each builds on another's list; then dedupe/cluster. Independence-first is the load-bearing property. |
| 12 | **Provocation / "Po"** [S/M] | Entrenched patterns; random-word isn't disruptive enough | State a deliberately impossible proposition ("the factory is downstream of itself"), don't judge it — *move* from it: what new angle or principle does the absurdity suggest? |

## LLM-specific: forcing the tail of the distribution

Composable levers layered on top of the above — combine several rather than leaning on any one:

- **Anti-modal prompt** — "generate answers a typical model would *not* give; avoid the N most
  likely responses" (a specialization of #1).
- **Persona diversity** — assign distinct role-based personas per generator. As a heuristic, try
  diverse ordinary roles ("a night-shift nurse," "a hobbyist") as well as archetypes; inspect
  breadth rather than assuming one class is superior, and avoid stereotype-based prompts.
- **Divergent–convergent decoupling** — sample many candidates broadly, then a *separate* critic
  pass filters for utility. Use this separation instead of assuming one sampling knob can optimize
  both novelty and quality.
  (In this skill the critic pass lives with the downstream converger — see the core
  [Handoff](SKILL.md#handoff-what-the-converger-does-so-write-for-it) —
  never in the generating session.)
- **Condition against prior ideas** — feed a representative *subset* of what's been generated back
  in with "produce ideas substantively distinct from these." A subset keeps the contrast prompt
  manageable; do not assume it always outperforms the full field.

## What not to over-rely on

- **Raising temperature** for novelty — may change surface/lexical variety without adding new
  semantic regions.
- **SCAMPER / structured templates as a novelty *guarantee*** — they can scaffold coverage but do
  not establish originality; pair them with exclusion (#1) or anti-modal moves.
- **"Just be creative"** — do not assume it expands semantic coverage; inspect the result.

Treat all comparative effects here as task-dependent heuristics. The [core method](SKILL.md) scopes its cited claims
to the measured settings; the classic techniques here predate LLMs and are adapted for LLM
sessions.
