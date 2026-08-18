#!/usr/bin/env bash
# Claude Code PreToolUse hook: refuse destructive git commands. Exit 2 = block.
# Keep this wrapper small: the typed literal classifier lives in git_guardrails.py.

set -u

SCRIPT_PATH="${BASH_SOURCE[0]}"
case "$SCRIPT_PATH" in
  */*) SCRIPT_PARENT="${SCRIPT_PATH%/*}" ;;
  *) SCRIPT_PARENT="." ;;
esac
if ! SCRIPT_DIR="$(cd "$SCRIPT_PARENT" && pwd)"; then
  echo "BLOCKED by git-guardrails: ED-GIT-WRAPPER-PATH" >&2
  exit 2
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "BLOCKED by git-guardrails: ED-GIT-WRAPPER-PYTHON" >&2
  exit 2
fi

python3 "$SCRIPT_DIR/git_guardrails.py"
helper_status=$?
if [[ $helper_status -eq 0 ]]; then
  exit 0
fi
if [[ $helper_status -ne 2 ]]; then
  echo "BLOCKED by git-guardrails: ED-GIT-WRAPPER-HELPER" >&2
fi
# Claude only guarantees that exit 2 blocks. Normalize syntax errors, missing
# helper files, interpreter crashes, and every other nonzero classifier outcome.
exit 2
