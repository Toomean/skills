import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, readdir, rename, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import test from "node:test";

import { parse } from "smol-toml";

import { PackageError, assemblePackage } from "../src/package.ts";
import { IntegrityError, canonicalJson, loadCatalog, sha256, verifyPayload } from "../src/catalog.ts";
import { ManifestError, parseManifestForTest } from "../src/manifest.ts";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined) throw new Error(`missing test environment: ${name}`);
  return value;
}

const repositoryRoot = requiredEnvironment("SKILLS_REPO_ROOT");
const bundledCli = requiredEnvironment("SKILLS_BUNDLED_CLI");

async function files(root: string): Promise<readonly string[]> {
  const result: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else result.push(relative(root, path).split(sep).join("/"));
    }
  }
  await visit(root);
  return result.sort();
}

test("manifest v2 rejects v1 and missing runtime closure", async () => {
  const source = await readFile(join(repositoryRoot, "skills.toml"), "utf8");
  const manifest = parse(source) as Record<string, unknown>;
  assert.throws(
    () => parseManifestForTest({ ...manifest, manifest_version: 1 }),
    (error: unknown) => error instanceof ManifestError && error.message === "manifest_version must be 2",
  );
  const skills = structuredClone(manifest.skills) as Record<string, Record<string, unknown>>;
  delete skills["earned-done"]!.runtime_files;
  assert.throws(
    () => parseManifestForTest({ ...manifest, skills }),
    (error: unknown) => error instanceof ManifestError && error.message.includes("skill schema"),
  );
});

test("assembler emits a canonical zero-Python package and refuses an existing output", async () => {
  const root = await mkdtemp(join(tmpdir(), "toomean-skills-package-test-"));
  const output = join(root, "package");
  const catalog = await assemblePackage(repositoryRoot, bundledCli, output);
  assert.equal(catalog.skills.length, 1);
  assert.equal(catalog.skills[0]!.files.length, 12);
  await verifyPayload(output, (await loadCatalog(output)).skills);

  const inventory = await files(output);
  assert.equal(inventory.some((path) => path.endsWith(".py") || path.endsWith(".pyc")), false);
  assert.equal(inventory.some((path) => path.includes("node_modules/") || path.includes("/test/")), false);
  const packageJson = JSON.parse(await readFile(join(output, "package.json"), "utf8")) as Record<string, unknown>;
  assert.equal(Object.hasOwn(packageJson, "scripts"), false);
  assert.equal(Object.hasOwn(packageJson, "dependencies"), false);
  assert.deepEqual(packageJson.bin, { "toomean-skills": "./bin/toomean-skills.js" });

  await assert.rejects(
    assemblePackage(repositoryRoot, bundledCli, output),
    (error: unknown) => error instanceof PackageError && error.message.includes("output must be absent"),
  );
});

test("payload byte and mode mutations fail integrity", async () => {
  const root = await mkdtemp(join(tmpdir(), "toomean-skills-payload-test-"));
  const output = join(root, "package");
  await assemblePackage(repositoryRoot, bundledCli, output);
  const catalog = await loadCatalog(output);
  const skillFile = join(output, "skills", "earned-done", "SKILL.md");
  await writeFile(skillFile, `${await readFile(skillFile, "utf8")}mutated\n`);
  await assert.rejects(
    verifyPayload(output, catalog.skills),
    (error: unknown) => error instanceof IntegrityError && error.message.includes("content/mode mismatch"),
  );

  const secondOutput = join(root, "package-mode");
  await assemblePackage(repositoryRoot, bundledCli, secondOutput);
  const secondCatalog = await loadCatalog(secondOutput);
  await chmod(join(secondOutput, "skills", "earned-done", "SKILL.md"), 0o755);
  await assert.rejects(
    verifyPayload(secondOutput, secondCatalog.skills),
    (error: unknown) => error instanceof IntegrityError && error.message.includes("mode mismatch"),
  );

  const thirdOutput = join(root, "package-group-mode");
  await assemblePackage(repositoryRoot, bundledCli, thirdOutput);
  const thirdCatalog = await loadCatalog(thirdOutput);
  await chmod(join(thirdOutput, "skills", "earned-done", "SKILL.md"), 0o654);
  await assert.rejects(
    verifyPayload(thirdOutput, thirdCatalog.skills),
    (error: unknown) => error instanceof IntegrityError && error.message.includes("mode mismatch"),
  );

  const fourthOutput = join(root, "package-symlink-root");
  await assemblePackage(repositoryRoot, bundledCli, fourthOutput);
  const fourthCatalog = await loadCatalog(fourthOutput);
  const skillRoot = join(fourthOutput, "skills", "earned-done");
  const movedSkillRoot = join(fourthOutput, "skills", "earned-done-real");
  await rename(skillRoot, movedSkillRoot);
  await symlink(movedSkillRoot, skillRoot, "dir");
  await assert.rejects(
    verifyPayload(fourthOutput, fourthCatalog.skills),
    (error: unknown) => error instanceof IntegrityError && error.message.includes("payload root must be a real directory"),
  );
});

test("catalog traversal mutations fail even with a recomputed sidecar", async () => {
  for (const mutation of ["skill-path", "file-path"] as const) {
    const root = await mkdtemp(join(tmpdir(), "toomean-skills-catalog-test-"));
    const output = join(root, "package");
    await assemblePackage(repositoryRoot, bundledCli, output);
    const catalogPath = join(output, "catalog.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
      skills: { files: { path: string }[]; path: string }[];
    };
    if (mutation === "skill-path") catalog.skills[0]!.path = "../escape";
    else catalog.skills[0]!.files[0]!.path = "../SKILL.md";
    const bytes = canonicalJson(catalog);
    await writeFile(catalogPath, bytes);
    await writeFile(join(output, "catalog.sha256"), `${sha256(bytes)}\n`);
    await assert.rejects(
      loadCatalog(output),
      (error: unknown) => error instanceof IntegrityError && error.message.includes("invalid catalog.skills[0]"),
    );
  }
});
