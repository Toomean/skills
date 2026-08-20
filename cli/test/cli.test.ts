import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import test from "node:test";

import { buildPackage } from "../src/build.ts";
import { run } from "../src/cli.ts";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined) throw new Error(`missing test environment: ${name}`);
  return value;
}

const repositoryRoot = requiredEnvironment("SKILLS_REPO_ROOT");
const compiledCli = requiredEnvironment("SKILLS_COMPILED_CLI");

async function snapshot(root: string): Promise<readonly string[]> {
  const result: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const name = relative(root, path).split(sep).join("/");
      if (entry.isDirectory()) {
        result.push(`d:${name}`);
        await visit(path);
      } else if (entry.isFile()) {
        result.push(`f:${name}:${(await readFile(path)).toString("hex")}`);
      } else if (entry.isSymbolicLink()) {
        result.push(`l:${name}`);
      }
    }
  }
  await visit(root);
  return result;
}

async function fixture(): Promise<{ readonly packageRoot: string; readonly root: string }> {
  const root = await mkdtemp(join(tmpdir(), "toomean-skills-cli-test-"));
  const packageRoot = join(root, "package");
  await buildPackage(repositoryRoot, compiledCli, packageRoot);
  return { packageRoot, root };
}

test("list has deterministic text and JSON without target inspection", async () => {
  const { packageRoot } = await fixture();
  const text = await run(["list"], {}, packageRoot);
  assert.equal(text.exitCode, 0);
  assert.match(text.stdout, /^earned-done\t0\.1\.0-alpha\.1\t/);
  const json = await run(["list", "earned-done", "--json"], {}, packageRoot);
  assert.equal(json.exitCode, 0);
  assert.deepEqual(JSON.parse(json.stdout), {
    command: "list",
    ok: true,
    package: { name: "@toomean/skills", version: "0.1.0-alpha.1" },
    skills: [
      {
        description: "Evidence-first orchestration and review for coding agents, with independent roles, empirical verification, and bounded evolution.",
        name: "earned-done",
        version: "0.1.0-alpha.1",
      },
    ],
  });
});

test("install dry-run plans both providers and performs zero writes", async () => {
  const { packageRoot, root } = await fixture();
  const targets = join(root, "targets");
  await mkdir(targets);
  const environment = {
    CLAUDE_SKILLS_DIR: join(targets, "claude", "skills"),
    CODEX_SKILLS_DIR: join(targets, "codex", "skills"),
  };
  const before = await snapshot(targets);
  const result = await run(
    ["install", "earned-done", "--provider", "all", "--dry-run", "--json"],
    environment,
    packageRoot,
  );
  const after = await snapshot(targets);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(after, before);
  const parsed = JSON.parse(result.stdout) as { plans: { action: string; state: string }[] };
  assert.deepEqual(parsed.plans.map(({ action, state }) => ({ action, state })), [
    { action: "install", state: "absent" },
    { action: "install", state: "absent" },
  ]);
});

test("foreign targets fail dry-run without mutation", async () => {
  const { packageRoot, root } = await fixture();
  const providerRoot = join(root, "targets", "codex", "skills");
  const target = join(providerRoot, "earned-done");
  await mkdir(target, { recursive: true });
  await writeFile(join(target, "foreign.txt"), "preserve\n");
  const before = await snapshot(join(root, "targets"));
  const result = await run(
    ["install", "earned-done", "--provider", "codex", "--dry-run", "--json"],
    { CODEX_SKILLS_DIR: providerRoot },
    packageRoot,
  );
  const after = await snapshot(join(root, "targets"));
  assert.equal(result.exitCode, 1);
  assert.deepEqual(after, before);
  assert.deepEqual(JSON.parse(result.stdout).plans[0].state, "foreign");
});

test("real install and project scope remain unavailable", async () => {
  const { packageRoot, root } = await fixture();
  const providerRoot = join(root, "targets", "codex", "skills");
  const environment = { CODEX_SKILLS_DIR: providerRoot };
  const before = await snapshot(root);
  const real = await run(["install", "earned-done", "--provider", "codex"], environment, packageRoot);
  const project = await run(
    ["install", "earned-done", "--provider", "codex", "--scope", "project", "--dry-run"],
    environment,
    packageRoot,
  );
  assert.equal(real.exitCode, 2);
  assert.match(real.stderr, /filesystem mutation is not implemented/);
  assert.equal(project.exitCode, 2);
  assert.match(project.stderr, /project scope belongs to init/);
  assert.deepEqual(await snapshot(root), before);
});

test("unknown commands and non-normalized roots fail closed", async () => {
  const { packageRoot } = await fixture();
  const unknown = await run(["status"], {}, packageRoot);
  assert.equal(unknown.exitCode, 2);
  const root = await run(
    ["install", "all", "--provider", "codex", "--dry-run"],
    { CODEX_SKILLS_DIR: "relative/skills" },
    packageRoot,
  );
  assert.equal(root.exitCode, 2);
});
