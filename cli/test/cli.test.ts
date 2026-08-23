import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
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
import { dirname, join, parse, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { run } from "../src/cli.ts";

const packageRoot = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), "../.."));
const execFileAsync = promisify(execFile);

function temporaryRoot(name: string) {
  return mkdtempDisposable(join(tmpdir(), `toomean-skills-${name}-`));
}

test("list, help, and usage stay small and text-only", async () => {
  assert.deepEqual(await run(["list"], {}, packageRoot), { exitCode: 0, stderr: "", stdout: "earned-done\n" });

  for (const argv of [["--help"], ["-h"], ["list", "--help"], ["install", "--help"]]) {
    const result = await run(argv, {}, packageRoot);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^usage:/);
  }

  for (const argv of [
    ["list", "earned-done"],
    ["list", "--json"],
    ["unknown"],
    ["install", "all", "--provider", "codex"],
    ["install", "earned-done"],
    ["install", "earned-done", "--provider", "other"],
  ]) {
    const result = await run(argv, {}, packageRoot);
    assert.equal(result.exitCode, 2, argv.join(" "));
    assert.match(result.stderr, /^ERROR:/);
    assert.equal(result.stdout, "");
  }
});

test("dry-run performs preflight without creating provider roots", async () => {
  await using root = await temporaryRoot("dry-run");
  const claudeRoot = join(root.path, "claude", "skills");
  const codexRoot = join(root.path, "codex", "skills");
  const result = await run(
    ["install", "earned-done", "--provider", "all", "--dry-run"],
    { CLAUDE_SKILLS_DIR: claudeRoot, CODEX_SKILLS_DIR: codexRoot },
    packageRoot,
  );

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /^PLAN\t\[claude\]/);
  await assert.rejects(lstat(claudeRoot), { code: "ENOENT" });
  await assert.rejects(lstat(codexRoot), { code: "ENOENT" });
});

test("single-provider install recursively copies the packaged directory", async () => {
  await using root = await temporaryRoot("single-install");
  const providerRoot = join(root.path, "codex", "skills");
  const target = join(providerRoot, "earned-done");
  const result = await run(
    ["install", "earned-done", "--provider=codex"],
    { CODEX_SKILLS_DIR: providerRoot },
    packageRoot,
  );

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /^INSTALLED\t\[codex\]/);
  for (const file of ["SKILL.md", "references/codex.md"]) {
    assert.equal(await readFile(join(target, file), "utf8"), await readFile(join(packageRoot, "earned-done", file), "utf8"));
  }
});

test("provider all rejects identical or nested targets before writes", async () => {
  for (const [relation, dryRun] of [
    ["identical", false],
    ["nested", true],
  ] as const) {
    await using root = await temporaryRoot(`overlap-${relation}`);
    const claudeRoot = join(root.path, "claude");
    const codexRoot = relation === "identical" ? claudeRoot : join(claudeRoot, "earned-done", "nested");
    const argv = ["install", "earned-done", "--provider", "all"];
    if (dryRun) argv.push("--dry-run");

    const result = await run(
      argv,
      { CLAUDE_SKILLS_DIR: claudeRoot, CODEX_SKILLS_DIR: codexRoot },
      packageRoot,
    );

    assert.equal(result.exitCode, 1, relation);
    assert.match(result.stderr, /provider targets must be independent/);
    for (const providerRoot of new Set([claudeRoot, codexRoot])) {
      await assert.rejects(lstat(providerRoot), { code: "ENOENT" });
    }
  }
});

