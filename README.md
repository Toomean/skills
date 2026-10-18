# @toomean/skills

Prompt-first working methods for coding agents. Claude Code and Codex are the runtimes; either
provider works on its own.

## Skills

- [`earned-done`](earned-done/SKILL.md) — evidence-first implementation, review, and verification.
- [`brainstorm`](brainstorm/SKILL.md) — broad ideation that hands off options without choosing one.
- [`mental-map`](mental-map/SKILL.md) — source-grounded, interactive understanding with verified retellings.

### How earned-done works

The agent in the open session is the orchestrator: it remains accountable for the plan, acceptance, and handoff. The [role definitions](earned-done/SKILL.md#core-rule-c2-preserve-independent-roles-delegate-when-available) explain who does what.

```text
Artifact change
  Plan → Implement → Independent review
                   → Verify/sweep → Commit/handoff
  Needed change? Implement → review again → verify/sweep

Answer only
  Investigate → Validate → Handoff
```

These are roles and passes, not a requirement for a new agent at every box. If native delegation is unavailable or prohibited, use separate passes and disclose the weaker independence; a complete single-provider route is sufficient, with no mandatory cross-family reviewer. Missing evidence or authority is an explicit gap, not “complete.” See the [task workflow](earned-done/SKILL.md#per-task-workflow) and [empirical-evidence rule](earned-done/SKILL.md#core-rule-c1-empirical-verification-before-claim).

## Install with npm

With [Node.js 22.12.0 or newer](https://nodejs.org/), install one skill for one provider:

```sh
npx @toomean/skills@next install earned-done --provider codex
```

Choose `earned-done`, `brainstorm`, or `mental-map`; use `claude` or `codex` as the provider.
`--provider all` installs the selected skill to both providers; `--dry-run` checks destinations
without writing.
`CODEX_SKILLS_DIR` and `CLAUDE_SKILLS_DIR` override the defaults
`~/.agents/skills` and `~/.claude/skills` respectively, for example:
`CODEX_SKILLS_DIR="$HOME/my-skills" npx @toomean/skills@next install brainstorm --provider codex`.

The npm installer copies the selected skill and never replaces an existing destination, including
a file, directory, or broken symlink. Unexpected copy failures can leave a newly created root, a
partial destination, or a completed first copy when installing to both providers; it does not
remove files to repair a failure. There is no force, update, or uninstall command.

## Install from Git

Without Node/npm, a durable Git checkout can provide direct symlinks instead:

```sh
git clone https://github.com/Toomean/skills.git
cd skills
sh ./install.sh earned-done codex
```

Choose `brainstorm` or `mental-map`, and/or `claude`, in place of the example arguments. The script
uses the same provider-root overrides and defaults as npm. Keep the checkout in place: moving or
deleting it breaks the symlink.

## Use

In Claude Code, invoke `/earned-done`, `/brainstorm`, or `/mental-map`; in Codex, invoke
`$earned-done`, `$brainstorm`, or `$mental-map`. Each skill can be used without installing the
others.

## Contributing

Run `pnpm install --frozen-lockfile` and `pnpm check` before proposing changes. See
[the brainstorm guide](brainstorm/README.md) and the [Apache-2.0 license](LICENSE).
