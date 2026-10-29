import assert from "node:assert/strict";
import { link, lstat, mkdir, mkdtempDisposable, readFile, readlink, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";

import { run } from "../src/cli.ts";
import { statePaths } from "../src/update-state.ts";

function temporaryRoot(name: string) {
  return mkdtempDisposable(join(tmpdir(), `toomean-update-${name}-`));
}

async function packageFixture(root: string, name: string, content: string, version: string) {
  const packageRoot = join(root, name);
  const skillRoot = join(packageRoot, "earned-done");
  await mkdir(skillRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: "@toomean/skills", version }));
  await writeFile(join(skillRoot, "SKILL.md"), content);
  return packageRoot;
}

test("copied install records a complete baseline; clean update retains old tree and receipt", async () => {
  await using root = await temporaryRoot("clean");
  const first = await packageFixture(root.path, "first", "first\n", "0.1.0-alpha.7");
  const second = await packageFixture(root.path, "second", "second\n", "0.1.0-alpha.8");
  await writeFile(join(second, "earned-done", ".hidden"), "hidden\n");
  await mkdir(join(second, "earned-done", "empty"));
  const providerRoot = join(root.path, "codex", "skills");
  const environment = { CODEX_SKILLS_DIR: providerRoot };
  const target = join(providerRoot, "earned-done");
  const receiptPath = join(`${providerRoot}.toomean-skills-state`, "earned-done.json");
  const installed = await run(["install", "earned-done", "--provider", "codex"], environment, first);
  assert.equal(installed.exitCode, 0, installed.stderr);
  const oldReceipt = await readFile(receiptPath, "utf8");
  assert.equal(JSON.parse(oldReceipt).packageVersion, "0.1.0-alpha.7");

  const result = await run(["update", "earned-done", "--provider", "codex"], environment, second);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /STATE\tCLEAN/);
  assert.match(result.stdout, /ADD\t"\.hidden"/);
  assert.match(result.stdout, /ADD\t"empty"/);
  assert.match(result.stdout, /CHANGE\t"SKILL.md"/);
  assert.equal(await readFile(join(target, "SKILL.md"), "utf8"), "second\n");
  const backup = JSON.parse(result.stdout.match(/^BACKUP\t(.+)$/m)?.[1] ?? "null") as string | null;
  const oldReceiptBackup = JSON.parse(result.stdout.match(/^OLD_RECEIPT\t(.+)$/m)?.[1] ?? "null") as string | null;
  assert.ok(backup && oldReceiptBackup);
  assert.equal(await readFile(join(backup, "SKILL.md"), "utf8"), "first\n");
  assert.equal(await readFile(oldReceiptBackup, "utf8"), oldReceipt);
  const newReceipt = JSON.parse(await readFile(receiptPath, "utf8"));
  assert.equal(newReceipt.packageVersion, "0.1.0-alpha.8");
  assert.ok(newReceipt.inventory.some((entry: { path: string }) => entry.path === ".hidden"));
  await assert.rejects(lstat(join(`${providerRoot}.toomean-skills-state`, "earned-done.lock")), { code: "ENOENT" });
});

test("unchanged receipt-backed tree does not rewrite or create backup", async () => {
  await using root = await temporaryRoot("unchanged");
  const pkg = await packageFixture(root.path, "pkg", "same\n", "0.1.0-alpha.7");
  const providerRoot = join(root.path, "skills");
  const env = { CODEX_SKILLS_DIR: providerRoot };
  assert.equal((await run(["install", "earned-done", "--provider", "codex"], env, pkg)).exitCode, 0);
  const receipt = join(`${providerRoot}.toomean-skills-state`, "earned-done.json");
  const before = await readFile(receipt, "utf8");
  const result = await run(["update", "earned-done", "--provider", "codex"], env, pkg);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /UNCHANGED/);
  assert.equal(await readFile(receipt, "utf8"), before);
  await assert.rejects(lstat(join(`${providerRoot}.toomean-skills-state`, "backups")), { code: "ENOENT" });
});

test.each(["edited", "added", "deleted"] as const)("$0 target refuses default and needs confirmed replacement", async (change) => {
  await using root = await temporaryRoot(change);
  const first = await packageFixture(root.path, "first", "first\n", "0.1.0-alpha.7");
  await writeFile(join(first, "earned-done", "extra.txt"), "shipped\n");
  const second = await packageFixture(root.path, "second", "second\n", "0.1.0-alpha.8");
  const providerRoot = join(root.path, "skills");
  const env = { CODEX_SKILLS_DIR: providerRoot };
  const target = join(providerRoot, "earned-done");
  assert.equal((await run(["install", "earned-done", "--provider", "codex"], env, first)).exitCode, 0);
  if (change === "edited") await writeFile(join(target, "SKILL.md"), "local\n");
  if (change === "added") await writeFile(join(target, "local.txt"), "local\n");
  if (change === "deleted") await import("node:fs/promises").then(({ unlink }) => unlink(join(target, "extra.txt")));
  const refused = await run(["update", "earned-done", "--provider", "codex"], env, second);
  assert.equal(refused.exitCode, 1);
  assert.match(refused.stdout, /STATE\tEDITED/);
  assert.match(refused.stdout, /requires --replace/);
  let prompts = 0;
  const replaced = await run(["update", "earned-done", "--provider", "codex", "--replace"], env, second, async (prompt) => {
    prompts++;
    assert.match(prompt, /STATE\tEDITED/);
    return true;
  });
  assert.equal(prompts, 1);
  assert.equal(replaced.exitCode, 0, replaced.stderr);
  assert.equal(await readFile(join(target, "SKILL.md"), "utf8"), "second\n");
});

