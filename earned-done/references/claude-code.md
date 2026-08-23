# Claude Code adapter

Read this file only when the current provider is Claude Code.

## Invocation and task input

- Explicit invocation: `/earned-done <project-path> <task…>`.
- Treat appended `ARGUMENTS` as task input when the harness supplies them.
- If invoked without arguments, obtain the project path and task from the user's next message.

## Orchestration

- Use the Agent tool for implementer, reviewer, and validator roles.
- If this harness natively exposes an already-authorized different-family subagent, assign it to one
  already-planned read-only reviewer slot under [C2](../SKILL.md#core-rule-c2-preserve-independent-roles-delegate-when-available).
  Never increase reviewer count or fan-out for family diversity. Do not launch another provider CLI
  or inspect account state to manufacture that capability.
- Prefer read-only Explore agents for investigation and review.
- Use explicit worktree isolation for any delegate that must mutate files. The worktree branches
  from the repository's DEFAULT branch, not from the session's HEAD — a delegate can otherwise
  review or patch a tree that is not the one under discussion. State the intended base explicitly.
- **Verify placement and tools live.** Foreground/background behavior depends on the current mode
  and version; do not predict it from the prompt. Before relying on placement or nested work, check
  the live mode and the [Claude capability catalog](../capabilities/claude-code.md). A background agent has a reduced tool set:
  AskUserQuestion is absent, while Agent may remain available below the nesting limit. Restrict
  fan-out explicitly; background mode is not a no-delegation boundary.
- **Pick the agent type by whether you may need to chase the report.** Explore and Plan are
  one-shot: not resumable, not messageable, and they skip project instruction files (Explore
  inherits the session model, capped at Opus). Treat them as fire-and-forget. For any role whose
  report you might have to chase or extend, use general-purpose or a custom agent type, and use
  SendMessage/resume when an idle delegate has not delivered.
- **Budget a delegate-delivery check into the plan.** If an idle delegate has not returned its
  report, request delivery once before replacing the lane; distinguish an empty mailbox from a
  completed review.
- Require each delegate to return its final report to the orchestrator.
- Cap fan-out explicitly: say in the prompt whether the delegate may spawn its own delegates.
- Use AskUserQuestion only for a real owner decision that changes the work.

## Maintainer-tested model routing (optional)

Apply [model routing](model-routing.md); the mapping below does not override that reference's
controller and advisor-authority invariants.

This dated 2026-08-11 profile records a tested preference, not a universal requirement. A user or
project may replace it; live capability and the complete single-provider floor come first.

- Route implementation and fresh-context code review to Opus 5. Give review a frozen diff and an
  independent context when another Opus pass authored the code.
- Route bounded architecture/simplicity/dissent and deliberation to Fable 5. Claude Code's named
  Advisor may implement this semantic role only when the live main/advisor pairing supports Fable
  and independence is not required: it receives the full current conversation, so it is not a
  fresh-context reviewer. Otherwise use a model-selected subagent. Consult the Claude
  capability catalog before selecting the mechanism, model, and budget.
- Keep one implementation pass and one bounded quality-fix pass. Classify capacity/auth/tool/infra
  failures separately; they change the execution route rather than consuming the quality pass.
- If Opus or Fable is unavailable, fill every role with an available Claude-family model or
  [C2](../SKILL.md#core-rule-c2-preserve-independent-roles-delegate-when-available)'s main-agent
  floor and report the changed lens/cost. A native different-family reviewer remains optional.

## Capabilities to consider at plan time

Read the Claude capability catalog at plan time. It preserves the full use-when catalog for
orchestration, scheduling, skills, hooks, interaction, and memory.

## Project knowledge and configuration

- Project facts may use Claude Code project memory under
  `~/.claude/projects/<project>/memory/`, indexed by `MEMORY.md`. Only the first ~200 lines /
  ~25 KB of that index are loaded — keep it an index, not a store.
- Project instructions belong in the project's `CLAUDE.md` or `.claude/rules/`.
- Claude Code hook wiring belongs in `.claude/settings*.json`.
