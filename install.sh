#!/bin/sh

set -eu

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

[ "$#" -eq 2 ] || fail 'usage: sh ./install.sh earned-done|brainstorm|mental-map codex|claude'

skill=$1
provider=$2
case "$skill" in
  earned-done|brainstorm|mental-map) ;;
  *) fail "unsupported skill: $skill" ;;
esac
case "$provider" in
  codex)
    if [ "${CODEX_SKILLS_DIR+x}" = x ]; then provider_root=$CODEX_SKILLS_DIR; else provider_root=${HOME:?HOME must be set}/.agents/skills; fi
    ;;
  claude)
    if [ "${CLAUDE_SKILLS_DIR+x}" = x ]; then provider_root=$CLAUDE_SKILLS_DIR; else provider_root=${HOME:?HOME must be set}/.claude/skills; fi
    ;;
  *) fail "unsupported provider: $provider" ;;
esac

case "$provider_root" in
  /*) ;;
  *) fail 'provider root must be an absolute path' ;;
esac
case "$provider_root" in
  /|//*|*//*|*/|*/./*|*/.|*/../*|*/..) fail 'provider root must be a non-root path without redundant, dot, or parent components' ;;
esac

script_dir=$(CDPATH='' cd -P "$(dirname "$0")" && pwd -P) || fail 'cannot locate the checkout'
source_dir=$script_dir/$skill
[ -f "$source_dir/SKILL.md" ] || fail "missing skill source: $source_dir/SKILL.md"

# Resolve through the nearest existing ancestor so symlink aliases cannot hide source overlap.
probe=$provider_root
suffix=
while [ ! -e "$probe" ] && [ ! -L "$probe" ]; do
  leaf=${probe##*/}
  parent=${probe%/*}
  [ "$parent" != "$probe" ] || fail "cannot resolve provider root: $provider_root"
  suffix=/$leaf$suffix
  probe=$parent
done
[ -d "$probe" ] || fail "provider root is not a directory: $probe"
probe=$(CDPATH='' cd -P "$probe" && pwd -P) || fail "cannot resolve provider root: $provider_root"
if [ "$probe" = / ]; then provider_root=${suffix:-/}; else provider_root=$probe$suffix; fi
[ "$provider_root" != / ] || fail 'resolved provider root must be a non-root path'

target=$provider_root/$skill
case "$target/" in
  "$source_dir/"*) fail 'provider destination would be inside the selected skill source' ;;
esac

if [ -e "$target" ] || [ -L "$target" ]; then
  fail "destination already exists; leaving it unchanged: $target"
fi

mkdir -p "$provider_root" || fail "cannot create provider root: $provider_root"
ln -s "$source_dir" "$provider_root/" || fail "could not create skill symlink in: $provider_root"
printf 'INSTALLED\t[%s]\t%s\t%s\n' "$provider" "$skill" "$target"
