# @toomean/skills

Prompt-first working methods for coding agents. Claude Code and Codex are the runtimes; either
provider works on its own.

## Skills

- [`earned-done`](earned-done/README.md) — evidence-first implementation, review, and verification.
- [`brainstorm`](brainstorm/SKILL.md) — broad ideation that hands off options without choosing one.
- [`mental-map`](mental-map/SKILL.md) — source-grounded, interactive understanding with verified retellings.

## Install with npm

With [Node.js 22.12.0 or newer](https://nodejs.org/), install one skill or the full catalog:

```sh
npx @toomean/skills@next install earned-done --provider codex
npx @toomean/skills@next install all --provider codex
npx @toomean/skills@next install all --provider all --dry-run
```

Choose `earned-done`, `brainstorm`, or `mental-map` to select one skill, or `all` to select the
catalog in its listed order. Separately, `--provider claude`, `--provider codex`, or
`--provider all` selects where those skills go; provider `all` means both providers. `--dry-run`
checks every selected destination without writing.
`CODEX_SKILLS_DIR` and `CLAUDE_SKILLS_DIR` override the defaults
`~/.agents/skills` and `~/.claude/skills` respectively, for example:
`CODEX_SKILLS_DIR="$HOME/my-skills" npx @toomean/skills@next install brainstorm --provider codex`.

The npm installer never replaces an existing destination, including a file, directory, or broken
symlink. `install all` refuses the entire batch if any selected destination is occupied. It writes
a receipt outside the skills root after verifying each copy. Unexpected copy or receipt failures
can leave a partial or unclaimed destination and completed earlier copies; nothing is removed to
repair a failure.

To inspect or update one copied skill from the invoked package (without fetching a newer package):

```sh
npx @toomean/skills@next update earned-done --provider codex --dry-run
npx @toomean/skills@next update earned-done --provider codex
npx @toomean/skills@next update earned-done --provider codex --replace
```

An unchanged receipt-backed copy updates without a prompt; local edits or a receipt-less directory
refuse unless `--replace` receives an interactive `yes` for the displayed whole-tree delta. Invalid
receipts, links, and non-directory targets always refuse. `--dry-run` writes nothing. Updates retain
the old tree and, when present, its old receipt in a sibling state directory outside the skills
root; inspect the reported paths if a partial failure leaves a recovery lock. Retained copies are
not automatically cleaned. Receipts track paths, types and file content, not chmod or mtime. There is no merge,
unattended force, or uninstall command. Pin the package version if you need a reproducible preview
and apply.

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
[the brainstorm guide](brainstorm/README.md), the
[earned-done source guide](sources/earned-done/README.md), and the [Apache-2.0 license](LICENSE).
