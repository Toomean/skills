# Codex capabilities — planning catalog

Last synced: 2026-08-21 — model positioning, subagents, skills, hooks, and configuration against
official OpenAI guidance; the exec surface below was re-verified against installed
`codex-cli 0.149.0`.

Read this after selecting the Codex adapter. These are planning triggers, not guarantees; verify
current official Codex documentation before relying on semantics that affect correctness,
isolation, security, cost, or persistence.

## Model-positioning facts

- Official guidance positions GPT-5.6 Sol as the frontier model for complex professional work,
  Terra as the intelligence/cost balance, and Luna for cost-sensitive high-volume work. It does
  not assign protocol roles such as orchestrator, implementer, or reviewer; those dated owner
  choices live in the [Codex adapter](../references/codex.md).
- GPT-5.6 exposes single-agent effort through Max. Ultra is a distinct provider-managed mode that
  automatically delegates divisible complex work to subagents; do not describe it as merely more
  single-agent reasoning. Higher effort or automatic fan-out is not automatically the best route:
  compare completed tasks and count a resource reduction only when the accepted result still meets
  its quality/evidence gate.
- Model availability, account limits, and `/status` visibility are runtime facts. Probe them before
  a plan depends on them rather than promoting one machine's access into this catalog.

## Orchestration and parallelism

- **Subagents** — bounded independent implementation, research, review, or validation when current
  instructions authorize delegation. Model/type selection, messaging, continuation, and concurrency
  controls are runtime-exposed capabilities rather than portable command names. Inspect the current
  harness surface before a plan depends on one; if it is unavailable, use the adapter's degraded
  mode.
- **Parallel tool calls** — independent read-only checks or searches. Do not parallelize mutations
  against a shared filesystem.
- **Explicit disposable worktrees** — use for parallel mutating agents; a separate context alone is
  not filesystem isolation, and automatic per-subagent worktrees are not documented.
- **Plan mode/task plan** — use when strategy or sequencing needs agreement and tracked status.
  `/goal` is an official command for stating the session objective.

## Execution and automation

- **Background exec/wait** — long builds, tests, or installs while retaining progress reporting.
- **Sandbox modes** — `read-only`, `workspace-write`, and `danger-full-access`. Use the least
  privilege compatible with the task. `codex sandbox <cmd>` runs a single command under the sandbox.
- **Approval policies and auto-review** — control actions beyond the sandbox boundary. Auto-review
  reviews eligible approval requests; it does not expand permissions. Interactive `codex` takes
  `-a/--ask-for-approval`; **`codex exec` does not** — there the levers are the sandbox mode plus
  the explicit wideners (`--add-dir`, sandbox `-c` overrides, the `dangerously-*` flags).
- **`codex exec` surface** — `--output-schema` (structured result), `-o/--output-last-message`,
  `--json`, `resume`, `fork`, `review`, `--ephemeral`, `--add-dir`, `--ignore-user-config`,
  `--ignore-rules`, `--strict-config`, and `--approve-for-me`. Use for provider-local scripted work
  with a machine-checkable result.
- **Other commands** — `codex apply`, `codex fork`, `codex plugin`, `codex doctor`, and
  `codex mcp-server`, which exposes Codex itself as an MCP server (bridgeable from another harness,
  e.g. `claude mcp add`).
- **Automations/goals** — scheduled, monitored, or long-running work when the surface exposes them.

## Skills and extension

- **Skills** — reusable workflows discovered from `.agents/skills` (scanned upward to the repo root)
  or `~/.agents/skills`, plus `/etc/codex/skills`; invoked by mentioning `$skill-name` or selected
  implicitly from `description`.
- **Open skill standard** (agentskills.io) — portable frontmatter (`name`, `description`, `license`,
  `compatibility`, `metadata`, `allowed-tools`); Gemini CLI reads the same `~/.agents/skills`, so a
  skill written to this contract travels between harnesses.
- **Skill UI metadata** (`agents/openai.yaml`) — optional display metadata, invocation policy, and
  dependencies. Not required for the portable skill body.
- **Plugins** — distribute related skills and optional MCP integrations.
- **Hooks** — published lifecycle contract: `PreToolUse`, `PermissionRequest`, `PostToolUse`,
  `PreCompact`, `PostCompact`, `SessionStart`/`SessionEnd`, `SubagentStart`/`SubagentStop`,
  `UserPromptSubmit`, `Stop`. Configured in `.codex/hooks.json`, `~/.codex/hooks.json`, or a
  `[hooks]` table in `config.toml`; a hook blocks via exit code 2 or a JSON deny. **Trust is bound
  to the hook's hash** — an edited hook silently stops firing until re-confirmed, so re-run the
  deny-test plus positive control after every edit.
- **MCP/apps/connectors** — live external data and authorized actions.
- **Web search** — current public information; prefer connected sources for private workspace data.

## Interaction and configuration

- **User questions/approvals** — use when a material decision or authority change belongs to the
  owner.
- **Model/reasoning selection** — match latency, cost, and reasoning depth to the task.
- **Configuration** — `~/.codex/config.toml` is primary; a repo-local `.codex/config.toml` is read
  ONLY under `trust_level = "trusted"`; `-p` selects a profile.
- **`AGENTS.md`** — durable repository conventions and verification instructions; nested files
  specialize guidance by subtree.

## Project knowledge

Codex has no assumed symmetric equivalent of Claude Code auto-memory. Store learned project facts
only in an explicitly authorized project document; do not turn `AGENTS.md` into silent scratch
memory.
