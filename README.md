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
simplicity/architecture lens, the `EndOfStepSweep` cleanup pass, and thin Claude Code and Codex
adapters.

For a substantive task, the default interaction has one explicit planning checkpoint before
implementation, then independent review and evidence before handoff. A prompt may pre-authorize
reversible implementation after the plan, but it never pre-authorizes pushing, publishing, merging,
or other external state changes. Tiny, reversible edits use the proportional path instead of full
ceremony.

## Skills

- [`earned-done`](earned-done/SKILL.md) — Evidence-first orchestration and review for coding agents,
  with independent roles, empirical verification, and bounded evolution.

## Install with npm

The npm package has not been published yet. The first alpha will use the `next` tag; after it is
available, inspect or install the bundled skill without keeping a repository checkout:

```sh
npx @toomean/skills@next list
npx @toomean/skills@next install earned-done --provider codex
npx @toomean/skills@next install earned-done --provider claude
```

Use `--provider all` to install both copies, or add `--dry-run` to perform the same source and
destination preflight without writing. `CODEX_SKILLS_DIR` and `CLAUDE_SKILLS_DIR` override the
default user roots. Overrides must be absolute, non-root paths that resolve to independent locations
outside the packaged skill; the operator is responsible for choosing them.

The installer copies the complete packaged `earned-done` directory. It creates missing provider
roots but never replaces any existing final path, including a file, directory, or broken symlink.
For `--provider all`, both targets are checked before either provider root is created. There is no
force, update, or uninstall command. An unexpected copy failure can leave a newly created root, a
partial target, or an already completed first-provider copy; the CLI reports that possibility and
never tries to repair it by deleting files.

## Install from Git (fallback)

The no-npm fallback is a durable Git checkout. The commands below create direct symlinks into that
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
directory symlink. Inspect an existing path yourself instead of replacing it blindly. These manual
commands assume one installer at a time; they are not a concurrent transaction protocol.

The CLI requires Node.js 24.18+. Maintainer work also requires pnpm.

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

`package.json` is both the npm metadata and package allowlist:

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` type-checks and tests the source, runs `pnpm pack --dry-run` (whose `prepack` builds the
single CLI bundle), smoke-tests that bundle, validates it with `publint`, and shows the allowlisted
package inventory. `prepublishOnly` runs the complete check. Native `npm pack`, a clean tarball
install, and a published `npx` invocation remain release gates on a runner that has npm.

## Publishing

Publishing is owned by [the GitHub Actions release workflow](.github/workflows/publish.yml). An
`earned-done-v<package.version>` GitHub Release runs the complete package check and publishes
`@toomean/skills` to npm. Prerelease versions use the `next` dist-tag; stable versions use `latest`.
The workflow reads the npm credential from the `NPM_ACCESS_TOKEN` repository secret. Never commit
that credential; local `.env` files are ignored.

Repository documentation uses relative Markdown links for relationships between shipped documents.
Keep those links resolvable when editing or moving a satellite.

Releases use per-skill tags such as `earned-done-v0.1.0-alpha.1`, so future skills can evolve
independently even when they share an optional umbrella package.

This alpha is a reviewed prompt and tool contract, not a security boundary. Provider behavior and
available features can drift, and native optional subagents remain governed by their harness.
