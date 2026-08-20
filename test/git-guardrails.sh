#!/usr/bin/env bash

set -u

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || exit 1
hook="$repository_root/earned-done/hooks/git-guardrails.sh"
failures=0

check() {
  label="$1"
  expected_status="$2"
  expected_policy="$3"
  payload="$4"
  output="$(printf '%s' "$payload" | /bin/bash "$hook" 2>&1 >/dev/null)"
  actual_status=$?
  if [[ $actual_status -ne $expected_status ]]; then
    printf 'FAIL  %s: expected %s, got %s\n' "$label" "$expected_status" "$actual_status" >&2
    failures=$((failures + 1))
  elif [[ -n "$expected_policy" && "$output" != *"$expected_policy"* ]]; then
    printf 'FAIL  %s: missing policy %s\n' "$label" "$expected_policy" >&2
    failures=$((failures + 1))
  fi
}

check "ordinary status" 0 "" '{"tool_input":{"command":"git status"}}'
check "ordinary push" 0 "" '{"tool_input":{"command":"git push origin main"}}'
check "force push" 2 "ED-GIT-PUSH" '{"tool_input":{"command":"git push --force origin main"}}'
check "hard reset" 2 "ED-GIT-RESET" '{"tool_input":{"command":"git reset --hard HEAD"}}'
check "clean" 2 "ED-GIT-CLEAN" '{"tool_input":{"command":"git clean -n"}}'
check "force branch" 2 "ED-GIT-BRANCH" '{"tool_input":{"command":"git branch -D old"}}'
check "malformed input" 2 "ED-GIT-INPUT" '{'

if [[ $failures -ne 0 ]]; then
  exit 1
fi
printf 'PASS  Git guardrail smoke (7 cases)\n'
