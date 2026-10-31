# Toomean skills

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

### Alternative: manual copy

Get the [public repository](https://github.com/Toomean/skills) or its archive, then copy the entire
folder for each skill you want, including any supporting files and subdirectories. For a
project-scoped install, place it at:

- Codex: `.agents/skills/<skill-name>/`
- Claude Code: `.claude/skills/<skill-name>/`

Before copying, check whether the destination already exists and back it up if it contains changes
you want to keep. To update manually, preserve any local changes you need, then replace the existing
`<skill-name>` folder with the fresh complete folder—do not merge the folders or nest one inside the
other. Vercel does not automatically track or adopt manually copied or previously installed
npm/Git-checkout skills.

## Use

In Claude Code, invoke `/earned-done`, `/brainstorm`, or `/mental-map`; in Codex, invoke
`$earned-done`, `$brainstorm`, or `$mental-map`. Each skill can be used without installing the
others.

## Contributing

Run `pnpm install --frozen-lockfile` and `pnpm check` before proposing changes. See
[the brainstorm guide](brainstorm/README.md), the
[earned-done source guide](sources/earned-done/README.md), and the [Apache-2.0 license](LICENSE).
Maintainer tooling requires Node.js 24.18.0 or newer; skill users only need their agent runtime and
one of the installation methods above.
