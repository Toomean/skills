import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtempDisposable,
  readFile,
  readlink,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), "../.."));
const scriptSource = await readFile(join(repositoryRoot, "install.sh"), "utf8");

async function fixture(name: string, withMarkers = true) {
  const temporary = await mkdtempDisposable(join(tmpdir(), `skills-installer-${name}-`));
  const checkout = join(temporary.path, "checkout with spaces");
  await mkdir(checkout, { recursive: true });
  await writeFile(join(checkout, "install.sh"), scriptSource);
  for (const skill of ["earned-done", "brainstorm"]) {
    await mkdir(join(checkout, skill), { recursive: true });
    if (withMarkers) await writeFile(join(checkout, skill, "SKILL.md"), `${skill} marker\n`);
  }
  return {
    temporary,
    checkout,
    async [Symbol.asyncDispose]() {
      await temporary[Symbol.asyncDispose]();
    },
  };
}

function install(checkout: string, args: string[], env: Record<string, string> = {}, cwd = tmpdir()) {
  return spawnSync("sh", [join(checkout, "install.sh"), ...args], {
    cwd,
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", ...env },
  });
}

test("links either selected skill for either provider from another cwd and paths with spaces", async () => {
  for (const skill of ["earned-done", "brainstorm"]) {
    for (const provider of ["codex", "claude"]) {
      await using disposable = await fixture(`${skill}-${provider}`);
      const { temporary, checkout } = disposable;
      const providerRoot = join(temporary.path, `${provider} skills`);
      const override = provider === "codex" ? { CODEX_SKILLS_DIR: providerRoot } : { CLAUDE_SKILLS_DIR: providerRoot };

      const result = install(checkout, [skill, provider], override);

      assert.equal(result.status, 0, result.stderr);
      const target = join(providerRoot, skill);
      assert.equal(await readlink(target), join(checkout, skill));
      assert.equal(await readFile(join(target, "SKILL.md"), "utf8"), `${skill} marker\n`);

      const repeated = install(checkout, [skill, provider], override);
      assert.notEqual(repeated.status, 0);
      assert.match(repeated.stderr, /destination already exists/);
      assert.equal(await readlink(target), join(checkout, skill));
    }
  }
});

test("an explicitly empty, relative, root, or dot-component override is rejected before writes", async () => {
  for (const value of ["", "relative/path", "/", "/tmp/..", "/tmp//nested"]) {
    await using disposable = await fixture("invalid-root");
    const { temporary, checkout } = disposable;
    const result = install(checkout, ["earned-done", "codex"], { CODEX_SKILLS_DIR: value }, temporary.path);
    assert.notEqual(result.status, 0, JSON.stringify(value));
    assert.match(result.stderr, /provider root/);
    await assert.rejects(lstat(join(temporary.path, "relative")), { code: "ENOENT" });
  }
});

test("unsupported, extra, and traversal-like arguments are rejected before writes", async () => {
  await using disposable = await fixture("invalid-args");
  const { temporary, checkout } = disposable;
  for (const args of [
    ["unknown", "codex"],
    ["../brainstorm", "codex"],
    ["earned-done/../brainstorm", "codex"],
    ["earned-done", "all"],
    ["earned-done", "codex", "extra"],
  ]) {
    const result = install(checkout, args, { CODEX_SKILLS_DIR: join(temporary.path, "provider") });
    assert.notEqual(result.status, 0, args.join(" "));
  }
  await assert.rejects(lstat(join(temporary.path, "provider")), { code: "ENOENT" });
});

test("file, directory, valid symlink, and broken symlink destinations are preserved", async () => {
  for (const kind of ["file", "directory", "symlink", "broken-symlink"]) {
    await using disposable = await fixture(`occupied-${kind}`);
    const { temporary, checkout } = disposable;
    const providerRoot = join(temporary.path, "provider");
    const target = join(providerRoot, "earned-done");
    await mkdir(providerRoot);
    if (kind === "file") await writeFile(target, "keep\n");
    if (kind === "directory") {
      await mkdir(target);
      await writeFile(join(target, "keep.txt"), "keep\n");
    }
    if (kind === "symlink") await symlink(join(checkout, "earned-done"), target);
    if (kind === "broken-symlink") await symlink(join(temporary.path, "absent"), target);

    const before = await lstat(target);
    const result = install(checkout, ["earned-done", "codex"], { CODEX_SKILLS_DIR: providerRoot });

    assert.notEqual(result.status, 0, kind);
    const after = await lstat(target);
    // Reading an occupied destination may update access time without replacing it.
    for (const field of ["dev", "ino", "mode", "nlink", "uid", "gid", "size", "mtimeMs", "ctimeMs", "birthtimeMs"] as const) {
      assert.equal(after[field], before[field], `${kind}: ${field}`);
    }
    if (kind === "file") assert.equal(await readFile(target, "utf8"), "keep\n");
    if (kind === "directory") assert.equal(await readFile(join(target, "keep.txt"), "utf8"), "keep\n");
    if (kind.endsWith("symlink")) assert.equal(await readlink(target), kind === "symlink" ? join(checkout, "earned-done") : join(temporary.path, "absent"));
  }
});