test("receipt-less equal tree is unclaimed; dry-run writes nothing and confirmed replacement claims it", async () => {
  await using root = await temporaryRoot("unclaimed");
  const pkg = await packageFixture(root.path, "pkg", "same\n", "0.1.0-alpha.7");
  const providerRoot = join(root.path, "skills");
  const target = join(providerRoot, "earned-done");
  const env = { CODEX_SKILLS_DIR: providerRoot };
  await mkdir(target, { recursive: true });
  await writeFile(join(target, "SKILL.md"), "same\n");
  const preview = await run(["update", "earned-done", "--provider", "codex", "--dry-run"], env, pkg);
  assert.equal(preview.exitCode, 0);
  assert.match(preview.stdout, /STATE\tUNCLAIMED/);
  assert.match(preview.stdout, /DELTA\tNONE/);
  await assert.rejects(lstat(`${providerRoot}.toomean-skills-state`), { code: "ENOENT" });
  assert.equal((await run(["update", "earned-done", "--provider", "codex"], env, pkg)).exitCode, 1);
  const result = await run(["update", "earned-done", "--provider", "codex", "--replace"], env, pkg, async () => true);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /UPDATED/);
  assert.equal(JSON.parse(await readFile(join(`${providerRoot}.toomean-skills-state`, "earned-done.json"), "utf8")).mode, "copy");
});

test("edited bytes equal incoming still require confirmation and a new receipt", async () => {
  await using root = await temporaryRoot("edited-equal");
  const first = await packageFixture(root.path, "first", "old\n", "0.1.0-alpha.7");
  const second = await packageFixture(root.path, "second", "new\n", "0.1.0-alpha.8");
  const providerRoot = join(root.path, "skills");
  const env = { CODEX_SKILLS_DIR: providerRoot };
  assert.equal((await run(["install", "earned-done", "--provider", "codex"], env, first)).exitCode, 0);
  await writeFile(join(providerRoot, "earned-done", "SKILL.md"), "new\n");
  const refused = await run(["update", "earned-done", "--provider", "codex"], env, second);
  assert.equal(refused.exitCode, 1);
  assert.match(refused.stdout, /STATE\tEDITED/);
  assert.doesNotMatch(refused.stdout, /UNCHANGED/);
  const result = await run(["update", "earned-done", "--provider", "codex", "--replace"], env, second, async () => true);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(JSON.parse(await readFile(join(`${providerRoot}.toomean-skills-state`, "earned-done.json"), "utf8")).packageVersion, "0.1.0-alpha.8");
});

test.each(["invalid-receipt", "recovery-lock"] as const)("$0 refuses even with replacement", async (kind) => {
  await using root = await temporaryRoot(kind);
  const pkg = await packageFixture(root.path, "pkg", "same\n", "0.1.0-alpha.7");
  const providerRoot = join(root.path, "skills");
  const env = { CODEX_SKILLS_DIR: providerRoot };
  assert.equal((await run(["install", "earned-done", "--provider", "codex"], env, pkg)).exitCode, 0);
  const state = `${providerRoot}.toomean-skills-state`;
  if (kind === "invalid-receipt") {
    const path = join(state, "earned-done.json");
    const data = JSON.parse(await readFile(path, "utf8"));
    data.packageName = "other";
    await writeFile(path, JSON.stringify(data));
  } else await writeFile(join(state, "earned-done.lock"), "partial");
  let prompts = 0;
  const result = await run(["update", "earned-done", "--provider", "codex", "--replace"], env, pkg, async () => { prompts++; return true; });
  assert.equal(result.exitCode, 1);
  assert.equal(prompts, 0);
  assert.match(result.stderr, /invalid receipt|recovery lock/);
});

