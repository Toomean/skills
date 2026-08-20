import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
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

test("install dry-run plans both providers without writing", async () => {
  const root = await mkdtemp(join(tmpdir(), "toomean-skills-cli-test-"));
  const targets = join(root, "targets");
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
  const parsed = JSON.parse(result.stdout) as { plans: { action: string; state: string }[] };
  assert.deepEqual(parsed.plans.map(({ action, state }) => ({ action, state })), [
    { action: "install", state: "absent" },
    { action: "install", state: "absent" },
  ]);
});

test("foreign targets and mutation requests fail without changing the target", async () => {
  const root = await mkdtemp(join(tmpdir(), "toomean-skills-cli-foreign-"));
  const providerRoot = join(root, "codex", "skills");
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
