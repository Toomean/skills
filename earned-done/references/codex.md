# Codex adapter

Read this file only when the current provider is Codex.

## Invocation and task input

- Explicitly mention `$earned-done` in the prompt.
- Put the project path and task in ordinary prompt text; do not assume positional skill arguments.
- Repository skills live in `.agents/skills`; user skills live in `~/.agents/skills`. Codex scans
  `.agents/skills` upward to the repository root, plus `/etc/codex/skills`.

## Orchestration

- Use subagents for implementer, reviewer, and validator roles only when current instructions
  authorize delegation and the capability is available.
- If this harness natively exposes an already-authorized different-family subagent, assign it to one
  already-planned read-only reviewer slot under [C2](../SKILL.md#core-rule-c2-preserve-independent-roles-delegate-when-available).
  Never increase reviewer count or fan-out for family diversity. Do not launch another provider CLI
  or inspect account state to manufacture that capability.
- Treat subagent selection, messaging, continuation, and concurrency controls as runtime-exposed
  capabilities, not portable command names. Use only the controls the current harness exposes; if a
  required control is unavailable, follow [C2](../SKILL.md#core-rule-c2-preserve-independent-roles-delegate-when-available)'s
  degraded mode rather than making the plan depend on an assumed interface.
- Agents share the workspace unless an independently verified mechanism provides isolation. Claims
  of automatic per-subagent worktrees contradict the official documentation — keep the conservative
  stance and verify before relying on isolation.
- Keep mutating delegates sequential in a shared tree. For parallel mutations, explicitly create
  disposable worktrees with validated absolute paths.
- Reviewers are read-only by default. An empirical reviewer receives write/exec capability only in
  the disposable copy that passed [CodeReview step 0](../CodeReview.md#order-of-operations); verify the live tree after it returns.
- When delegation is unavailable or prohibited, declare portable degraded mode and perform separate
  implementation, skeptical review, and empirical-verification passes in the main agent.

## Maintainer-tested model routing (optional)

Apply [model routing](model-routing.md); the mapping below selects workers and advisors without
overriding that reference's controller invariant.

This dated 2026-08-11 profile records a tested preference, not a universal requirement. A user or
project may replace it; live capability and the complete single-provider floor come first.

- Prefer GPT-5.6 Sol medium/high when choosing the entry model for substantive Codex-led
  orchestration. Use a fresh Sol high/xhigh context for frozen-diff review.
- Route exact, bounded implementation to GPT-5.6 Luna max with one implementation pass and one
  bounded quality-fix pass. After another `QUALITY_FAILURE`, split the slice; use Terra for a still-
  bounded cost/quality step or Sol for ambiguity, advanced security/concurrency, and hard design.
- Treat `CAPACITY/AUTH/TOOL/INFRA` as an execution-route failure: preserve partial artifacts,
  re-provision or fall back, and do not burn the quality-fix pass. Treat `SPEC_AMBIGUITY` as a stop-
  coding signal, not a reason to ask Luna to try the same implementation again.
- If a preferred model is unavailable, complete the full role graph with an available Codex model
  or [C2](../SKILL.md#core-rule-c2-preserve-independent-roles-delegate-when-available)'s main-agent
  floor, and report the changed cost/lens; never require another provider.

Capture `/status` before an expensive plan and refresh it before each expensive wave when the
surface exposes it; otherwise record usage as unknown and honor the pre-agreed wave cap. Count the
controller and OpenAI delegates against the same pool: keep at most one OpenAI context heavy at a
time, with lightweight coordination around it. Before the next expensive wave, write a durable
project-authorized checkpoint; `/tmp` is never its sole copy.

If the native subagent selector lacks Luna, use an available Codex model or the [C2](../SKILL.md#core-rule-c2-preserve-independent-roles-delegate-when-available)
main-agent floor. Do not add an out-of-process provider route merely to preserve the preferred
mapping.

## Adversarial reviews need defensive framing

Frame defensive review as code hardening against misuse, not as operational instructions for abuse.
A classifier rejection is a tool failure, not a clean review
([T5](../SKILL.md#reasoning-traps)).

## Capabilities to consider at plan time

Read the [Codex capability catalog](../capabilities/codex.md) at plan time. It provides the corresponding use-when catalog for
orchestration, sandboxing, skills, hooks, interaction, persistence, and integrations.

## Project knowledge and configuration

- Codex has no assumed one-to-one equivalent of Claude Code auto-memory. Store durable project facts
  only in a user-authorized project document. Use `AGENTS.md` for standing instructions, not as an
  unreviewed scratch memory.
- `~/.codex/config.toml` is the primary configuration; a repository's `.codex/config.toml` is loaded
  ONLY when that repository is marked `trust_level = "trusted"`. Profiles are selected with `-p`.

## Git guardrail hook

Codex hooks are now a published contract (see the catalog), but hook TRUST IS BOUND TO THE HOOK'S
HASH: editing a hook silently stops it from firing until it is confirmed again. Treat a hook as
enforcement only after re-confirming it post-edit with a deny-test plus positive control. The
existing [`git-guardrails.sh`](../hooks/git-guardrails.sh) is still not declared Codex-compatible — do not install or
advertise it as a Codex enforcement hook until such a test proves Codex actually blocks the call.