test("missing source marker and destinations inside the selected source are rejected before writes", async () => {
  await using missing = await fixture("missing-marker", false);
  const missingRoot = join(missing.temporary.path, "provider");
  const missingResult = install(missing.checkout, ["earned-done", "codex"], { CODEX_SKILLS_DIR: missingRoot });
  assert.notEqual(missingResult.status, 0);
  assert.match(missingResult.stderr, /missing skill source/);
  await assert.rejects(lstat(missingRoot), { code: "ENOENT" });

  await using nested = await fixture("nested-target");
  const nestedRoot = join(nested.checkout, "earned-done", "provider", "skills");
  const nestedResult = install(nested.checkout, ["earned-done", "codex"], { CODEX_SKILLS_DIR: nestedRoot });
  assert.notEqual(nestedResult.status, 0);
  assert.match(nestedResult.stderr, /inside the selected skill source/);
  await assert.rejects(lstat(nestedRoot), { code: "ENOENT" });

  const sourceAlias = join(nested.temporary.path, "source-alias");
  await symlink(join(nested.checkout, "earned-done"), sourceAlias);
  const aliasedRoot = join(sourceAlias, "provider", "skills");
  const aliasedResult = install(nested.checkout, ["earned-done", "codex"], { CODEX_SKILLS_DIR: aliasedRoot });
  assert.notEqual(aliasedResult.status, 0);
  assert.match(aliasedResult.stderr, /inside the selected skill source/);
  await assert.rejects(lstat(join(nested.checkout, "earned-done", "provider")), { code: "ENOENT" });
});

test("a late destination collision is preserved when it appears during root creation", async () => {
  await using disposable = await fixture("late-collision");
  const { temporary, checkout } = disposable;
  const providerRoot = join(temporary.path, "provider");
  const target = join(providerRoot, "earned-done");
  const bin = join(temporary.path, "bin");
  await mkdir(bin);
  const mkdirWrapper = join(bin, "mkdir");
  await writeFile(
    mkdirWrapper,
    "#!/bin/sh\nset -eu\ncommand -p mkdir \"$@\"\nprintf 'late owner\\n' > \"$LATE_TARGET\"\n",
  );
  await chmod(mkdirWrapper, 0o755);

  const result = install(checkout, ["earned-done", "codex"], {
    CODEX_SKILLS_DIR: providerRoot,
    LATE_TARGET: target,
    PATH: `${bin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
  });

  assert.notEqual(result.status, 0);
  assert.equal(await readFile(target, "utf8"), "late owner\n");
  assert.equal((await lstat(target)).isFile(), true);
});

test("resolved filesystem root is refused before filesystem commands", { skip: process.platform !== "linux" }, async () => {
  await using disposable = await fixture("resolved-root");
  const { temporary, checkout } = disposable;
  const bin = join(temporary.path, "bin");
  const log = join(temporary.path, "stub-log");
  await mkdir(bin);
  for (const command of ["mkdir", "ln"]) {
    const stub = join(bin, command);
    await writeFile(stub, `#!/bin/sh\nprintf '${command}\\n' >> "$STUB_LOG"\n`);
    await chmod(stub, 0o755);
  }
  const path = `${bin}:${process.env.PATH ?? "/usr/bin:/bin"}`;
  const regularRoot = join(temporary.path, "regular-root");
  const positive = install(checkout, ["earned-done", "codex"], {
    CODEX_SKILLS_DIR: regularRoot,
    STUB_LOG: log,
    PATH: path,
  });
  assert.equal(positive.status, 0, positive.stderr);
  assert.equal(await readFile(log, "utf8"), "mkdir\nln\n");

  await writeFile(log, "");
  const alias = install(checkout, ["earned-done", "codex"], {
    CODEX_SKILLS_DIR: "/proc/self/root",
    STUB_LOG: log,
    PATH: path,
  });
  assert.notEqual(alias.status, 0);
  assert.match(alias.stderr, /resolved provider root must be a non-root path/);
  assert.equal(await readFile(log, "utf8"), "");
});
