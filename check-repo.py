#!/usr/bin/env python3
"""Fail-closed validation for the generated public repository."""

from __future__ import annotations

import os
import posixpath
import re
import stat
import sys
import urllib.parse
from pathlib import Path, PurePosixPath

sys.dont_write_bytecode = True

from manifest_contract import ManifestError, load_manifest


LINK_RE = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")
REFERENCE_DEFINITION_RE = re.compile(r"(?m)^[ \t]{0,3}\[([^\]]+)\]:[ \t]*(\S.*)$")
REFERENCE_USAGE_RE = re.compile(r"!?\[([^\]]+)\]\[([^\]]*)\]")
DOCUMENT_REFERENCE_RE = re.compile(
    r"(?<![A-Za-z0-9_.-])(?:\.\.?/)*(?:[A-Za-z0-9_.-]+/)*[A-Za-z0-9_.-]+\.md"
    r"(?![A-Za-z0-9_.-])"
)
INLINE_CODE_RE = re.compile(r"`+[^`\n]*`+")
HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
LABELED_LINK_RE = re.compile(r"!?\[([^\]]*)\]\(([^)]+)\)")
HEADING_RE = re.compile(r"^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$", re.MULTILINE)
SECRET_RES = (
    re.compile(r"-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    re.compile(r"\bxo" + r"x[A-Za-z]-[A-Za-z0-9-]{10,}\b"),
)
EMAIL_RE = re.compile(
    r"\b[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+"
    + chr(64)
    + r"(?P<domain>[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,})\b"
)
PRIVATE_CONTENT_RES = (
    re.compile(
        r"(?<![A-Za-z0-9_.-])(?:journal|proposals?)/[A-Za-z0-9_<>.-]+(?:\.md)?\b",
        re.I,
    ),
    re.compile(r"\bprivate\s+(?:maintainer\s+)?(?:overlay|retrospective)\b", re.I),
    re.compile(r"\b(?:revision|release)\s+ritual\b", re.I),
    re.compile(r"(?<![A-Za-z0-9_.-])checks/[A-Za-z0-9_.-]*ritual[A-Za-z0-9_.-]*", re.I),
    re.compile(r"(?:commit|done)\s*(?:→|->|/)\s*(?:journal|proposals?)\b", re.I),
)
PRIVATE_PARTS = {".cache", ".claude", ".codex", "__pycache__", "journal", "journals", "proposals"}
PRIVATE_NAMES = {
    ".env",
    "CLAUDE.md",
    "settings.local.json",
}


def has_exact_standalone_line(text: str, literal: str) -> bool:
    return text.count(literal) == 1 and text.splitlines().count(literal) == 1


def private_path_reason(relative: str) -> str | None:
    path = PurePosixPath(relative)
    lowered = {part.lower() for part in path.parts}
    if lowered & PRIVATE_PARTS:
        return "private or generated path"
    if path.name in PRIVATE_NAMES or path.suffix.lower() in {".pyc", ".pyo"}:
        return "private or generated local-state file"
    filename = path.name.lower()
    if any(word in filename for word in ("credential", "secret")) or filename in {"id_rsa", "id_ed25519"}:
        return "credential-like file name"
    return None


def inventory(root: Path) -> tuple[set[str], set[str], list[str]]:
    files: set[str] = set()
    directories = {"."}
    errors: list[str] = []
    for current, dirnames, filenames in os.walk(root, topdown=True, followlinks=False):
        current_path = Path(current)
        current_relative = current_path.relative_to(root)
        if current_relative.parts and current_relative.parts[0] == ".git":
            dirnames[:] = []
            continue
        if current_relative == Path("."):
            dirnames[:] = [name for name in dirnames if name != ".git"]
            filenames = [name for name in filenames if name != ".git"]
        elif current_relative == Path("cli"):
            # The exact source closure excludes the local package-manager dependency tree. Package
            # checks separately prove that no dependency tree enters the generated tarball.
            dependency_tree = current_path / "node_modules"
            if "node_modules" in dirnames and dependency_tree.is_symlink():
                errors.append("symlink dependency tree is forbidden: cli/node_modules")
            dirnames[:] = [name for name in dirnames if name != "node_modules"]
        kept_dirs: list[str] = []
        for name in dirnames:
            path = current_path / name
            relative = path.relative_to(root).as_posix()
            if path.is_symlink():
                errors.append(f"symlink directory is forbidden: {relative}")
            else:
                kept_dirs.append(name)
                directories.add(relative)
        dirnames[:] = kept_dirs
        for name in filenames:
            path = current_path / name
            relative = path.relative_to(root).as_posix()
            if path.is_symlink():
                errors.append(f"symlink file is forbidden: {relative}")
            elif not stat.S_ISREG(path.stat().st_mode):
                errors.append(f"non-regular file is forbidden: {relative}")
            else:
                files.add(relative)
    return files, directories, errors


def expected_directories(expected: set[str]) -> set[str]:
    result = {"."}
    for relative in expected:
        parent = PurePosixPath(relative).parent
        while str(parent) != ".":
            result.add(str(parent))
            parent = parent.parent
    return result


def check_frontmatter(root: Path, skills: dict[str, dict[str, object]]) -> list[str]:
    errors: list[str] = []
    for name, skill in skills.items():
        path = root / str(skill["path"]) / "SKILL.md"
        lines = path.read_text(encoding="utf-8").splitlines()
        if not lines or lines[0] != "---":
            errors.append(f"{name}: frontmatter must start with ---")
            continue
        try:
            end = lines.index("---", 1)
        except ValueError:
            errors.append(f"{name}: frontmatter has no closing ---")
            continue
        fields: dict[str, str] = {}
        for line in lines[1:end]:
            if ":" not in line:
                errors.append(f"{name}: invalid frontmatter line: {line!r}")
                continue
            key, value = line.split(":", 1)
            if key in fields:
                errors.append(f"{name}: duplicate frontmatter field: {key}")
            fields[key] = value.strip()
        if set(fields) != {"description", "name"}:
            errors.append(f"{name}: frontmatter fields must be exactly name and description")
        if fields.get("name") != name:
            errors.append(f"{name}: frontmatter name does not match manifest/path")
        if not fields.get("description"):
            errors.append(f"{name}: frontmatter description is empty")
        if end == len(lines) - 1 or not any(line.strip() for line in lines[end + 1:]):
            errors.append(f"{name}: SKILL.md body is empty")
    return errors


def prose_without_fences(text: str) -> str:
    output: list[str] = []
    fence: str | None = None
    for line in text.splitlines():
        stripped = line.lstrip()
        marker = "```" if stripped.startswith("```") else "~~~" if stripped.startswith("~~~") else None
        if marker:
            fence = None if fence == marker else marker if fence is None else fence
            continue
        if fence is None:
            output.append(line)
    return "\n".join(output)


def pointer_target(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("<"):
        end = raw.find(">")
        return raw[1:end] if end != -1 else raw
    return raw.split(maxsplit=1)[0] if raw else raw


def heading_slug(label: str) -> str:
    """Return the GitHub-style fragment used by the shipped Markdown headings."""
    label = re.sub(r"!?\[([^\]]+)\]\([^)]+\)", r"\1", label)
    label = re.sub(r"<[^>]+>", "", label)
    label = label.replace("`", "").lower()
    label = "".join(char for char in label if char.isalnum() or char in {" ", "\t", "_", "-"})
    return re.sub(r"[ \t]+", "-", label).strip("-")


def heading_fragments(text: str) -> set[str]:
    fragments: set[str] = set()
    counts: dict[str, int] = {}
    for match in HEADING_RE.finditer(prose_without_fences(text)):
        base = heading_slug(match.group(2))
        if not base:
            continue
        index = counts.get(base, 0)
        counts[base] = index + 1
        fragments.add(base if index == 0 else f"{base}-{index}")
    return fragments


def check_markdown_pointers(root: Path, expected: set[str]) -> list[str]:
    errors: list[str] = []
    markdown_fragments = {
        relative: heading_fragments((root / relative).read_text(encoding="utf-8"))
        for relative in expected
        if relative.endswith(".md")
    }

    def check_target(relative: str, target: str, kind: str) -> None:
        if not target:
            return
        parsed = urllib.parse.urlsplit(target)
        if parsed.scheme or parsed.netloc:
            return
        if target.startswith("/"):
            errors.append(f"{relative}: absolute Markdown {kind} is forbidden: {target}")
            return
        decoded = urllib.parse.unquote(parsed.path)
        joined = (
            relative
            if not decoded
            else posixpath.normpath(str(PurePosixPath(relative).parent / decoded))
        )
        if joined == ".." or joined.startswith("../") or joined not in expected:
            errors.append(f"{relative}: broken or unmanifested Markdown {kind}: {target}")
            return
        fragment = urllib.parse.unquote(parsed.fragment)
        if fragment and joined.endswith(".md") and fragment not in markdown_fragments.get(joined, set()):
            errors.append(f"{relative}: broken Markdown fragment in {kind}: {target}")

    for relative in sorted(path for path in expected if path.endswith(".md")):
        text = prose_without_fences((root / relative).read_text(encoding="utf-8"))
        for match in LINK_RE.finditer(text):
            check_target(relative, pointer_target(match.group(1)), "pointer")
        definitions: dict[str, str] = {}
        for match in REFERENCE_DEFINITION_RE.finditer(text):
            identifier = " ".join(match.group(1).split()).lower()
            if identifier in definitions:
                errors.append(f"{relative}: duplicate Markdown reference definition: {identifier}")
                continue
            target = pointer_target(match.group(2))
            definitions[identifier] = target
            check_target(relative, target, "reference target")
        for match in REFERENCE_USAGE_RE.finditer(text):
            identifier = " ".join((match.group(2) or match.group(1)).split()).lower()
            if identifier not in definitions:
                errors.append(f"{relative}: undefined Markdown reference: {identifier}")
    return errors


def check_cross_document_links(root: Path, expected: set[str]) -> list[str]:
    """Require internal document mentions to create real graph edges."""
    markdown_files = {path for path in expected if path.endswith(".md")}
    errors: list[str] = []
    for relative in sorted(markdown_files):
        prose = prose_without_fences((root / relative).read_text(encoding="utf-8"))
        prose = HTML_COMMENT_RE.sub("", prose)
        inline_spans = [(match.start(), match.end()) for match in INLINE_CODE_RE.finditer(prose)]

        def outside_inline(match: re.Match[str]) -> bool:
            return not any(start <= match.start() < end for start, end in inline_spans)

        inline_links = [match for match in LINK_RE.finditer(prose) if outside_inline(match)]
        reference_definitions = [
            match for match in REFERENCE_DEFINITION_RE.finditer(prose) if outside_inline(match)
        ]
        reference_usages = [
            match for match in REFERENCE_USAGE_RE.finditer(prose) if outside_inline(match)
        ]
        linked: set[str] = set()

        def internal_document(raw: str) -> str | None:
            parsed = urllib.parse.urlsplit(raw)
            if not parsed.scheme and not parsed.netloc and parsed.path and not raw.startswith("/"):
                target = posixpath.normpath(
                    str(PurePosixPath(relative).parent / urllib.parse.unquote(parsed.path))
                )
                if target in markdown_files:
                    return target
            return None

        for match in inline_links:
            target = internal_document(pointer_target(match.group(1)))
            if target:
                linked.add(target)
        definitions: dict[str, str] = {}
        for match in reference_definitions:
            identifier = " ".join(match.group(1).split()).lower()
            definitions[identifier] = pointer_target(match.group(2))
        for match in reference_usages:
            identifier = " ".join((match.group(2) or match.group(1)).split()).lower()
            target = internal_document(definitions.get(identifier, ""))
            if target:
                linked.add(target)
        masked = list(prose)
        for match in (*inline_links, *reference_definitions, *reference_usages):
            masked[match.start():match.end()] = " " * (match.end() - match.start())
        prose = "".join(masked)
        reported: set[str] = set()
        for match in DOCUMENT_REFERENCE_RE.finditer(prose):
            token = match.group(0)
            direct = posixpath.normpath(str(PurePosixPath(relative).parent / token))
            candidates = {path for path in markdown_files if path == direct}
            if not candidates and not token.startswith("."):
                candidates = {
                    path for path in markdown_files
                    if path == token or path.endswith(f"/{token}")
                }
            candidates.discard(relative)
            if len(candidates) == 1:
                target = next(iter(candidates))
                if target not in linked and target not in reported:
                    reported.add(target)
                    errors.append(
                        f"{relative}: unlinked Markdown document reference: {token} "
                        f"(link to {target})"
                    )
    return errors


def canonical_rules(path: Path) -> dict[str, str]:
    """Derive the rule inventory and owner fragments from the canonical SKILL definitions."""
    text = prose_without_fences(path.read_text(encoding="utf-8"))
    rules: dict[str, str] = {}
    current_fragment = ""
    for line in text.splitlines():
        heading = HEADING_RE.fullmatch(line)
        if heading:
            current_fragment = heading_slug(heading.group(2))
            core = re.search(r"\[([C]\d+)\]", heading.group(2))
            if core:
                rules[core.group(1)] = current_fragment
            continue
        item = re.match(r"^\d+\.\s+\*\*\[([TW]\d+)\]", line)
        if item and current_fragment:
            rules[item.group(1)] = current_fragment
    return rules


def check_rule_links(
    root: Path, skills: dict[str, dict[str, object]], expected: set[str]
) -> list[str]:
    """Require each satellite's first rendered rule-ID mention to link to its SKILL owner."""
    errors: list[str] = []
    markdown_files = {path for path in expected if path.endswith(".md")}
    for _, skill in sorted(skills.items()):
        skill_root = str(skill["path"])
        canonical = f"{skill_root}/SKILL.md"
        rule_map = canonical_rules(root / canonical)
        if not rule_map:
            errors.append(f"{canonical}: no canonical rule definitions found")
            continue
        rule_id_re = re.compile(
            r"(?<![A-Za-z0-9])(?:"
            + "|".join(re.escape(rule_id) for rule_id in sorted(rule_map, key=lambda item: (-len(item), item)))
            + r")(?![A-Za-z0-9])"
        )
        satellites = sorted(
            path for path in markdown_files
            if path.startswith(f"{skill_root}/") and path != canonical
        )
        for relative in satellites:
            prose = prose_without_fences((root / relative).read_text(encoding="utf-8"))
            prose = HTML_COMMENT_RE.sub("", prose)
            masked = list(prose)
            for match in INLINE_CODE_RE.finditer(prose):
                masked[match.start():match.end()] = " " * (match.end() - match.start())

            definitions: dict[str, str] = {}
            for match in REFERENCE_DEFINITION_RE.finditer(prose):
                definitions[" ".join(match.group(1).split()).lower()] = pointer_target(match.group(2))
                masked[match.start():match.end()] = " " * (match.end() - match.start())

            links: list[tuple[int, int, str]] = []
            for match in LABELED_LINK_RE.finditer(prose):
                links.append((*match.span(1), pointer_target(match.group(2))))
                target_start, target_end = match.span(2)
                masked[target_start:target_end] = " " * (target_end - target_start)
            for match in REFERENCE_USAGE_RE.finditer(prose):
                identifier = " ".join((match.group(2) or match.group(1)).split()).lower()
                links.append((*match.span(1), definitions.get(identifier, "")))

            first_mentions: dict[str, re.Match[str]] = {}
            for match in rule_id_re.finditer("".join(masked)):
                first_mentions.setdefault(match.group(0), match)

            for rule_id, mention in sorted(first_mentions.items()):
                containing = [
                    target for start, end, target in links
                    if start <= mention.start() and mention.end() <= end
                ]
                expected_fragment = rule_map[rule_id]
                valid = False
                for raw_target in containing:
                    parsed = urllib.parse.urlsplit(raw_target)
                    if parsed.scheme or parsed.netloc or not parsed.path or raw_target.startswith("/"):
                        continue
                    target = posixpath.normpath(
                        str(PurePosixPath(relative).parent / urllib.parse.unquote(parsed.path))
                    )
                    if target == canonical and parsed.fragment == expected_fragment:
                        valid = True
                        break
                if not valid:
                    errors.append(
                        f"{relative}: first rule reference must link to canonical section: {rule_id} "
                        f"({canonical}#{expected_fragment})"
                    )
    return errors


def check_content(root: Path, expected: set[str]) -> list[str]:
    errors: list[str] = []
    home_path = re.compile(r"/ho" + r"me/(?!owner(?:/|\b))[^\s`\"']+")
    user_path = re.compile(
        r"(?:/Us" + r"ers/[^\s`\"']+|[A-Za-z]:\\" + r"Users\\[^\s`\"']+)"
    )
    root_path = re.compile(r"/ro" + r"ot/[^\s`\"']+")
    for relative in sorted(expected):
        reason = private_path_reason(relative)
        if reason:
            errors.append(f"{relative}: {reason}")
        path = root / relative
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeError:
            errors.append(f"{relative}: public files must be UTF-8 text")
            continue
        if any(pattern.search(text) for pattern in PRIVATE_CONTENT_RES):
            errors.append(f"{relative}: private evolution residue")
        if home_path.search(text) or user_path.search(text) or root_path.search(text):
            errors.append(f"{relative}: machine/user-specific absolute path")
        if any(pattern.search(text) for pattern in SECRET_RES):
            errors.append(f"{relative}: credential-like content")
        for match in EMAIL_RE.finditer(text):
            if match.group("domain").lower() != "example.invalid":
                errors.append(f"{relative}: real email address is forbidden")
                break
    return errors


def check_modes(root: Path, expected: set[str], executables: set[str]) -> list[str]:
    errors: list[str] = []
    for relative in sorted(expected):
        actual = stat.S_IMODE((root / relative).stat().st_mode)
        if actual & 0o7000:
            errors.append(f"{relative}: special permission bits are forbidden: {actual:04o}")
        if actual & stat.S_IWOTH:
            errors.append(f"{relative}: world-writable public file is forbidden: {actual:04o}")
        if relative in executables:
            if not (actual & stat.S_IXUSR):
                errors.append(f"{relative}: declared executable must be owner-executable: {actual:04o}")
        elif actual & 0o111:
            errors.append(f"{relative}: undeclared executable bits are forbidden: {actual:04o}")
    return errors


def check_catalog(root: Path, repository: dict[str, object], skills: dict[str, dict[str, object]]) -> list[str]:
    readme = (root / "README.md").read_text(encoding="utf-8")
    expected_catalog = "<!-- skills:start -->\n" + "\n".join(
        f"- [`{name}`]({skill['path']}/SKILL.md) — {skill['description']}"
        for name, skill in sorted(skills.items())
    ) + "\n<!-- skills:end -->"
    errors: list[str] = []
    if not readme.startswith(f"# {repository['title']}\n\n{repository['tagline']}\n"):
        errors.append("README title/tagline do not match manifest")
    if readme.count(expected_catalog) != 1:
        errors.append("README skill catalog does not match manifest")
    return errors


def check_load_checks(root: Path, skills: dict[str, dict[str, object]]) -> list[str]:
    readme = (root / "README.md").read_text(encoding="utf-8")
    errors: list[str] = []
    for name, skill in skills.items():
        load_check = str(skill["load_check"])
        skill_text = (root / str(skill["path"]) / "SKILL.md").read_text(encoding="utf-8")
        if not has_exact_standalone_line(skill_text, load_check):
            errors.append(f"{name}: load-check literal must be one undecorated standalone line in SKILL.md")
        if not has_exact_standalone_line(readme, load_check):
            errors.append(f"{name}: load-check literal must be one undecorated standalone line in README.md")
    return errors


def check_runtime_document_edges(
    root: Path, skills: dict[str, dict[str, object]]
) -> list[str]:
    """Keep packaged Markdown self-contained when maintainer-only files are excluded."""

    errors: list[str] = []
    for name, skill in sorted(skills.items()):
        skill_root = str(skill["path"])
        runtime_expected = {
            f"{skill_root}/{relative}" for relative in skill["runtime_files"]
        }
        errors.extend(
            f"runtime package {name}: {error}"
            for error in check_markdown_pointers(root, runtime_expected)
        )
        errors.extend(
            f"runtime package {name}: {error}"
            for error in check_cross_document_links(root, runtime_expected)
        )
    return errors


def main() -> int:
    script = Path(__file__)
    if script.is_symlink():
        print(f"FAIL  checker must not be a symlink: {script}", file=sys.stderr)
        return 1
    root = script.resolve().parent
    try:
        manifest = load_manifest(root / "skills.toml")
    except ManifestError as exc:
        print(f"FAIL  {exc}", file=sys.stderr)
        return 1
    repository = manifest.repository
    skills = manifest.skills
    expected = set(manifest.expected_files)
    executables = set(manifest.executables)

    actual, directories, errors = inventory(root)
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    extra_directories = sorted(directories - expected_directories(expected))
    errors.extend(f"missing manifest file: {path}" for path in missing)
    errors.extend(f"unmanifested file: {path}" for path in extra)
    errors.extend(f"unmanifested directory: {path}" for path in extra_directories)
    if not missing:
        content_errors = check_content(root, expected)
        errors.extend(content_errors)
        errors.extend(check_modes(root, expected, executables))
        if not any(error.endswith("public files must be UTF-8 text") for error in content_errors):
            errors.extend(check_frontmatter(root, skills))
            errors.extend(check_markdown_pointers(root, expected))
            errors.extend(check_cross_document_links(root, expected))
            errors.extend(check_rule_links(root, skills, expected))
            errors.extend(check_runtime_document_edges(root, skills))
            errors.extend(check_catalog(root, repository, skills))
            errors.extend(check_load_checks(root, skills))

    if errors:
        for error in errors:
            print(f"FAIL  {error}", file=sys.stderr)
        return 1
    print(f"PASS  public manifest closure ({len(skills)} skill, {len(expected)} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
