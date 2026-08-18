# Claude Code hook recipe — git guardrails

A project-agnostic Claude Code **PreToolUse** hook that blocks a finite set of dangerous Git
literals before a Bash tool call runs. It is a mechanical backstop for the broader protocol rule;
it is not a shell parser, command sandbox, or complete Git policy engine.

This recipe is **Claude-only**. It is not declared Codex-compatible: that would require a native
Codex deny-test plus a positive control under the active hook trust state. A standalone exit code
or similarly named event is not evidence that Codex blocked execution.

## Finite policy

The detector finds ASCII-token-bounded literals in this order: `git` → one of four subcommands →
its hazard. It does not stop at quotes, shell separators, another `git`, or `--`.

- **ED-GIT-PUSH:** `--force`, `--force-with-lease[=…]`, any single-dash token containing `f`;
  `--mirror`, `--delete`, `--prune`, any single-dash token containing `d`; and
  token-like forced/deletion refspecs beginning with `+` or `:`. Currently accepted Git 2.53
  abbreviations are included: lease `--force-w…`, mirror `--m…`, delete `--de…`, and prune
  `--pru…`. Hazards after `--` still block.
- **ED-GIT-RESET:** `--hard` and its accepted `--h`/`--ha`/`--har` abbreviations after
  `git` → `reset`.
- **ED-GIT-CLEAN:** every ordered `git` → `clean`, including `git clean -n`. The family is too
  destructive to make dry-run parsing part of this small backstop.
- **ED-GIT-BRANCH:** `--force`, its accepted `--forc` abbreviation, any single-dash token containing
  `f`, or an uppercase `D`, `M`, or `C`. This covers force-delete, delete+force, force-move, and
  force-copy forms; `branch -d` remains allowed.

The token boundary alphabet is `[A-Za-z0-9_.-]`: `/usr/bin/git` is found, while `git-lfs` and
`legit` are not. The only normalization removes Bash backslash-newline continuation and collapses
whitespace. The helper does not unquote, expand, execute, or build a shell AST.

## Entrypoint and checks

`git-guardrails.sh` is the stable entrypoint. It requires `bash` and `python3`; the adjacent
`git_guardrails.py` helper uses only `json`, `re`, and `sys` from the standard library. The helper
validates a bounded JSON envelope and string command, rejects NUL, and caps the decoded command at
128 KiB.
Diagnostics contain policy identifiers, never the submitted command. The wrapper allows only
helper status 0 and normalizes every other outcome—including a missing interpreter or helper
crash—to Claude Code's blocking status, 2.

`checks/git-guardrails-check.py` pins the allow/block mutations, malformed and dependency failures,
and selected Bash argv controls in disposable directories. The main matrix submits Git literals as
JSON strings and never executes them. The Bash argv controls execute a fake `git`; only the
abbreviation control executes real Git, and it does so in a freshly initialized disposable
repository. Run the focused check directly; repository maintainers may also include it in a broader
repository verification gate.

## Deliberate false positives and residuals

Conservative literal matching intentionally blocks quoted discussion (`printf "git reset --hard"`),
hazards after `--`, `git push -ofeature`, `git push --dry-run --force`, `git clean -n`, and ordered
literals split across separate commands. Simplify the tool call when one of these fires.

The finite policy does **not** cover aliases, functions, dynamically or escaped command names,
`eval`, config-defined Git aliases, or every indirect wrapper. It also leaves destructive commands
outside the four families out of scope, including `tag -f`, `switch -C`, `checkout -B`/`-f`,
`restore`, `update-ref`, and reflog deletion. The provider sandbox and the protocol's exec-isolation
rule remain the primary controls. Git resolves unique long-option abbreviations against its current
option table; the finite prefixes above are pinned to Git 2.53, so a future option-table change is a
version-drift surface rather than an implied parser guarantee.

## Wiring into settings.json

Register the entrypoint under `hooks.PreToolUse` with a `Bash` matcher:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "/absolute/path/to/git-guardrails.sh" }
        ]
      }
    ]
  }
}
```

Each Claude Code project installs this through its own `settings.json`; nothing in the hook is
project-specific.

Do not call the hook installed merely because the focused matrix passes. Start a fresh Claude Code
session that loads the edited settings, ask its native Bash tool to attempt a harmless command
containing the blocked literal `git reset --hard` (for example, printing that literal), and confirm
the provider reports the `ED-GIT-RESET` denial. Then run an allowed Bash command such as
`git status --short` and confirm it reaches Git. The denial plus positive control must occur through
the live `PreToolUse` event; invoking the script directly is not equivalent.