test.each(["top-link", "nested-link", "hardlink"] as const)("$0 target refuses without traversal or replacement", async (kind) => {
  await using root = await temporaryRoot(kind);
  const pkg = await packageFixture(root.path, "pkg", "same\n", "0.1.0-alpha.7");
  const providerRoot = join(root.path, "skills");
  const target = join(providerRoot, "earned-done");
  const env = { CODEX_SKILLS_DIR: providerRoot };
  await mkdir(providerRoot, { recursive: true });
  if (kind === "top-link") await symlink(join(pkg, "earned-done"), target);
  else {
    await mkdir(target);
    if (kind === "nested-link") {
      await writeFile(join(target, "SKILL.md"), "same\n");
      await symlink(join(root.path, "absent"), join(target, "broken"));
    } else {
      const outside = join(root.path, "outside.md");
      await writeFile(outside, "same\n");
      await link(outside, join(target, "SKILL.md"));
    }
  }
  const result = await run(["update", "earned-done", "--provider", "codex", "--replace"], env, pkg, async () => true);
  assert.equal(result.exitCode, 1);
  await assert.rejects(lstat(`${providerRoot}.toomean-skills-state`), { code: "ENOENT" });
  if (kind === "top-link") assert.equal(await readlink(target), join(pkg, "earned-done"));
});

test("post-consent tree change refuses and does not reuse the confirmation", async () => {
  await using root = await temporaryRoot("changed-after-consent");
  const pkg = await packageFixture(root.path, "pkg", "same\n", "0.1.0-alpha.7");
  const providerRoot = join(root.path, "skills");
  const target = join(providerRoot, "earned-done");
  const env = { CODEX_SKILLS_DIR: providerRoot };
  await mkdir(target, { recursive: true });
  await writeFile(join(target, "SKILL.md"), "same\n");
  const result = await run(["update", "earned-done", "--provider", "codex", "--replace"], env, pkg, async () => {
    await writeFile(join(target, "local.txt"), "later\n");
    return true;
  });
  assert.equal(result.exitCode, 1, result.stderr);
  assert.match(result.stderr, /changed after preview/);
  assert.equal(await readFile(join(target, "local.txt"), "utf8"), "later\n");
  await assert.rejects(lstat(join(`${providerRoot}.toomean-skills-state`, "earned-done.lock")), { code: "ENOENT" });
});

test("noninteractive or negative replacement refuses before writes; preview escapes control characters", async () => {
  await using root = await temporaryRoot("declined");
  const pkg = await packageFixture(root.path, "pkg", "incoming\n", "0.1.0-alpha.7");
  const providerRoot = join(root.path, "skills");
  const target = join(providerRoot, "earned-done");
  const env = { CODEX_SKILLS_DIR: providerRoot };
  await mkdir(target, { recursive: true });
  await writeFile(join(target, "SKILL.md"), "existing\n");
  await writeFile(join(target, "note\tname"), "local\n");
  const noTty = await run(["update", "earned-done", "--provider", "codex", "--replace"], env, pkg);
  assert.equal(noTty.exitCode, 1);
  assert.match(noTty.stdout, /confirmation required/);
  const declined = await run(["update", "earned-done", "--provider", "codex", "--replace"], env, pkg, async () => false);
  assert.equal(declined.exitCode, 1);
  assert.match(declined.stdout, /REMOVE\t"note\\tname"/);
  await assert.rejects(lstat(`${providerRoot}.toomean-skills-state`), { code: "ENOENT" });
});

test("canonical aliases of selected provider targets refuse whole-batch install", async () => {
  await using root = await temporaryRoot("alias");
  const pkg = await packageFixture(root.path, "pkg", "same\n", "0.1.0-alpha.7");
  const actual = join(root.path, "actual");
  const alias = join(root.path, "alias");
  await mkdir(actual);
  await symlink(actual, alias, "dir");
  const result = await run(["install", "earned-done", "--provider", "all"],
    { CODEX_SKILLS_DIR: alias, CLAUDE_SKILLS_DIR: actual }, pkg);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /canonical provider targets\/state must not overlap/);
  await assert.rejects(lstat(join(actual, "earned-done")), { code: "ENOENT" });
  await assert.rejects(lstat(`${actual}.toomean-skills-state`), { code: "ENOENT" });
});

test("existing non-directory provider roots refuse without changing their bytes", async () => {
  await using root = await temporaryRoot("root-file");
  const pkg = await packageFixture(root.path, "pkg", "incoming\n", "v2");
  const file = join(root.path, "root-file");
  await writeFile(file, "user bytes\n");
  for (const configured of [file, join(file, "nested")]) {
    const result = await run(["update", "earned-done", "--provider", "codex", "--dry-run"],
      { CODEX_SKILLS_DIR: configured }, pkg);
    assert.equal(result.exitCode, 1, configured);
    assert.match(result.stderr, /provider root is not a directory/);
  }
  assert.equal(await readFile(file, "utf8"), "user bytes\n");
});

test.skipIf(process.platform !== "linux")("resolved filesystem-root aliases refuse in read-only path planning", async () => {
  await assert.rejects(statePaths({ provider: "codex", root: "/proc/self/root", target: "/proc/self/root/earned-done" }),
    /provider root resolves to filesystem root/);
});