test("an occupied file, directory, or broken symlink is never replaced", async () => {
  const cases = ["file", "directory", "broken-symlink"] as const;
  for (const kind of cases) {
    await using root = await temporaryRoot(`occupied-${kind}`);
    const providerRoot = join(root.path, "codex", "skills");
    const target = join(providerRoot, "earned-done");
    await mkdir(providerRoot, { recursive: true });
    if (kind === "file") await writeFile(target, "foreign file\n");
    if (kind === "directory") {
      await mkdir(target);
      await writeFile(join(target, "foreign.txt"), "foreign directory\n");
    }
    if (kind === "broken-symlink") await symlink(join(root.path, "missing"), target, "file");

    const result = await run(
      ["install", "earned-done", "--provider", "codex"],
      { CODEX_SKILLS_DIR: providerRoot },
      packageRoot,
    );
    assert.equal(result.exitCode, 1, kind);
    assert.match(result.stdout, /^REFUSE\t\[codex\]/);
    if (kind === "file") assert.equal(await readFile(target, "utf8"), "foreign file\n");
    if (kind === "directory") assert.equal(await readFile(join(target, "foreign.txt"), "utf8"), "foreign directory\n");
    if (kind === "broken-symlink") assert.equal(await readlink(target), join(root.path, "missing"));
  }
});

test("provider all refuses before creating the other destination", async () => {
  await using root = await temporaryRoot("all-refuse");
  const claudeRoot = join(root.path, "claude", "skills");
  const codexRoot = join(root.path, "codex", "skills");
  const codexTarget = join(codexRoot, "earned-done");
  await mkdir(codexTarget, { recursive: true });
  await writeFile(join(codexTarget, "foreign.txt"), "preserve\n");

  const result = await run(
    ["install", "earned-done", "--provider", "all"],
    { CLAUDE_SKILLS_DIR: claudeRoot, CODEX_SKILLS_DIR: codexRoot },
    packageRoot,
  );
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /^PLAN\t\[claude\]/);
  assert.match(result.stdout, /REFUSE\t\[codex\]/);
  await assert.rejects(lstat(claudeRoot), { code: "ENOENT" });
  assert.equal(await readFile(join(codexTarget, "foreign.txt"), "utf8"), "preserve\n");
});

test("provider all copies both destinations after common preflight", async () => {
  await using root = await temporaryRoot("all-install");
  const claudeRoot = join(root.path, "claude", "skills");
  const codexRoot = join(root.path, "codex", "skills");
  const result = await run(
    ["install", "earned-done", "--provider", "all"],
    { CLAUDE_SKILLS_DIR: claudeRoot, CODEX_SKILLS_DIR: codexRoot },
    packageRoot,
  );

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /^INSTALLED\t\[claude\]/);
  assert.match(result.stdout, /INSTALLED\t\[codex\]/);
  for (const rootPath of [claudeRoot, codexRoot]) {
    assert.equal(
      await readFile(join(rootPath, "earned-done", "ReviewTaste.md"), "utf8"),
      await readFile(join(packageRoot, "earned-done", "ReviewTaste.md"), "utf8"),
    );
  }
});

test("provider roots must be absolute and non-root", async () => {
  await using root = await temporaryRoot("bad-roots");
  for (const configured of ["relative/skills", parse(root.path).root]) {
    const result = await run(
      ["install", "earned-done", "--provider", "codex", "--dry-run"],
      { CODEX_SKILLS_DIR: configured },
      packageRoot,
    );
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /absolute non-root path/);
  }
});

test("a missing packaged SKILL.md is rejected before destination writes", async () => {
  await using root = await temporaryRoot("missing-source");
  const fixturePackage = join(root.path, "package");
  const providerRoot = join(root.path, "provider", "skills");
  await mkdir(join(fixturePackage, "earned-done"), { recursive: true });

  const result = await run(
    ["install", "earned-done", "--provider", "codex"],
    { CODEX_SKILLS_DIR: providerRoot },
    fixturePackage,
  );
  assert.equal(result.exitCode, 4);
  assert.match(result.stderr, /invalid packaged skill/);
  await assert.rejects(lstat(providerRoot), { code: "ENOENT" });
});

test("the source entrypoint still runs when invoked through a symlink", async () => {
  await using root = await temporaryRoot("entry");
  const entry = join(root.path, "toomean-skills.ts");
  await symlink(join(packageRoot, "cli", "src", "main.ts"), entry, "file");

  const { stderr, stdout } = await execFileAsync(process.execPath, [entry, "--help"], { cwd: packageRoot });
  assert.equal(stderr, "");
  assert.match(stdout, /^usage:/);
});
