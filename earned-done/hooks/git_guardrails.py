#!/usr/bin/env python3
"""Apply a finite literal policy to one Claude Code Bash hook payload."""

from __future__ import annotations

import json
import re
import sys

MAX_COMMAND_BYTES = 128 * 1024
MAX_PAYLOAD_BYTES = MAX_COMMAND_BYTES * 6 + 4096
BOUNDARY = r"A-Za-z0-9_.-"


def token(expression: str) -> str:
    return rf"(?<![{BOUNDARY}])(?:{expression})(?![{BOUNDARY}])"


GIT = token(r"git")
PUSH = token(r"push")
RESET = token(r"reset")
CLEAN = token(r"clean")
BRANCH = token(r"branch")
PUSH_FORCE = token(r"--force")
PUSH_LEASE = token(
    r"--force-(?:w|wi|wit|with|with-|with-l|with-le|with-lea|with-leas|with-lease)(?:=[^\s;&|()]*)?"
)
PUSH_LONG_DESTRUCTIVE = token(
    r"--(?:m|mi|mir|mirr|mirro|mirror|de|del|dele|delet|delete|pru|prun|prune)"
)
SHORT_FORCE = token(r"-(?!-)[A-Za-z0-9_.]*f[A-Za-z0-9_.]*")
SHORT_DELETE = token(r"-(?!-)[A-Za-z0-9_.]*d[A-Za-z0-9_.]*")
PUSH_REFSPEC = token(r"(?:\+[^\s;&|()]+|:[^\s;&|()]+)")
HARD = token(r"--(?:h|ha|har|hard)")
BRANCH_FORCE = token(r"--(?:forc|force)")
BRANCH_UPPER_FORCE = token(r"-(?!-)[A-Za-z0-9_.]*[DMC][A-Za-z0-9_.]*")

POLICIES = (
    (
        "ED-GIT-PUSH",
        PUSH,
        rf"(?:{PUSH_FORCE}|{PUSH_LEASE}|{PUSH_LONG_DESTRUCTIVE}|{SHORT_FORCE}|{SHORT_DELETE}|{PUSH_REFSPEC})",
    ),
    ("ED-GIT-RESET", RESET, HARD),
    ("ED-GIT-CLEAN", CLEAN, None),
    ("ED-GIT-BRANCH", BRANCH, rf"(?:{BRANCH_FORCE}|{SHORT_FORCE}|{BRANCH_UPPER_FORCE})"),
)


def block(reason: str) -> None:
    """Return Claude Code's documented blocking status without echoing input."""

    print(f"BLOCKED by git-guardrails: {reason}", file=sys.stderr)
    raise SystemExit(2)


def read_command() -> str:
    """Validate the JSON envelope and return its bounded command string."""

    raw = sys.stdin.buffer.read(MAX_PAYLOAD_BYTES + 1)
    if len(raw) > MAX_PAYLOAD_BYTES:
        block("ED-GIT-INPUT-SIZE")
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        block("ED-GIT-INPUT-JSON")
    if not isinstance(payload, dict) or not isinstance(payload.get("tool_input"), dict):
        block("ED-GIT-INPUT-SHAPE")
    command = payload["tool_input"].get("command")
    if not isinstance(command, str):
        block("ED-GIT-INPUT-COMMAND")
    if "\0" in command:
        block("ED-GIT-INPUT-NUL")
    try:
        command_bytes = command.encode("utf-8")
    except UnicodeEncodeError:
        block("ED-GIT-INPUT-COMMAND")
    if len(command_bytes) > MAX_COMMAND_BYTES:
        block("ED-GIT-INPUT-SIZE")
    return command

def normalize(command: str) -> str:
    continued = re.sub(r"\\\r?\n", "", command)
    return re.sub(r"\s+", " ", continued)


def ordered(text: str, *expressions: str) -> bool:
    offset = 0
    for expression in expressions:
        match = re.search(expression, text[offset:])
        if match is None:
            return False
        offset += match.end()
    return True


def classify(command: str) -> str | None:
    normalized = normalize(command)
    for policy, subcommand, hazard in POLICIES:
        expressions = (GIT, subcommand) if hazard is None else (GIT, subcommand, hazard)
        if ordered(normalized, *expressions):
            return policy
    return None


def main() -> int:
    if policy := classify(read_command()):
        block(policy)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
