import assert from "node:assert/strict";
import { mkdir, mkdtempDisposable, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { run } from "../src/cli.ts";

const packageRoot = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), "../.."));

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
  const help = await run(["list", "-h"], {}, packageRoot);
  assert.equal(help.exitCode, 0);
  assert.match(help.stdout, /^usage:/);

  await using root = await mkdtempDisposable(join(tmpdir(), "toomean-skills-cli-options-"));
  const inline = await run(
    ["install", "earned-done", "--provider=codex", "--dry-run"],
    { CODEX_SKILLS_DIR: join(root.path, "codex", "skills") },
    packageRoot,
  );
  assert.equal(inline.exitCode, 0);

  for (const argv of [
    ["list", "--unknown"],
    ["install", "earned-done", "--provider"],
  ]) {
    const result = await run(argv, {}, packageRoot);
    assert.equal(result.exitCode, 2);
  }
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
