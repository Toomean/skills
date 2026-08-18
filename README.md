# toomean/skills

Evidence-first working methods for coding agents.

This public umbrella collects small, serious, opinionated skills for how coding agents work. The
first alpha ships only `earned-done`; future skills can be added through the public manifest
without turning one skill into a catch-all prompt.

`earned-done` grew out of building a personal coding-agent harness for accurate, autonomous
completion — not merely launching agents — and from using coding agents on real work and personal
projects. Its design premise is that capable coding models can usually make useful routing choices
with light guidance. The skill therefore carries the durable principles, evidence standards, and
review taste shaped by that experience instead of hard-coding a scheduler.

It is prompt-first, not another orchestration service. Claude Code or Codex remains the runtime and
facilitator; the skill tells it how to plan, delegate when available, review, verify, repair, and
finish. One provider is enough. If that harness already exposes an authorized different-family
subagent, the skill assigns it to one already-planned read-only reviewer slot without increasing
reviewer count or fan-out.

## What `earned-done` does

On a non-trivial task, the skill asks the agent to:

1. align on the intended outcome and constraints, then reserve enough model and tool capacity to
   implement, review, verify, and finish;
2. keep implementation and skeptical review independent — through subagents when supported, or
   through clearly separated passes when they are not;
3. run the project's real feedback loop early, then use a focused repro, test, mutation, or control
   when an important claim needs stronger evidence;
4. review both correctness and intent: edge cases, blast radius, unnecessary complexity, stale
   abstractions, and whether the change solves the problem that was actually asked;
5. repair findings, run the project's relevant full test/check suite, sweep for leftovers, and hand
   off the exact evidence and any honest remaining limitations.

The bundle includes the portable core workflow, a detailed code-review playbook, the opinionated
`ReviewTaste` simplicity/architecture lens, the `EndOfStepSweep` cleanup pass, thin Claude Code and
Codex adapters, and deterministic checks for its Git guardrail. It also ships an optional
Claude-only `PreToolUse` hook that blocks a bounded set of
dangerous Git commands; it is a backstop, not a shell sandbox.

For a substantive task, the default interaction has one explicit planning checkpoint before
implementation, then independent review and evidence before handoff. A prompt may pre-authorize
reversible implementation after the plan (for example, “plan, then proceed unless you find a real
owner decision”), but it never pre-authorizes pushing, publishing, merging, or other external
state changes. Tiny, reversible edits use the proportional path instead of full ceremony.

## Skills

<!-- skills:start -->
- [`earned-done`](earned-done/SKILL.md) — Evidence-first orchestration and review for coding agents, with independent roles, empirical verification, and bounded evolution.
<!-- skills:end -->

## Install

Python 3.11+ is required for the skill manager and structural repository check. Clone this
repository into a durable path: installs are symlinks into the checkout, so moving or deleting it
breaks them.

```sh
git clone https://github.com/Toomean/skills.git
cd skills
```

Install one skill as a separate symlink for either provider:

```sh
python3 manage-skills.py install earned-done codex
python3 manage-skills.py install earned-done claude
python3 manage-skills.py status earned-done all
python3 manage-skills.py verify earned-done all
```

Use `all` in either selector position to operate on every skill or provider declared in
`skills.toml`. Defaults are `~/.claude/skills` and `~/.agents/skills`; tests or custom setups can
override them with `CLAUDE_SKILLS_DIR` and `CODEX_SKILLS_DIR`. Override destinations must remain
outside this repository; pointing them at the checkout or one of its descendants is rejected.
Every existing destination component must be a real directory; symlinked destination parents are
unsupported. Point a `*_SKILLS_DIR` override at an absolute, normalized path beneath the resolved
real directory instead of relying on a symlinked parent.

For example, install into a separate Claude skills directory:

```sh
CLAUDE_SKILLS_DIR="$HOME/.claude-alt/skills" \
  python3 manage-skills.py install earned-done claude
```

