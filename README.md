# @toomean/skills

Prompt-first working methods for coding agents. Claude Code and Codex are the runtimes; either
provider works on its own.

## Skills

- [`earned-done`](earned-done/README.md) — evidence-first implementation, review, and verification.
- [`brainstorm`](brainstorm/SKILL.md) — broad ideation that hands off options without choosing one.
- [`mental-map`](mental-map/SKILL.md) — source-grounded, interactive understanding with verified retellings.

## Install

### Recommended: Vercel Skills

Run these from the project directory where you want the skills available. Vercel installs
project-scoped skills by default. Examples use the tested CLI version 1.7.4 (Node.js 22.20.0 or
newer):

Warning: installing or updating can replace an existing skill directory with the same name,
including local edits. Back up existing copies before installing or updating.

```sh
npx skills@1.7.4 add Toomean/skills --skill earned-done -a codex
npx skills@1.7.4 add Toomean/skills --skill '*' -a claude-code -a codex
```

The first command installs one skill for Codex; the second installs all skills for Claude Code and
Codex. Naming both agents keeps the install scoped—avoid `--all`, which selects a broader set of
agents.
Vercel fetches from this Git source, not the npm artifact. Source selection, branch/revision
references, and the optional global (`-g`) scope are covered in the [Vercel Skills command
documentation](https://github.com/vercel-labs/skills/blob/a80e4c9d12d607631249d4d7d059f835d4b2f13a/docs/commands.md).

To update a project-installed skill from its source, for example:

```sh
npx skills@1.7.4 update -p earned-done
```

Vercel updates do not automatically track or adopt existing npm or Git-checkout copies; migrating
those installations is a separate step.

### Alternative: npm package

With [Node.js 22.12.0 or newer](https://nodejs.org/), install one bundled skill or the catalog:

```sh
npx @toomean/skills@next install earned-done --provider codex
npx @toomean/skills@next install all --provider all --dry-run
```

Choose `earned-done`, `brainstorm`, or `mental-map` to select one skill, or `all` to select the
catalog in its listed order. `--provider claude`, `--provider codex`, or `--provider all` selects
where skills go; provider `all` means both providers. `--dry-run` checks every selected destination
without writing. `CODEX_SKILLS_DIR` and `CLAUDE_SKILLS_DIR` override the defaults
`~/.agents/skills` and `~/.claude/skills` respectively.

The npm installer never replaces an existing destination, including a file, directory, or broken
symlink, and refuses the entire batch if any selected destination is occupied. Unexpected copy
failures can leave a newly created root, a partial destination, or completed earlier copies; it does
not remove files to repair a failure. There is no force, update, or uninstall command.

### Alternative: Git checkout

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
[the brainstorm guide](brainstorm/README.md), the
[earned-done source guide](sources/earned-done/README.md), and the [Apache-2.0 license](LICENSE).
