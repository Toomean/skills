# toomean/skills

Evidence-first working methods for coding agents.

This public umbrella collects small, serious, opinionated skills for how coding agents work. The
first alpha ships only `earned-done`; future skills can be added as their own package folders
without turning one skill into a catch-all prompt.

`earned-done` grew out of building a personal coding-agent harness for accurate, autonomous
completion — not merely launching agents — and from using coding agents on real work and personal
projects. Its premise is that capable models can usually make useful routing choices with light
guidance. The skill carries the durable principles, evidence standards, and review taste shaped by
that experience instead of hard-coding a scheduler.

It is prompt-first, not another orchestration service. Claude Code or Codex remains the runtime and
facilitator; the skill tells it how to plan, delegate when available, review, verify, repair, and
finish. One provider is enough. If the harness already exposes an authorized different-family
subagent, the skill assigns it to one already-planned read-only reviewer slot without increasing
reviewer count or fan-out.

## What `earned-done` does

On a non-trivial task, the skill asks the agent to:

1. align on the intended outcome and constraints, then reserve enough capacity to implement,
   review, verify, and finish;
2. keep implementation and skeptical review independent — through subagents when supported, or
   through clearly separated passes when they are not;
3. run the project's real feedback loop early, then use a focused repro, test, mutation, or control
   when an important claim needs stronger evidence;
4. review both correctness and intent: edge cases, blast radius, unnecessary complexity, stale
   abstractions, and whether the change solves the problem that was actually asked;
5. repair findings, run the relevant full test/check suite, sweep for leftovers, and hand off the
   exact evidence and any honest remaining limitations.

The folder includes the portable workflow, a code-review playbook, the opinionated `ReviewTaste`
simplicity/architecture lens, the `EndOfStepSweep` cleanup pass, thin Claude Code and Codex adapters,
and an optional Claude-only `PreToolUse` Git guardrail. The guardrail blocks a bounded set of
dangerous Git command forms; it is a backstop, not a shell sandbox.

For a substantive task, the default interaction has one explicit planning checkpoint before
implementation, then independent review and evidence before handoff. A prompt may pre-authorize
reversible implementation after the plan, but it never pre-authorizes pushing, publishing, merging,
or other external state changes. Tiny, reversible edits use the proportional path instead of full
ceremony.

## Skills

- [`earned-done`](earned-done/SKILL.md) — Evidence-first orchestration and review for coding agents,
  with independent roles, empirical verification, and bounded evolution.

## Install from Git

Clone this repository into a durable path. The commands below create direct symlinks into the
checkout, so moving or deleting it breaks the installation.

```sh
git clone https://github.com/Toomean/skills.git
cd skills
```

Install for Codex:

```sh
codex_skills_dir="${CODEX_SKILLS_DIR:-$HOME/.agents/skills}"
mkdir -p "$codex_skills_dir"
codex_target="$codex_skills_dir/earned-done"
if [ -e "$codex_target" ] || [ -L "$codex_target" ]; then
  echo "already exists: $codex_target" >&2
  exit 1
fi
ln -s "$PWD/earned-done" "$codex_target"
```

Install for Claude Code:

```sh
claude_skills_dir="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
mkdir -p "$claude_skills_dir"
claude_target="$claude_skills_dir/earned-done"
if [ -e "$claude_target" ] || [ -L "$claude_target" ]; then
  echo "already exists: $claude_target" >&2
  exit 1
fi
ln -s "$PWD/earned-done" "$claude_target"
```

The explicit preflight catches both normal and broken existing links before `ln` can follow a
directory symlink. Inspect an existing path yourself instead of replacing it blindly.
`CLAUDE_SKILLS_DIR` and `CODEX_SKILLS_DIR` provide optional destination overrides. These manual
commands assume one installer at a time; they are not a concurrent transaction protocol.

## Optional CLI preview

The repository contains a small non-mutating preview of a future `@toomean/skills` package:

- `toomean-skills list [<skill>|all] [--json]`;
- `toomean-skills install <skill>|all --provider claude|codex|all --dry-run [--json]`.

Real CLI installation, project initialization, updates, uninstall, receipts, locks, recovery, and
provider-root writes are deliberately unavailable. Omitting `--dry-run` fails before any target
change.

The maintainer build requires Node.js 24.11+ (the floor of the pinned `tsdown`) and pnpm. The
generated CLI targets Node.js 24+:

```sh
pnpm install --frozen-lockfile
pnpm check
```

The package scripts type-check the source, use `tsdown` to produce one Node CLI bundle, run the
focused tests and built entrypoint, validate the package with `publint`, and show the exact
`pnpm pack --dry-run` inventory. `package.json.files` is the npm allowlist: it ships the bundle and
the `earned-done` folder directly, with no generated manifest, content catalog, or staging builder.
The package has not been published; npm's own `npm pack` remains a release gate on a runner that has
npm.

## Use

Invoke the skill explicitly in either provider. For example, in Claude Code:

```text
/earned-done . implement the requested pagination change.
```

In Codex:

```text
Use $earned-done to review this patch.
```

You do not need to repeat the protocol in the prompt. A successful load must begin with this plain
text stance line, substituting the current revision, provider, and role:

```text
earned-done (rev <revision>) loaded — provider=<provider>, role=<role>.
```

If that line is absent, verify that the skill was installed and invoked under the expected name.
The workflow is complete with either provider alone. A different-family subagent is used only to
fill an already-planned read-only reviewer slot when the harness natively exposes and authorizes it.

## Repository checks

`package.json` is both the npm metadata and package allowlist. Run `pnpm check` to type-check and
bundle the CLI, run its Node tests, smoke the built entrypoint, run `publint`, and display the
package-manager's dry-run inventory. The Git-guardrail smoke requires Bash and Node.js.

Repository documentation uses relative Markdown links for relationships between shipped documents.
Keep those links resolvable when editing or moving a satellite.

Releases use per-skill tags such as `earned-done-v0.1.0-alpha.1`, so future skills can evolve
independently even when they share an optional umbrella package.

This alpha is a reviewed prompt and tool contract, not a security boundary. Provider behavior and
available features can drift, and native optional subagents remain governed by their harness.
