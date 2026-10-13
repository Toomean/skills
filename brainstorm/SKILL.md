---
name: brainstorm
description: Generate a broad, structured divergence artifact for hard design and ideation questions, then hand it to a downstream converger without choosing a winner. Use before committing to one of several plausible system/API designs, strategies, names, product or research directions, or whenever the first workable idea may be anchoring the decision. Use capability-aware independent generators and forcing-originality techniques to preserve provenance, tensions, dissent, edge cases, and open gaps. Do not use for mechanical tasks with one obvious path or for final selection and feasibility judgment.
---

# Brainstorm

Generate a wide field of ideas and shape it into a **divergence artifact** — a structured map
that a downstream *converger* (a human, or a separate agent with fresh context) can turn into a
decision. Treat this as a portable methodology, not a provider-specific harness. Use the
delegation mechanism available in the current environment only when delegation is both available
and authorized. Otherwise run explicitly separated generator passes yourself. Write the artifact
wherever the project already keeps notes.

The scope is deliberate: **this skill owns divergence, the artifact, and the handoff — not
the decision.** The way deep research produces a report and someone else acts on it, a
brainstorm produces a divergence artifact and someone else converges on it. A generating session
may remain anchored to its initial framing when assessing its own ideas — one reason to use the
asymmetric-critic rule (see [Handoff](#handoff-what-the-converger-does-so-write-for-it)).

## The core problem: two failure modes, both are *convergence*

1. **Premature convergence under single-context sampling.** On an open-ended task a capable model
   may commit to a trajectory. Later output in that shared context can remain conditioned on the
   first plausible framing, so apparent exploration may elaborate rather than expand it. This is a
   risk to check, not an inevitable property of every model or task; separated starting points are
   one way to seek width before evaluation.
2. **Mode collapse.** Even when told to list many ideas, LLMs can concentrate on a narrow region
   of familiar answers — individual ideas can look different while the *set* still covers few
   semantic regions, and later ideas may add less diversity. Treat "just be more creative" as an
   unreliable intervention rather than assuming it expands the semantic space.

Use convergence as the working failure assumption for a brainstorm. Apply the techniques below
to test for repetition and force separation.

> **Measure diversity by meaning, not wording.** Cluster by working mechanism or
> decision-relevant organizing principle. Carrier, interface, or presentation variants may share a
> parent cluster. When a variant materially changes constraints, cost, control surface, or failure
> modes, keep it as a separately identified variant entry under that parent, retaining its
> provenance. Record any known variant-specific trade-offs and failures, and mark unknown details
> instead of merging identities. Separate identity preserves a decision-relevant alternative; it
> does not by itself establish another mechanism kind. Use secondary membership when an idea spans
> regions; surface similarity remains incomplete evidence of semantic variety.

## The target: an illuminated repertoire, not a winner

The right mental model comes from quality-diversity search. MAP-Elites-style algorithms
return an "illuminated repertoire" — solutions that are high-performing *and* spread across
the feature axes of the space, showing what's possible in every region, instead of a single
optimum (Mouret & Clune 2015, https://arxiv.org/abs/1504.04909). The same shape works with
an LLM as the generator: QDAIF maintains an archive of diverse, high-quality creative texts
rather than one best answer (Bradley et al., ICLR 2024, https://arxiv.org/abs/2310.13032),
and FunSearch's islands model preserves population diversity as a precondition of its
discoveries (Romera-Paredes et al., Nature 2024,
https://www.nature.com/articles/s41586-023-06924-6).

A brainstorm's output is that repertoire. Collapsing it to a winner inside the same session
throws away the illumination and re-creates the convergence failure above — which is why
this skill ends at the artifact.

## The divergent phase (fill the space before reading it)

Divergence and evaluation must not blur — early evaluation can narrow the field. Here the
separation is structural, not merely sequential: evaluation belongs to a *different agent,
downstream* (see Handoff), not to a later phase of the same session.

Goal: **width proportional to the task and available budget.** Before generating, choose and
record one session size based on problem complexity and current time, token, and agent budget:

- **Ordinary/default:** 3 widening rounds, at most 3 generators or separated passes, and roughly
  20–40 substantive bullets total.
- **Deep/explicit opt-in:** 5–7 widening rounds, at most 8 generators, and hundreds of bullets when
  the user explicitly requests deep exploration and the available budget supports it.

Reduce these caps when the environment is tighter. Never expand an auto-triggered ordinary
brainstorm into a deep session silently. Within the selected cap, favor quantity over judgment and
approach the problem from deliberately different angles.

The field is not wide enough to hand off until all four coverage axes below are addressed. The
three numeric floors total twenty bullets — the bottom of the 20–40 budget above. Prior art is a
required fourth axis, not an additional count: at least one counted mechanism entry must name an
existing neighboring or unrelated-domain mechanism and translate it to this problem.

| Coverage axis | Ordinary floor | Deep session |
|---|---|---|
| Mechanisms that differ in *kind*, not in phrasing | 5 | one or more per generator |
| Prior art — how neighboring systems and unrelated domains already solve this | ≥1 counted mechanism entry; never skipped | one domain per generator |
| How each mechanism breaks: edge cases, failure modes | 5 | ≥1 per mechanism |
| What each mechanism costs: trade-offs, tensions, constraints | 10 | scales with mechanisms |

Hitting a number is not the achievement; leaving an axis empty is the failure. A session that
clears every count while every entry sits in one region has not diverged — recheck it against the
semantic-diversity rule above before stopping.

For a deep session, tell each generator: **"Generate broadly without evaluating; stay within the
assigned share of the agreed budget."** For an ordinary session, assign each generator or separated
pass a distinct angle and a concrete bullet cap. If the field becomes tidy and repetitive before
the selected budget is used, apply a forcing-originality technique rather than ranking ideas.

Use at least one forcing-originality technique to counter mode collapse. Exclusion is the cheapest
of them: asking for a *good* or an *interesting* version of something leaves the target undefined
and tends to return whatever is most familiar, whereas naming the three or four answers you already
expect and ruling them out pushes the sample elsewhere. Confirm that "elsewhere" is semantically
different rather than assuming it. See
[`ideation-techniques.md`](ideation-techniques.md) for the catalog
(exclusion constraints, inversion, SCAMPER, random-seed, morphological analysis, analogy,
worst-possible-idea, and more); reach for one whenever generation gets generic.

## The round loop

A brainstorm advances by **re-entering the same question from a fresh angle**, never by
re-attempting a pass that came out badly. Nothing has failed when the next round opens; the field
is simply still too narrow. Each widening round claims territory the earlier ones left alone. The
closing round generates nothing: it clusters what exists on meaning, attaches provenance, and names
the gaps — filing work, not verdict work.

The session size selected above sets the round count. Stop under it the moment a round returns
variants of regions already mapped, and never run past it to satisfy a bullet count.

### The in-session reviewer's only remit is territory

Run a **reviewer alongside generation that is scored on ground opened, not on quality found.**
Across the widening rounds it holds no authority to declare the field sufficient; every response
it gives must point somewhere unoccupied:

- "Name a region of this problem nothing has landed on yet."
- "Whose account of it is missing — an expert in Y? A skeptic? A user? An adversary?"
- "Delete assumption Z. What becomes buildable that wasn't?"
- "Argue the reverse position — then the deliberately worst version, then how another industry
  already handles it."

Quality-gating is *convergent* work; it belongs downstream, not in this session. A reviewer
that filters early risks narrowing the field it is supposed to widen.

**Diverse critics, dissent preserved.** When you use critics, vary their viewpoints rather than
assuming the ritual of "debate" creates diversity. Consensus-seeking debate can suppress minority
ideas. During divergence, keep the responses that disagree most; do not vote toward a single
answer — carry the dissent forward explicitly.

## Run it: prefer independent fan-out when available

**Prefer diverse, independent fan-out when the environment supports and authorizes it.** Treat
same-session passes as less independent than fresh contexts, even when their prompts differ. Do
not assume that a named provider, orchestration tool, model family, or delegation permission
exists. Inspect the capabilities and authorization available in the current session before
delegating.

When delegation is unavailable or not authorized, use an honest single-agent fallback: run
multiple clearly separated generator passes with different forcing seeds and without carrying
candidate rankings between passes; then switch hats, write a widening review for missing angles,
and assemble the artifact. Record this limitation in provenance. Treat these passes as weaker than
fresh-context draws, but do not skip divergence or silently claim multi-agent independence.

Diversity is **multi-axis**, not a ladder. Three orthogonal axes — combine every one
available:

- **Model.** Treat different model families or tiers as a potential source of different draws,
  not a guaranteed quality ordering. ReConcile reported gains from cross-model pools in its
  measured collaborative-reasoning setting (https://arxiv.org/abs/2309.13007); do not generalize
  that result to every ideation task. Which families this environment exposes and authorizes is a
  runtime harness fact, not an assumption. If no different-family context is already available,
  preserve independent same-provider draws without prompting for provider setup.
- **Independence.** Fresh contexts, no cross-visibility between generators — brainwriting.
  Available even when you only have one model.
- **Forcing/seeds.** A different persona, forcing technique, exclusion list, random seed, or
  sub-question per generator.

Same-model is *not* automatically a trap. In simulated multi-agent debates studied by Choi et al.,
initially neutral agents tended to align with a numerical majority or more capable agents
(https://arxiv.org/abs/2506.01332). A controlled multi-agent debate study likewise found group
diversity important relative to several structural knobs in its experiments
(https://arxiv.org/abs/2511.07784). Use these as reasons to preserve independence and vary forcing,
not as universal comparative claims.

**Locked environment** (e.g., egress restricted to a single API family): seek diversity through
independence, forcing, and tier variation. Do not claim these are equivalent to cross-family draws;
record the available axes in provenance.

Concretely:

- If delegation is available and authorized, start several generators **that do not see each
  other's output**, each seeded differently:
  a different persona, a different forcing technique, a different sub-question, or a different
  random seed — and on different models/tiers where you have them.
- As a practical heuristic, try diverse *ordinary* roles before famous-genius personas:
  "a logistics clerk / a night-shift nurse / a hobbyist." Treat any breadth difference as
  task-dependent, and keep personas role-based to reduce stereotype risk.
- As the orchestrator, dedupe on meaning, cluster, and assemble the artifact,
  recording which generator/axis produced what. Do not have the generators vote a winner —
  nobody in this session picks one.
- Enforce the selected session cap and tell each generator to return its own bounded list, not to
  delegate further.

### After independence: pass-around and recombination rounds

Independence comes first; two optional widening rounds can follow it:

- **Pass-around.** Each generator builds on another's list (classic brainwriting's second
  step). Extension, not evaluation.
- **Recombination.** Unlike pass-around, first draft clusters by working mechanism or
  decision-relevant organizing principle; the closing round rebuilds them. Ask 2–3 parents from
  different clusters for offspring combining those bases.
  Few-shot parents act as a recombination operator (Language Model Crossover,
  https://arxiv.org/abs/2302.12170); the broader diversity-preserving pattern appears in Evolution
  through Large Models (https://arxiv.org/abs/2206.08896) and FunSearch. Keep offspring alongside
  parents; fold any offspring with no new question, working mechanism, or
  decision-relevant organizing principle into an existing cluster with provenance, without ranking.
  Iterated quality filtering is convergent work and stays downstream.

### Practical diversity heuristics

Try these as task-dependent heuristics, not as an evidence-backed universal ordering:

- **Condition against prior ideas explicitly.** Feed a *representative subset* of what's been
  generated back in with "produce ideas substantively distinct from these." Prefer a subset to
  keep the contrast legible; do not claim it is universally the highest-value lever.
- **Reason before committing.** A short structured reasoning pass before emitting ideas is a
  possible heuristic for reducing fixation or idea similarity in some settings; effects may depend
  on task and model. Do not present this as a measured universal effect.
- **Inject a random seed** (a random word/string the agent must bridge to the problem) — a
  low-cost alternative to changing sampling parameters, not a guaranteed superior novelty
  intervention.

Use these cautiously when the goal is semantic breadth:

- **Temperature alone.** May increase surface or lexical variety without adding semantic regions,
  and may reduce coherence.
- **Tree/Graph-of-Thought as a "diversity engine."** They optimize a reasoning *path* inside a
  proposed solution space and are not, by themselves, evidence that the semantic space expanded.
  Borrow only the lightweight move: branch → contrast mechanisms → *recombine* branches from
  distant regions.
- **Structured templates (SCAMPER, etc.) as guaranteed novelty.** They're useful scaffolds for
  *coverage*, but don't promise originality on their own — pair them with exclusion/anti-modal moves.
- **"Just be creative" / genius-persona prompts.** Do not assume these expand the space; inspect
  the resulting semantic coverage.

## Long sessions: checkpoint

On a long brainstorm, checkpoint occupied and blank regions and their common patterns without
ranking or choosing; compress earlier bullets thematically when notes sprawl.

In explicit deep runs, if durable working notes are authorized, generators may persist bounded raw
contributions to assigned targets and return a digest and pointer; otherwise use bounded returns.
Each raw note carries a stable source ID, session/round, assigned role/scope, forcing seed or
technique, exclusions, and model/tier if exposed. Disclose whether each source was read fully,
selectively, or only by digest; never claim unread material was clustered. Impose no fixed path or
ordinary-run persistence. On deep-run resumption, check surviving notes' identity, declared scope,
parseability, and obvious truncation; retain them without regeneration, and keep spent work in budget.
Territory-review the map before assigning gaps; mark map-aware later passes less independent. Record
the resume boundary, missing sources, and lost unpersisted orchestrator reasoning.

## The artifact contract

What the downstream converger receives. The divergence artifact is **not a dump** — an
unstructured transcript pushes this session's work onto the converger and hides how
independent the ideas really were. Required contents:

- **The idea field, clustered by meaning** — not by wording, not by generator — each cluster
  named for its substance.
- **Provenance** per cluster/idea: generator/pass, model/tier when exposed, persona, forcing
  technique or seed, and sub-question. Deep or multi-session work adds a compact manifest of
  participants/passes, shared inputs, available/missing axes, and resume boundaries. Before calling
  recurrence independent, record shared brief/context, assigned gap, template, or cross-visible
  sources. Treat agreement on those seeds as possible common-input echo. Preserve
  independently developed transformations; report remaining recurrence as observation, not verdict.
- **Tensions and trade-offs** surfaced during generation.
- **Edge cases and failure modes.**
- **Distinct and underexplored regions** — areas that expand coverage or still need generation,
  stated without a verdict, ranking, or claim that they are promising. Leave selection to the
  downstream converger.
- **Dissent, preserved** — the most-disagreeing and minority ideas kept explicitly, not
  averaged away; deep/multi-session artifacts use stable source-qualified IDs and a compact index.
  Their handoff must require the converger to build a source-first ledger before candidate
  selection, then record every dissent ID's fate and reason; it must also require reviewers to read
  source dissent before reading any convergence text.
- **Open gaps** — the angles you know were not explored.
- **No winner. No feasibility verdict.** Both belong downstream; name requested selection as
  deferred and identify the handoff.

Write it wherever the project already keeps working notes — a scratch file, the task's notes.
Don't impose a fixed path or filename.

## Handoff: what the converger does (so write for it)

This skill does not execute convergence, but the artifact must be written to *serve* a
converger who acts only after this skill invocation has returned the artifact — a human, or an
agent with fresh context. **During the current invocation, do not spawn or consult that
converger, consume its verdict, or include its result, even when the same prompt requests a
winner; identify the deferred handoff and stop.**
A competent converger does three things; each explains a part of the contract above:

- **Diverse-subset selection.** From a potentially large field, pick a covering, non-redundant
  working set — the shape formalized by Determinantal Point Processes (Kulesza & Taskar 2012,
  https://arxiv.org/abs/1207.6083) and by submodular / facility-location coverage objectives.
  This is why clusters and provenance matter: they *are* the coverage structure.
- **Evidence-grounded novelty and feasibility.** LLM-as-judge novelty is unreliable: LLM
  evaluators favor their own generations (self-preference, Panickssery et al., NeurIPS 2024,
  https://arxiv.org/abs/2404.13076), carry systematic judgment biases (Ye et al. 2024,
  https://arxiv.org/abs/2410.02736), and rate generated research questions highly novel where
  domain experts sharply disagree — the "novelty mirage" (https://arxiv.org/abs/2606.12071).
  Assess prior art through **retrieval**: an actual search for "does this already exist," with
  evidence snippets — OpenNovelty describes retrieval and evidence snippets for scholarly
  prior-art/novelty assessment (https://arxiv.org/abs/2601.01576). Retrieval supports prior-art
  assessment; it does not itself justify discarding ideas or verify feasibility. Assess feasibility
  separately against relevant evidence. Apparent novelty alone does not establish execution value.
- **Asymmetric refinement.** Refinement loops (Self-Refine / Reflexion style) *converge*,
  not diverge. As a budget heuristic, cap them at ~1–2 rounds unless task-specific evidence
  justifies more, and use a critic that is
  **asymmetric** to the generators: fresh context, different persona, ideally a different
  model. A generator judging its own work in shared context can favor its own framing. Never
  accept a single model's self-score as the verdict.

If no converger is set up yet, say so at the top of the artifact — do not quietly become one.

## Quality indicators

A **good divergent phase** stays inside its declared session budget and still leaves every coverage
axis populated — mechanisms differing in kind, the prior art, how each mechanism breaks, and what
each one costs. Prefer multiple
independent generators and diversity axes when delegation is available and authorized. Otherwise,
accept explicitly separated single-agent passes with different forcing seeds and honest provenance;
do not mislabel them as independent contexts.

A **good divergence artifact**: clusters named by substance; provenance attached; tensions,
edge cases, distinct and underexplored regions, and open gaps explicit; the strangest dissenting
ideas still visible; a converger could start selecting without re-reading the raw transcript —
and no winner anywhere in it.

## Anti-patterns

- ❌ **Evaluating during divergence** — skips the breadth phase; the single most common miss.
- ❌ **Picking a winner inside the brainstorm** — the generating session converging on its own
  field is the asymmetric-critic violation this skill exists to prevent; hand off instead.
- ❌ **Stopping at the first workable idea** — elaborating the opening framing and filing it as
  exploration.
- ❌ **Ignoring the selected width budget** — stopping before ordinary coverage targets or silently
  expanding an ordinary session into a deep, hundreds-of-bullets run.
- ❌ **A lone session where fan-out was available and authorized** — one distribution sampling
  itself; prefer independent generators whenever the environment permits them.
- ❌ **Connected homogeneous generators without forcing** — shared context can amplify a dominant
  voice; use independence and varied forcing to seek broader same-model draws.
- ❌ **No exclusion constraints / no forcing technique** — output may narrow toward familiar
  patterns.
- ❌ **"Interesting" / "good" left undefined** — an undefined target can bias generation toward
  familiar patterns.
- ❌ **Debating toward consensus while diverging** — majority views may erase minority ideas.
- ❌ **Handing off a dump** — an unclustered transcript with no provenance, dissent, or gaps.
- ❌ **Trusting a model's self-score on novelty** — novelty claims need retrieval-grounded
  evidence downstream, not a judge's enthusiasm.
- ❌ **No semantic-diversity or dedup check** — assuming the set covers distinct regions without
  checking ideas on meaning. Check coverage during divergence; leave novelty verification against
  external prior work to the downstream converger.

## Cited claims

Sources are cited inline, next to the claims they support. Two background sources are not
cited above: Du et al. 2023, the standard multi-agent-debate baseline the debate studies
build on (https://arxiv.org/abs/2305.14325), and a blind expert review that found
LLM-generated research ideas rated *more* novel than human experts' — while flagging LLM
self-evaluation failures and limited diversity in LLM generation (Si, Yang & Hashimoto
2024, https://arxiv.org/abs/2409.04109).

The uncited levers (condition-against-prior-ideas, reason-before-committing, random-seed vs
temperature, ordinary-vs-genius personas, the fixation and mode-collapse framing, and the
surface-novelty-vs-execution gap) are retained only as practical heuristics. Do not present them
as established comparative results. Treat each cited result as evidence for its measured setting,
not as a universal prescription; the classic forcing techniques predate LLMs and are adapted here.
