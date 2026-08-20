#!/usr/bin/env python3
"""Safely manage one symlink per manifest-declared skill and provider."""

from __future__ import annotations

import os
import stat
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True

from manifest_contract import ManifestError, load_manifest


PROVIDERS = ("claude", "codex")
ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "skills.toml"


class ManagerError(RuntimeError):
    pass


def load_skills() -> dict[str, Path]:
    """Load the exact manifest schema before trusting any declared source path."""
    try:
        manifest = load_manifest(MANIFEST)
    except ManifestError as exc:
        raise ManagerError(str(exc)) from exc
    return {name: ROOT / str(skill["path"]) for name, skill in manifest.skills.items()}


def selections(selector: str, choices: tuple[str, ...], label: str) -> tuple[str, ...]:
    if selector == "all":
        return choices
    if selector not in choices:
        raise ManagerError(f"unknown {label}: {selector}")
    return (selector,)


def provider_directory(provider: str) -> Path:
    """Resolve the provider destination without allowing it to overlap this repository."""
    defaults = {
        "claude": Path.home() / ".claude" / "skills",
        "codex": Path.home() / ".agents" / "skills",
    }
    variable = f"{provider.upper()}_SKILLS_DIR"
    path = Path(os.environ.get(variable, str(defaults[provider]))).expanduser()
    if not path.is_absolute():
        raise ManagerError(f"{variable} must be absolute: {path}")
    normalized = Path(os.path.normpath(path))
    if normalized.parent == normalized:
        raise ManagerError(f"{variable} must not be a filesystem root: {path}")
    if normalized != path:
        raise ManagerError(f"{variable} must be a normalized path: {path}")
    if normalized == ROOT or normalized.is_relative_to(ROOT):
        raise ManagerError(f"{variable} must be outside the generated repository: {path}")
    return path


def validate_directory_chain(path: Path) -> None:
    """Reject symlink traversal and topology changes before creating destination directories."""
    cursor = Path(path.anchor)
    if cursor.is_symlink() or not cursor.is_dir():
        raise ManagerError(f"invalid destination anchor: {cursor}")
    missing = False
    for part in path.parts[1:]:
        cursor /= part
        if os.path.lexists(cursor):
            if cursor.is_symlink() or not cursor.is_dir():
                raise ManagerError(f"destination crosses a foreign path: {cursor}")
            if missing:
                raise ManagerError(f"destination path changed during preflight: {cursor}")
        else:
            missing = True
    existing = path
    while not os.path.lexists(existing):
        existing = existing.parent
    if not os.access(existing, os.W_OK | os.X_OK):
        raise ManagerError(f"destination is not creatable: {path}")


def validate_source(source: Path) -> Path:
    """Return a stable, resolved source only when its minimum skill entry point is real."""
    if source.is_symlink() or not source.is_dir():
        raise ManagerError(f"skill source must be a real directory: {source}")
    skill_file = source / "SKILL.md"
    if skill_file.is_symlink() or not skill_file.is_file() or not stat.S_ISREG(skill_file.stat().st_mode):
        raise ManagerError(f"skill source has no regular SKILL.md: {source}")
    return source.resolve(strict=True)


def link_state(target: Path, source: Path) -> str:
    """Call a target ours only when its live symlink resolves to this exact source."""
    if target.is_symlink():
        try:
            return "ours" if target.resolve(strict=True) == source else "foreign"
        except (OSError, RuntimeError):
            return "foreign"
    if os.path.lexists(target):
        return "foreign"
    return "absent"


def selected_targets(skill_selector: str, provider_selector: str) -> list[tuple[str, str, Path, Path]]:
    """Resolve and validate the complete requested batch before any action can mutate it."""
    skills = load_skills()
    skill_names = selections(skill_selector, tuple(sorted(skills)), "skill")
    provider_names = selections(provider_selector, PROVIDERS, "provider")
    sources = {name: validate_source(skills[name]) for name in skill_names}
    result: list[tuple[str, str, Path, Path]] = []
    for provider in provider_names:
        directory = provider_directory(provider)
        validate_directory_chain(directory)
        for name in skill_names:
            result.append((provider, name, sources[name], directory / name))
    return result


def preflight_mutation(targets: list[tuple[str, str, Path, Path]]) -> None:
    # Refuse the whole batch up front so one foreign path cannot cause a partial install/uninstall.
    failures = [target for _, _, source, target in targets if link_state(target, source) == "foreign"]
    if failures:
        joined = ", ".join(str(path) for path in failures)
        raise ManagerError(f"refusing foreign or broken target(s): {joined}")


