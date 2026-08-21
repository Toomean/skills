# Claude Code capabilities — planning catalog

Last synced: 2026-08-16 — model configuration, subagents, and Advisor behavior against official Claude Code
documentation; CLI flags re-verified against installed Claude Code `2.1.233`.

Read this after selecting the Claude Code adapter. These are planning triggers, not guarantees;
verify current official documentation before relying on semantics that affect correctness,
isolation, security, cost, or persistence.

## Model-positioning facts

- Official Claude Code docs describe Fable 5 as its most capable model for hardest, longest-running
  work and architecture/root-cause investigation. Availability and cost are live runtime facts; use
  an available Claude model when the preferred mapping is unavailable.
- The `opus` alias targets Opus 5 on the Anthropic API in current Claude Code and is positioned for
  complex reasoning. Exact provider alias resolution can differ; use the resolved model, not the
  spelling alone, as evidence.
- Claude Code's experimental named Advisor supports Fable for compatible main/advisor pairings. It
  receives the full current conversation and decides when to consult, so it can fill the protocol's
  deliberation/advice role after a live pairing check but cannot provide an independent fresh-context
  review. Use a model-selected subagent when an independent fresh context is required.
- Installed help exposes `--model`, `--effort`, `--fallback-model`, `--max-budget-usd`,
  `--no-session-persistence`, structured output, background agents, and `--worktree`; flags alone
  do not prove model/account availability or isolation behavior.

## Orchestration and parallelism

- **Workflow fan-out** — deterministic wide pipelines. Use for broad audits, repeated bug hunts, or
  large migrations; avoid for a normal single fix.
- **Agent tool** — independent implementer, reviewer, and validator contexts. Use for the protocol's
  role separation and parallel read-only research. Foreground/background selection depends on the
  live version and fork mode: installed `2.1.233` includes the interactive-fork default introduced
  in `2.1.232`.
  A background agent lacks AskUserQuestion but retains Agent below the nesting limit (default depth
  3 since `2.1.219`); restrict tools and fan-out explicitly instead of treating background mode as a
  no-delegation boundary.
- **Built-in agent types** — Explore and Plan are read-only, one-shot (not resumable/messageable)
  and skip project instruction files; Explore inherits the session model, capped at Opus.
  general-purpose can investigate, implement, and be resumed. Each subagent has a separate context;
  verify tool restrictions before treating them as a security boundary.
- **Agent teams** (experimental, behind an environment flag) — multiple named agents addressable in
  one session. Verify availability before planning around it.
- **Worktree isolation** (`isolation: worktree`) — separate checkout for mutating work. It branches
  from the repository's DEFAULT branch, not the session HEAD; name the intended base.
- **Skill subagent context** (`context: fork` / agent frontmatter) — use when a skill should execute
  outside the main context. `/fork` starts a separate session; `/subtask` stays in this one.
- **Dynamic workflows (ultracode)** — model-driven multi-step orchestration; use for large tasks
  where the step list is not knowable up front.

## Automation and scheduling

- **Background tasks** — long builds, tests, or installs that should not block interaction.
- **`/loop`** — polling or self-paced repetition within a live session.
- **Scheduled/cloud agents** — unattended recurring work or repository-event automation.
- **Advisor** — experimental background commentary at model-chosen decision points. Compatible
  pairings may use Fable, but the tool sees the full current conversation; use it for deliberation,
  not independent frozen-diff review, and verify the live main/advisor pairing first.

## Skills and extension

- **Skills** — reusable workflows, invoked with `/name` or selected implicitly from description.
- **Skill arguments** — `$ARGUMENTS`, positional `$ARGUMENTS[N]` / `$N` (numbering starts at ZERO),
  named arguments declared in the `arguments:` frontmatter, and `argument-hint`. Claude-adapter
  only; not part of the portable [core contract](../SKILL.md).
- **Manual-only invocation** (`disable-model-invocation`) — blocks automatic triggering AND the
  skill's preload into subagents and scheduled triggers. Use when auto-triggering would be unsafe
  or noisy.
- **Per-skill tool limits** (`disallowed-tools`, `skillOverrides`) — narrow what a skill may do, or
  override skill behavior per project.
- **Agent memory** (agent frontmatter) — durable notes for a specific agent type across runs.
- **Hooks** — deterministic lifecycle enforcement. Validate with the native event schema, a deny
  test, and a positive control.
- **MCP** — external tools and data that would otherwise be copied into chat repeatedly.
- **Plugins** — distribute related skills, agents, hooks, and commands as one package.

## Interaction

- **Plan mode** — use when strategy needs owner agreement before edits.
- **AskUserQuestion** — use for a genuine owner decision that changes the work; unavailable to a
  backgrounded subagent.
- **Web search/fetch** — current facts or documentation absent from the repository. WebSearch is
  capped around 200 calls per session — budget it on research-heavy tasks.
- **Model/effort selection** — match cost and reasoning depth to the task.

## Standing behavior and knowledge

- **`.claude/rules/`** — path-scoped standing instructions.
- **Output styles** — session-wide response persona or format.
- **Project auto-memory** — machine-local project facts under the provider's project-memory
  location; only the first ~200 lines / ~25 KB of `MEMORY.md` are loaded, and worktree sessions of
  the same project share one memory directory. Keep it separate from protocol evolution records.
