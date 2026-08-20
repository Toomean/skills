#!/usr/bin/env python3
"""Shared strict reader for the public skills manifest."""

from __future__ import annotations

import re
import stat
import tomllib
from dataclasses import dataclass
from pathlib import Path, PurePosixPath


NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
PACKAGE_RE = re.compile(r"^@[a-z0-9]+(?:-[a-z0-9]+)*/[a-z0-9]+(?:-[a-z0-9]+)*$")
VERSION_RE = re.compile(
    r"^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)"
    r"(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)


class ManifestError(RuntimeError):
    pass


@dataclass(frozen=True)
class Manifest:
    repository: dict[str, object]
    package: dict[str, object]
    skills: dict[str, dict[str, object]]
    expected_files: frozenset[str]
    executables: frozenset[str]


def normalized_relative(value: object, label: str) -> str:
    if not isinstance(value, str) or not value or "\\" in value:
        raise ManifestError(f"invalid {label}: {value!r}")
    path = PurePosixPath(value)
    if path.is_absolute() or str(path) != value or any(
        part in {"", ".", ".."} for part in path.parts
    ):
        raise ManifestError(f"invalid {label}: {value!r}")
    return value


def sorted_paths(value: object, label: str) -> list[str]:
    if not isinstance(value, list):
        raise ManifestError(f"{label} must be an array")
    paths = [normalized_relative(item, label) for item in value]
    if paths != sorted(paths) or len(paths) != len(set(paths)):
        raise ManifestError(f"{label} must be sorted and unique")
    return paths


def nonempty_string(value: object, label: str) -> str:
    if not isinstance(value, str) or not value or value != value.strip():
        raise ManifestError(f"invalid {label}: {value!r}")
    return value


def load_manifest(path: Path) -> Manifest:
    """Load manifest v2 and derive exact source/runtime closure metadata."""

    if path.is_symlink() or not path.is_file() or not stat.S_ISREG(path.stat().st_mode):
        raise ManifestError(f"manifest must be a regular non-symlink file: {path}")
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, tomllib.TOMLDecodeError) as exc:
        raise ManifestError(f"cannot read manifest: {exc}") from exc

    if set(data) != {"manifest_version", "package", "repository", "skills"}:
        raise ManifestError("manifest top-level schema drift")
    if data["manifest_version"] != 2:
        raise ManifestError("manifest_version must be 2")

    repository = data["repository"]
    if not isinstance(repository, dict) or set(repository) != {
        "content_format", "name", "root_files", "tagline", "title"
    }:
        raise ManifestError("repository manifest schema drift")
    for key in ("name", "title", "tagline"):
        nonempty_string(repository.get(key), f"repository.{key}")
    if repository["content_format"] != "utf-8-text":
        raise ManifestError("manifest v2 supports only repository.content_format = 'utf-8-text'")
    root_files = sorted_paths(repository["root_files"], "repository.root_files")
    for required in ("LICENSE", "manifest_contract.py", "skills.toml"):
        if required not in root_files:
            raise ManifestError(f"repository.root_files must contain {required}")

    package = data["package"]
    if not isinstance(package, dict) or set(package) != {
        "binary", "catalog_version", "module_format", "name", "node", "version"
    }:
        raise ManifestError("package manifest schema drift")
    package_name = nonempty_string(package.get("name"), "package.name")
    if not PACKAGE_RE.fullmatch(package_name):
        raise ManifestError(f"invalid package.name: {package_name!r}")
    binary = nonempty_string(package.get("binary"), "package.binary")
    if not NAME_RE.fullmatch(binary):
        raise ManifestError(f"invalid package.binary: {binary!r}")
    version = nonempty_string(package.get("version"), "package.version")
    if not VERSION_RE.fullmatch(version):
        raise ManifestError(f"invalid package.version: {version!r}")
    if package["catalog_version"] != 1:
        raise ManifestError("package.catalog_version must be 1")
    if package["module_format"] != "esm":
        raise ManifestError("package.module_format must be 'esm'")
    if package["node"] != ">=24":
        raise ManifestError("package.node must be '>=24'")

    raw_skills = data["skills"]
    if not isinstance(raw_skills, dict) or not raw_skills:
        raise ManifestError("skills must be a non-empty table")
    skills: dict[str, dict[str, object]] = {}
    expected = set(root_files)
    executables: set[str] = set()
    for name, raw in raw_skills.items():
        if not isinstance(name, str) or not NAME_RE.fullmatch(name):
            raise ManifestError(f"invalid skill name: {name!r}")
        if not isinstance(raw, dict) or set(raw) != {
            "description", "executables", "files", "load_check", "path",
            "runtime_files", "version"
        }:
            raise ManifestError(f"skill schema drift: {name}")
        if raw["path"] != name:
            raise ManifestError(f"skill path must equal its name: {name}")
        nonempty_string(raw.get("description"), f"skills.{name}.description")
        load_check = nonempty_string(raw.get("load_check"), f"skills.{name}.load_check")
        if "\n" in load_check or "\r" in load_check:
            raise ManifestError(f"invalid skill load_check: {name}")
        skill_version = nonempty_string(raw.get("version"), f"skills.{name}.version")
        if not VERSION_RE.fullmatch(skill_version):
            raise ManifestError(f"invalid skill version: {name}")
        files = sorted_paths(raw["files"], f"skills.{name}.files")
        runtime_files = sorted_paths(raw["runtime_files"], f"skills.{name}.runtime_files")
        declared_executables = sorted_paths(raw["executables"], f"skills.{name}.executables")
        if "SKILL.md" not in files or "SKILL.md" not in runtime_files:
            raise ManifestError(f"skill source/runtime allowlist has no SKILL.md: {name}")
        if not set(runtime_files) <= set(files):
            raise ManifestError(f"skill runtime_files must be a subset of files: {name}")
        if not set(declared_executables) <= set(files):
            raise ManifestError(f"skill executables must be a subset of files: {name}")
        skill = dict(raw)
        skill["files"] = files
        skill["runtime_files"] = runtime_files
        skill["executables"] = declared_executables
        skill["runtime_executables"] = sorted(set(declared_executables) & set(runtime_files))
        skills[name] = skill
        expected.update(f"{name}/{relative}" for relative in files)
        executables.update(f"{name}/{relative}" for relative in declared_executables)

    declared_count = len(root_files) + sum(len(skill["files"]) for skill in skills.values())
    if len(expected) != declared_count:
        raise ManifestError("manifest paths collide")

    return Manifest(
        repository=repository,
        package=package,
        skills=skills,
        expected_files=frozenset(expected),
        executables=frozenset(executables),
    )
