# Outcome-first model routing

Read this at [W1](../SKILL.md#per-task-workflow) when a substantive task can use multiple models,
agents, expensive waves, or a shared provider pool. Keep model names and invocation mechanics in
the selected provider adapter.

## Objective order

Route lexicographically; do not collapse the priorities into a guessed weighted score:

1. Maximize the probability of an accepted completion while treating required quality,
   independence, security, and empirical evidence as hard gates; leave capacity to close them.
2. Among routes with a credible path through that gate, minimize expected total cost to acceptance.
3. Use wall time only as the final tie-breaker unless the owner states a deadline.

Count failed starts, repeated orientation, fix waves, review, and orchestrator cleanup in total cost.
Do not add token counts from different providers as if their tokens, caches, quotas, and prices were
comparable. Keep provider-native ledgers plus one task-level cap on expensive waves. When usage is
hidden, use the cap rather than invented precision.

## Controller and complete local route

Keep the agent of the open session as the single accountable controller and facilitator. Model
routing never transfers final synthesis, fan-out control, or completion authority to a delegate or
advisor. If a different model would have been a better session entry point, record that for the
next slice; do not create a second controller mid-task.

First resolve a complete route using only the selected provider: controller, implementer,
and two default reviewer contexts (technical correctness and intent/cleanup). Compose conditional
empirical, security, measurement, publication, and validator lenses into those contexts when their
required independence and expertise are compatible. Add a context only when they cannot be
composed, and name that reason; a role label alone never buys another context or wave. If the
harness natively exposes an already-authorized different-family reviewer, assign it to
one already-planned read-only reviewer slot under [C2](../SKILL.md#core-rule-c2-preserve-independent-roles-delegate-when-available).
Never increase reviewer count, waves, or fan-out solely for family diversity, and never make it a
completion dependency.
If delegation is unavailable, use
[C2](../SKILL.md#core-rule-c2-preserve-independent-roles-delegate-when-available)'s temporally
separated main-agent floor and name the degraded independence.

## Deterministic route classifier

Have the controller apply a small decision table before buying a separate classifier call. Classify:

- task shape: bounded implementation, mechanical/high-volume, runtime behavior, architecture, or
  high-risk security/concurrency/measurement;
- specification state: exact acceptance gate versus unresolved product/architecture ambiguity;
- evidence state: frozen diff, required runtime claim, affected test selector, and review evidence mode;
- resource state: available models, provider pool/reserve, and durable checkpoint;
- previous outcome: delivered, product/test failure, model-quality failure, or infrastructure.

Route bounded exact work to the provider's efficient implementer with a finite pass cap. Route
ambiguity and architecture to a stronger reasoning/advisory pass before more code. Preserve an
empirical slot for runtime and high-risk claims; cost pressure never converts an open behavior
claim into a verdict. Use efficient models for mechanical volume only with explicit scope and
content-preservation gates.

Classify a failed wave before spending another one:

- `CAPACITY/AUTH/TOOL/INFRA` — preserve partial artifacts, repair or change the execution route,
  and do not consume the model-quality fix pass;
- `SPEC_AMBIGUITY` — stop implementation, split or deliberate, and ask the owner only when the
  sources do not settle the decision;
- `QUALITY_FAILURE` — allow the adapter's one bounded fix, then split or promote rather than retry;
- `PRODUCT/TEST_FAILURE` — route the observed evidence to a bounded fix and re-review;
- `DELIVERED` — continue to the reserved independent review, empirics, and close gates.

Use a separate cheap classifier only when this table leaves a consequential ambiguity and the task
is large enough to repay another context. It may propose a routing note; it never routes itself.

## Waves, packets, and routing note

Run at most one heavy context at a time per genuinely shared provider pool. While a delegate is
heavy, keep the controller on lightweight coordination and checkpointing. Before each expensive
wave, refresh observable usage and write a durable, user-authorized checkpoint that links raw
evidence rather than only summarizing conclusions.

Send role-shaped packets: exact acceptance criteria and test gates to implementers; frozen diff,
contracts, and independent evidence entry points to reviewers; decisions and unresolved tensions
to deliberation advisors. Resume a context only when its retained orientation is cheaper and does
not compromise independence.

For a substantive task, record a compact routing note: task class, controller, role→model/effort,
required empirical mode, expensive-wave cap, completion reserve, fallback, and named degradation.
For a tiny task, compress this to one sentence rather than spending more on routing ceremony than
on the work;
[C1](../SKILL.md#core-rule-c1-empirical-verification-before-claim),
[C2](../SKILL.md#core-rule-c2-preserve-independent-roles-delegate-when-available), and mandatory risk gates
still hold.

## Learn without over-claiming

On material multi-model comparisons, record model or family, primary emphasis, findings inside and
outside that emphasis, validated overlap/unique findings, total completed waves, and accepted
outcome. Let every reviewer report any material defect it notices. Treat different primary
emphases as search priors, not blinders, and do not ask reviewers to praise one another's novelty.

Use this ledger to revise owner mappings on representative completed tasks. Unique findings are
evidence of incremental coverage, not by themselves proof that model family caused the difference;
fresh context, prompt, tools, and stochastic sampling remain confounders.