def require_valid_repository() -> None:
    # Installing only a directory with SKILL.md could expose an incomplete or tampered skill.
    # Keep this preflight on the portable structural checker: optional provider/platform matrices
    # belong to the release gate and must not make ordinary install/verify depend on GNU/Linux.
    checker = ROOT / "check-repo.py"
    environment = os.environ.copy()
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    result = subprocess.run(
        [sys.executable, str(checker)],
        cwd=ROOT,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        for output in (result.stdout, result.stderr):
            if output:
                print(output.rstrip(), file=sys.stderr)
        raise ManagerError("repository check failed: check-repo.py")


def make_directory_chain(path: Path, created: list[Path]) -> None:
    # Record only directories created by this invocation; rollback must never remove pre-existing
    # directories, and rmdir below removes these only while they are still empty.
    missing: list[Path] = []
    cursor = path
    while not os.path.lexists(cursor):
        missing.append(cursor)
        cursor = cursor.parent
    for directory in reversed(missing):
        directory.mkdir()
        created.append(directory)


def install(targets: list[tuple[str, str, Path, Path]]) -> int:
    preflight_mutation(targets)
    created_links: list[tuple[Path, Path]] = []
    created_directories: list[Path] = []
    try:
        for provider, name, source, target in targets:
            make_directory_chain(target.parent, created_directories)
            state = link_state(target, source)
            if state == "ours":
                print(f"OK    [{provider}] already installed {name}: {target}")
                continue
            # Recheck immediately before mutation: the earlier batch preflight is not permission to
            # overwrite a path that appeared while other targets were being processed.
            if state != "absent":
                raise ManagerError(f"target changed after preflight: {target}")
            target.symlink_to(source, target_is_directory=True)
            created_links.append((target, source))
            print(f"OK    [{provider}] installed {name}: {target} -> {source}")
        return 0
    except BaseException:
        # Roll back only links that still resolve to our source and directories we created that are
        # still empty. A concurrently replaced or populated path is deliberately left untouched.
        for target, source in reversed(created_links):
            if link_state(target, source) == "ours":
                target.unlink()
        for directory in reversed(created_directories):
            try:
                directory.rmdir()
            except OSError:
                pass
        raise


def status(targets: list[tuple[str, str, Path, Path]]) -> int:
    for provider, name, source, target in targets:
        state = link_state(target, source)
        if state == "ours":
            print(f"OK    [{provider}] {name}: {target} -> {target.readlink()}")
        elif state == "foreign":
            detail = f" -> {target.readlink()}" if target.is_symlink() else ""
            print(f"WARN  [{provider}] foreign target {name}: {target}{detail}")
        else:
            print(f"MISS  [{provider}] {name}: {target}")
    return 0


def verify(targets: list[tuple[str, str, Path, Path]]) -> int:
    failed = False
    for provider, name, source, target in targets:
        if link_state(target, source) == "ours":
            print(f"PASS  [{provider}] {name}: {target}")
        else:
            failed = True
            print(f"FAIL  [{provider}] expected link to {source}: {target}", file=sys.stderr)
    return int(failed)


def uninstall(targets: list[tuple[str, str, Path, Path]]) -> int:
    preflight_mutation(targets)
    for provider, name, source, target in targets:
        # As in install, re-read live state for each target instead of trusting the batch snapshot.
        state = link_state(target, source)
        if state == "ours":
            target.unlink()
            print(f"OK    [{provider}] removed {name}: {target}")
        elif state == "absent":
            print(f"OK    [{provider}] already absent {name}: {target}")
        else:
            raise ManagerError(f"target changed after preflight: {target}")
    return 0


USAGE = "usage: manage-skills.py {install|status|verify|uninstall} <skill|all> <claude|codex|all>"


def usage() -> ManagerError:
    return ManagerError(USAGE)


def main(argv: list[str]) -> int:
    if len(argv) == 2 and argv[1] in {"-h", "--help"}:
        print(USAGE)
        return 0
    if len(argv) != 4:
        raise usage()
    action, skill_selector, provider_selector = argv[1:]
    actions = {"install": install, "status": status, "verify": verify, "uninstall": uninstall}
    if action not in actions:
        raise usage()
    if action in {"install", "verify"}:
        require_valid_repository()
    return actions[action](selected_targets(skill_selector, provider_selector))


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv))
    except ManagerError as exc:
        print(f"ERROR {exc}", file=sys.stderr)
        raise SystemExit(1)