The `Makefile` provides the same operations. `SKILL` and `PROVIDER` both default to `all`:

```sh
make check-structure
make check-functional
make check
make install SKILL=earned-done PROVIDER=codex
make status SKILL=earned-done PROVIDER=codex
make verify SKILL=earned-done PROVIDER=codex
```

The manager preflights every selected target and refuses foreign or broken paths it observes. It
does not protect against a same-account replacement after a check; concurrent manager runs are
unsupported. If the destination already contains a foreign file, directory, or symlink named
`earned-done`, inspect it and move or remove it yourself only after deciding it is no longer needed;
the manager deliberately will not replace or delete it. Remove links that still resolve to this
checkout with:

```sh
python3 manage-skills.py uninstall earned-done all
```

## Use

Invoke the skill explicitly in either provider. For example, in Claude Code:

```text
/earned-done . implement the requested pagination change.
```

In Codex:

```text
Use $earned-done to review this patch.
```

You do not need to repeat the protocol in the prompt. Once loaded, the skill instructs the agent to
back completion and review claims with observable evidence. A successful load must begin, before any
other response text, with this plain-text stance line (substituting the current revision, provider,
and role, without Markdown emphasis delimiters). Use the complete Protocol revision stamp value,
including its `-rNNN` suffix:

```text
earned-done (rev <revision>) loaded — provider=<provider>, role=<role>.
```

If that line is absent, verify that the skill was installed and invoked under the expected name.
The change/answer workflow spine is an internal self-priming instruction; the agent **MUST NOT**
append it to the load-check line.

The workflow is complete with either provider alone. A different-family subagent is used only to
fill an already-planned read-only reviewer slot when the current harness natively exposes and
authorizes it for the project and task. It never increases reviewer count or fan-out solely for
family diversity. The harness owns invocation, account, billing, and access. If that capability is
absent, the skill fills the same slot with an independent same-provider context and does not prompt
for route setup.

Git-history and PR-specific checks are reported as unavailable when they do not apply.

## Repository checks

`skills.toml` is both the public catalog and the shipping allowlist: it declares every root file,
every file belonging to each skill, which shipped files are executable, and that skill's exact
load-check literal. “Manifest closure” means the checkout contains exactly that declared set —
nothing missing and nothing unlisted.

Run `python3 check-repo.py` or `make check-structure` to confirm that closure and validate
executable-bit semantics, unsafe world-write/special permissions, skill metadata, the README
catalog, load-check equivalence, relative Markdown pointers, private-state exclusions, and known
high-risk credential patterns. Ordinary `install` and `verify` run this portable structural layer automatically; they do
not execute the optional functional matrices.

`make check-functional` runs the Git-guardrail matrix. The full
release gate, `make check`, depends on both `check-structure` and `check-functional`. The functional
gate currently requires GNU/Linux with Git, Bash, GNU make, and the GNU userland used by its shell
controls. On other platforms, users can still run the structural check and install the skills;
release validation runs the complete gate in a supported environment. Git does not preserve
complete POSIX modes, so ordinary group-write created by the checkout umask is accepted.

Repository documentation uses relative Markdown links for relationships between shipped documents.
In each satellite, the first meaningful occurrence of every rule ID owned elsewhere links to its
canonical section; later mentions of that ID may stay short. This keeps the checkout portable and
gives tools such as Obsidian a real document graph. `make check` rejects an unlinked first rule-ID
occurrence, a recognizable cross-document reference with no real edge, and broken relative pointers.

When releases are published, they will use per-skill tags such as
`earned-done-v0.1.0-alpha.1`, so future manifest additions can evolve independently.

This alpha is a reviewed prompt and tool contract, not a security boundary. Provider behavior and
available features can drift; native optional subagents remain governed by their harness; the
credential scan is deliberately narrow; and symlink management does not support concurrent writers.
