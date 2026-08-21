import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtempDisposable, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { run } from "../src/cli.ts";

const packageRoot = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), "../.."));
const execFileAsync = promisify(execFile);

test("prints help when the CLI is invoked through a symlink", async () => {
  await using root = await mkdtempDisposable(join(tmpdir(), "toomean-skills-cli-entry-"));
  const entry = join(root.path, "toomean-skills.ts");
  await symlink(join(packageRoot, "cli", "src", "cli.ts"), entry, "file");

  const { stderr, stdout } = await execFileAsync(process.execPath, [entry, "--help"], { cwd: packageRoot });
  assert.equal(stderr, "");
  assert.match(stdout, /^usage:/);
});

test("list reads the packaged skill metadata", async () => {
  const text = await run(["list"], {}, packageRoot);
  assert.equal(text.exitCode, 0);
  assert.match(text.stdout, /^earned-done\t0\.1\.0-alpha\.1\t/);

  const output = await run(["list", "earned-done", "--json"], {}, packageRoot);
  assert.equal(output.exitCode, 0);
  const parsed = JSON.parse(output.stdout) as { package: { name: string }; skills: { name: string }[] };
  assert.equal(parsed.package.name, "@toomean/skills");
  assert.deepEqual(parsed.skills.map((skill) => skill.name), ["earned-done"]);
});

test("accepts standard Node option forms and reports usage errors", async () => {
  for (const argv of [
    ["--help"],
    ["-h"],
    ["list", "--help"],
    ["list", "-h"],
    ["install", "--help"],
    ["install", "-h"],
  ]) {
    const help = await run(argv, {}, packageRoot);
    assert.equal(help.exitCode, 0);
    assert.match(help.stdout, /^usage:/);
  }

  await using root = await mkdtempDisposable(join(tmpdir(), "toomean-skills-cli-options-"));
  const inline = await run(
    ["install", "earned-done", "--provider=codex", "--dry-run"],
    { CODEX_SKILLS_DIR: join(root.path, "codex", "skills") },
    packageRoot,
  );
  assert.equal(inline.exitCode, 0);

  for (const argv of [
    ["list", "--unknown"],
    ["list", "--provider", "codex"],
    ["install", "earned-done", "--provider"],
  ]) {
    const result = await run(argv, {}, packageRoot);
    assert.equal(result.exitCode, 2);
  }

  const jsonError = await run(["unknown", "--json"], {}, packageRoot);
  assert.deepEqual(JSON.parse(jsonError.stdout), {
    code: "usage",
    error: "unknown or unavailable command: unknown",
    exitCode: 2,
    ok: false,
  });

  const textError = await run(["list", "--", "--json"], {}, packageRoot);
  assert.equal(textError.exitCode, 2);
  assert.equal(textError.stdout, "");
  assert.match(textError.stderr, /^ERROR usage:/);
});

test("reports malformed package metadata with a stable text code", async () => {
  await using root = await mkdtempDisposable(join(tmpdir(), "toomean-skills-invalid-package-"));
  await writeFile(
    join(root.path, "package.json"),
    JSON.stringify({ name: "@toomean/skills", toomeanSkills: [], version: "0.1.0" }),
  );

  const result = await run(["list", "--json"], {}, root.path);
  assert.deepEqual(JSON.parse(result.stdout), {
    code: "invalid-package",
    error: "invalid package skill metadata",
    exitCode: 4,
    ok: false,
  });
});

test("reports literal-null package metadata with a stable code", async () => {
  await using root = await mkdtempDisposable(join(tmpdir(), "toomean-skills-cli-null-package-"));
  await writeFile(join(root.path, "package.json"), "null");

  const result = await run(["list", "--json"], {}, root.path);
  assert.deepEqual(JSON.parse(result.stdout), {
    code: "invalid-package",
    error: "invalid package skill metadata",
    exitCode: 4,
    ok: false,
  });
});

test("install dry-run plans both providers without writing", async () => {
  await using root = await mkdtempDisposable(join(tmpdir(), "toomean-skills-cli-test-"));
  const targets = join(root.path, "targets");
  const result = await run(
    ["install", "earned-done", "--provider", "all", "--dry-run", "--json"],
    {
      CLAUDE_SKILLS_DIR: join(targets, "claude", "skills"),
      CODEX_SKILLS_DIR: join(targets, "codex", "skills"),
    },
    packageRoot,
  );
  assert.equal(result.exitCode, 0);
  await assert.rejects(readFile(join(targets, "claude", "skills", "earned-done", "SKILL.md")));
  const parsed = JSON.parse(result.stdout) as { plans: { state: string }[] };
  assert.deepEqual(parsed.plans.map(({ state }) => state), ["absent", "absent"]);
});

test("foreign targets and mutation requests fail without changing the target", async () => {
  await using root = await mkdtempDisposable(join(tmpdir(), "toomean-skills-cli-foreign-"));
  const providerRoot = join(root.path, "codex", "skills");
  const target = join(providerRoot, "earned-done");
  await mkdir(target, { recursive: true });
  const marker = join(target, "foreign.txt");
  await writeFile(marker, "preserve\n");

  const dryRun = await run(
    ["install", "earned-done", "--provider", "codex", "--dry-run"],
    { CODEX_SKILLS_DIR: providerRoot },
    packageRoot,
  );
  const real = await run(
    ["install", "earned-done", "--provider", "codex"],
    { CODEX_SKILLS_DIR: providerRoot },
    packageRoot,
  );
  assert.equal(dryRun.exitCode, 1);
  assert.match(dryRun.stdout, /REFUSE/);
  assert.equal(real.exitCode, 2);
  assert.match(real.stderr, /filesystem mutation is not implemented/);
  assert.equal(await readFile(marker, "utf8"), "preserve\n");
});
