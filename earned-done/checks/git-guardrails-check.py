#!/usr/bin/env python3
"""Executable contract for the conservative Claude git literal guardrail."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


HOOK = Path(__file__).resolve().parents[1] / "hooks" / "git-guardrails.sh"
Case = tuple[str, str, int]

# Nearby allow/block mutations pin each finite policy and its deliberate false positives.
CASES: tuple[Case, ...] = (
    ("status allow", "git status", 0),
    ("normal push allow", "git push origin main", 0),
    ("force-looking ref allow", "git push origin feature-force-ui", 0),
    ("soft reset allow", "git reset --soft HEAD~1", 0),
    ("merged branch delete allow", "git branch -d merged", 0),
    ("no literal git allow", 'printf "reset --hard"', 0),
    ("git-lfs boundary allow", "git-lfs push --force", 0),
    ("legit boundary allow", "legit reset --hard", 0),
    ("hard suffix allow", "git reset --hard-mode", 0),
    ("force suffix allow", "git push --forceful origin main", 0),
    ("branch copy long allow", "git branch --copy old new", 0),
    ("tag force out of scope", "git tag -f release", 0),
    ("checkout force out of scope", "git checkout -B main", 0),
    ("escaped executable residual", r"g\it reset --hard", 0),
    ("maximum command allow", "x" * (128 * 1024), 0),
    ("push force", "git push --force origin main", 2),
    ("push lease", "git push origin main --force-with-lease", 2),
    ("push valued lease", "git push --force-with-lease=main:abc origin main", 2),
    ("push abbreviated lease", "git push --force-w origin main", 2),
    ("push abbreviated lease wi", "git push --force-wi origin main", 2),
    ("push abbreviated lease wit", "git push --force-wit origin main", 2),
    ("push abbreviated lease with", "git push --force-with origin main", 2),
    ("push abbreviated lease hyphen", "git push --force-with- origin main", 2),
    ("push abbreviated lease l", "git push --force-with-l origin main", 2),
    ("push abbreviated lease le", "git push --force-with-le origin main", 2),
    ("push abbreviated lease lea", "git push --force-with-lea origin main", 2),
    ("push abbreviated valued lease", "git push --force-with-leas=main origin main", 2),
    ("push short force", "git push -f origin main", 2),
    ("push clustered force", "git push -4uf origin main", 2),
    ("push feature-like short token", "git push -ofeature", 2),
    ("push dry-run force", "git push --dry-run --force origin main", 2),
    ("push mirror", "git push --mirror origin", 2),
    ("push abbreviated mirror", "git push --m origin", 2),
    ("push abbreviated mirror mi", "git push --mi origin", 2),
    ("push abbreviated mirror mir", "git push --mir origin", 2),
    ("push abbreviated mirror mirr", "git push --mirr origin", 2),
    ("push abbreviated mirror mirro", "git push --mirro origin", 2),
    ("push delete", "git push origin --delete old", 2),
    ("push abbreviated delete", "git push origin --de old", 2),
    ("push abbreviated delete del", "git push origin --del old", 2),
    ("push abbreviated delete dele", "git push origin --dele old", 2),
    ("push abbreviated delete delet", "git push origin --delet old", 2),
    ("push short delete", "git push -d origin old", 2),
    ("push clustered delete", "git push -vd origin old", 2),
    ("push prune", "git push --prune origin", 2),
    ("push abbreviated prune", "git push --pru origin", 2),
    ("push abbreviated prune prun", "git push --prun origin", 2),
    ("push forced refspec", "git push origin +HEAD:refs/heads/main", 2),
    ("push deletion refspec", "git push origin :refs/heads/old", 2),
    ("push hazard after terminator", "git push origin -- --force", 2),
    ("push lease after terminator", "git push origin -- --force-with-lease", 2),
    ("push mirror after terminator", "git push origin -- --mirror", 2),
    ("push delete after terminator", "git push origin -- --delete", 2),
    ("push prune after terminator", "git push origin -- --prune", 2),
    ("push short force after terminator", "git push origin -- -af", 2),
    ("push short delete after terminator", "git push origin -- -d", 2),
    ("push refspec after terminator", "git push origin -- +HEAD:main", 2),
    ("push deletion refspec after terminator", "git push origin -- :old", 2),
    ("reset hard", "git reset --hard HEAD~1", 2),
    ("reset shortest abbreviation", "git reset --h HEAD", 2),
    ("reset middle abbreviation", "git reset --ha HEAD", 2),
    ("reset longest abbreviation", "git reset --har HEAD", 2),
    ("reset continued", "git reset \\\n  --hard HEAD~1", 2),
    ("reset global option", "git -C repo reset --hard", 2),
    ("reset leading redirection", ">out git reset --hard", 2),
    ("reset clobber redirection", "git >|out reset --hard", 2),
    ("quoted reset false positive", 'printf "git reset --hard"', 2),
    ("quoted separator false positive", 'git push ";" main --force', 2),
    ("cross-command false positive", "git status; printf reset --hard", 2),
    ("else form", "if false; then :; else git reset --hard; fi", 2),
    ("brace form", "{ git reset --hard; }", 2),
    ("time form", "time git reset --hard", 2),
    ("reset hazard after terminator", "git reset -- --hard", 2),
    ("clean plain", "git clean", 2),
    ("clean dry run false positive", "git clean -n", 2),
    ("quoted clean false positive", 'printf "git clean -n"', 2),
    ("branch uppercase delete", "git branch -D old", 2),
    ("branch long force", "git branch --force old", 2),
    ("branch abbreviated force", "git branch --forc old", 2),
    ("branch short force", "git branch -f old", 2),
    ("branch move force", "git branch -M old new", 2),
    ("branch copy force", "git branch -C old new", 2),
    ("branch delete force", "git branch --delete --force old", 2),
    ("branch split short force", "git branch -d -f old", 2),
    ("absolute executable", "/usr/bin/git reset --hard", 2),
)


def payload(command: str) -> bytes:
    return json.dumps({"tool_input": {"command": command}}).encode()


def run_hook(
    input_bytes: bytes, env: dict[str, str] | None = None
) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        [str(HOOK)],
        input=input_bytes,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        check=False,
    )


def malformed_payloads() -> tuple[tuple[str, bytes], ...]:
    values: tuple[tuple[str, Any], ...] = (
        ("empty", b""),
        ("invalid JSON", b"{"),
        ("missing tool_input", {}),
        ("missing command", {"tool_input": {}}),
        ("non-string command", {"tool_input": {"command": ["git", "status"]}}),
        ("NUL command", {"tool_input": {"command": "git\0status"}}),
        ("unpaired surrogate", b'{"tool_input":{"command":"\\ud800"}}'),
        ("oversize command", {"tool_input": {"command": "x" * (128 * 1024 + 1)}}),
    )
    return tuple(
        (name, value if isinstance(value, bytes) else json.dumps(value).encode())
        for name, value in values
    )


def wrapper_controls() -> tuple[list[str], int]:
    failures: list[str] = []
    count = 0
    missing = os.environ.copy()
    missing["PATH"] = "/nonexistent"
    count += 1
    result = subprocess.run(
        ["/bin/bash", str(HOOK)],
        input=payload("git status"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=missing,
        check=False,
    )
    if result.returncode != 2:
        failures.append(f"missing python: expected 2, got {result.returncode}")
    with tempfile.TemporaryDirectory(prefix="git-guardrail-crash-") as directory:
        count += 1
        wrapper = Path(directory) / HOOK.name
        shutil.copy2(HOOK, wrapper)
        (Path(directory) / "git_guardrails.py").write_text("raise SystemExit(17)\n")
        result = subprocess.run(
            [str(wrapper)],
            input=payload("git status"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    if result.returncode != 2 or b"ED-GIT-WRAPPER-HELPER" not in result.stderr:
        failures.append(f"helper crash: expected normalized 2, got {result.returncode}")
    return failures, count


def bash_differential_controls() -> tuple[list[str], int]:
    """Prove selected raw spellings become hazardous argv in disposable Bash."""

    controls = (
        ("git >/dev/null reset --hard", ("reset", "--hard")),
        ("git -C . reset --hard", ("-C", ".", "reset", "--hard")),
        ("git branch -d -f old", ("branch", "-d", "-f", "old")),
        ("git push -ofeature", ("push", "-ofeature")),
    )
    failures: list[str] = []
    with tempfile.TemporaryDirectory(prefix="git-guardrail-bash-") as directory:
        root = Path(directory)
        fake = root / "git"
        fake.write_text('#!/usr/bin/env bash\nprintf "%s\\0" "$@" > "$GUARD_LOG"\n')
        fake.chmod(0o755)
        for index, (command, expected) in enumerate(controls):
            if run_hook(payload(command)).returncode != 2:
                failures.append(f"bash control {command!r}: hook did not block")
                continue
            log = root / f"argv-{index}"
            env = os.environ.copy()
            env.update(PATH=f"{root}:{env['PATH']}", GUARD_LOG=str(log))
            run = subprocess.run(
                ["/bin/bash", "-c", command], cwd=root, env=env, check=False
            )
            actual = tuple(
                part.decode() for part in log.read_bytes().split(b"\0") if part
            )
            if run.returncode != 0 or actual != expected:
                failures.append(
                    f"bash control {command!r}: {run.returncode=}, {actual=}"
                )
    return failures, len(controls)


def git_abbreviation_control() -> tuple[list[str], int]:
    """Prove Git expands --har destructively while the hook blocks it."""

    failures: list[str] = []
    with tempfile.TemporaryDirectory(prefix="git-guardrail-reset-") as directory:
        root = Path(directory).resolve()
        subprocess.run(["git", "init", "--quiet", str(root)], check=True)
        tracked = root / "tracked.txt"
        tracked.write_text("committed\n")
        subprocess.run(["git", "-C", str(root), "add", "tracked.txt"], check=True)
        subprocess.run(
            [
                "git", "-C", str(root), "-c", "user.name=Guardrail Check",
                "-c", "user.email=guardrail@example.invalid", "-c",
                "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false",
                "commit", "--quiet", "-m", "initial",
            ],
            check=True,
        )
        tracked.write_text("dirty\n")
        guarded = run_hook(payload("git reset --har HEAD"))
        if guarded.returncode != 2 or tracked.read_text() != "dirty\n":
            failures.append("abbreviated reset: hook did not preserve dirty content")
        actual = subprocess.run(
            ["git", "-C", str(root), "reset", "--har", "HEAD"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if actual.returncode != 0 or tracked.read_text() != "committed\n":
            failures.append("abbreviated reset: Git did not expand --har to --hard")
    return failures, 1


def main() -> int:
    failures: list[str] = []
    for name, command, expected in CASES:
        result = run_hook(payload(command))
        if result.returncode != expected:
            failures.append(f"{name}: expected {expected}, got {result.returncode}")
        elif expected == 2 and (
            b"ED-GIT-" not in result.stderr or command.encode() in result.stderr
        ):
            failures.append(f"{name}: diagnostic is not a non-echoing policy ID")
    malformed = malformed_payloads()
    for name, data in malformed:
        result = run_hook(data)
        if result.returncode != 2:
            failures.append(f"{name}: expected 2, got {result.returncode}")
    wrapper_failures, wrapper_count = wrapper_controls()
    bash_failures, bash_count = bash_differential_controls()
    abbreviation_failures, abbreviation_count = git_abbreviation_control()
    failures.extend(wrapper_failures)
    failures.extend(bash_failures)
    failures.extend(abbreviation_failures)
    if failures:
        print("\n".join(f"FAIL  {failure}" for failure in failures), file=sys.stderr)
        return 1
    print(
        f"PASS  git guardrails ({len(CASES)} commands, "
        f"{len(malformed)} malformed, "
        f"{wrapper_count + bash_count + abbreviation_count} controls)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
