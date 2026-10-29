import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtempDisposable, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, vi } from "vitest";

const fault = vi.hoisted(() => ({
  copyDestination: "", failStage: false, renameDestination: "", corruptReceipt: "",
  failLockWrite: "", failLockRemoval: "", stageTouchTarget: "", pauseTarget: "",
  reached: undefined as undefined | (() => void), resume: undefined as undefined | Promise<void>,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    cp: async (...args: Parameters<typeof actual.cp>) => {
      if (fault.stageTouchTarget && String(args[1]).includes(".stage-")) {
        await actual.writeFile(join(fault.stageTouchTarget, "SKILL.md"), "edited-during-stage\n");
        throw new Error("injected stage failure after target change");
      }
      if (args[1] === fault.copyDestination || (fault.failStage && String(args[1]).includes(".stage-"))) {
        await actual.mkdir(args[1], { recursive: true });
        await actual.writeFile(join(String(args[1]), "SKILL.md"), "partial copy\n");
        throw new Error("injected partial copy failure");
      }
      return actual.cp(...args);
    },
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (args[1] === fault.renameDestination) throw new Error("injected rename failure");
      if (args[1] === fault.pauseTarget) { fault.reached?.(); await fault.resume; }
      await actual.rename(...args);
      if (args[1] === fault.corruptReceipt) {
        const receipt = JSON.parse(await actual.readFile(args[1], "utf8"));
        receipt.packageVersion = "corrupted-version";
        await actual.writeFile(args[1], JSON.stringify(receipt));
      }
    },
    open: async (...args: Parameters<typeof actual.open>) => {
      if (args[0] !== fault.failLockWrite) return actual.open(...args);
      const handle = await actual.open(...args);
      return {
        writeFile: async (...writeArgs: Parameters<typeof handle.writeFile>) => {
          await handle.writeFile(...writeArgs);
          throw new Error("injected lock write failure");
        },
        close: () => handle.close(),
      } as unknown as typeof handle;
    },
    unlink: async (...args: Parameters<typeof actual.unlink>) => {
      if (args[0] === fault.failLockRemoval) throw new Error("injected lock removal failure");
      return actual.unlink(...args);
    },
  };
});

import { run } from "../src/cli.ts";

function temporaryRoot(name: string) {
  return mkdtempDisposable(join(tmpdir(), `toomean-update-failure-${name}-`));
}

async function fixture(root: string, name: string, version: string, content: string, all = false) {
  const packageRoot = join(root, name);
  await mkdir(packageRoot);
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: "@toomean/skills", version }));
  for (const skill of all ? ["earned-done", "brainstorm", "mental-map"] : ["earned-done"]) {
    await mkdir(join(packageRoot, skill));
    await writeFile(join(packageRoot, skill, "SKILL.md"), content);
  }
  return packageRoot;
}

test("install all retains completed receipts and reports a later partial copy without claiming it", async () => {
  await using root = await temporaryRoot("install-partial");
  const pkg = await fixture(root.path, "pkg", "0.1.0-alpha.7", "source\n", true);
  const claude = join(root.path, "claude", "skills");
  const codex = join(root.path, "codex", "skills");
  const failedTarget = join(claude, "mental-map");
  fault.copyDestination = failedTarget;
  let result;
  try { result = await run(["install", "all", "--provider", "all"], { CLAUDE_SKILLS_DIR: claude, CODEX_SKILLS_DIR: codex }, pkg); }
  finally { fault.copyDestination = ""; }
  assert.equal(result.exitCode, 4);
  assert.equal(result.stdout, ["earned-done", "brainstorm"].flatMap((skill) => [
    `INSTALLED\t[claude]\t${skill}\t${join(claude, skill)}`,
    `INSTALLED\t[codex]\t${skill}\t${join(codex, skill)}`,
  ]).join("\n") + "\n");
  assert.match(result.stderr, /may now be partial; completed installs were not removed/);
  assert.match(result.stderr, /recovery lock/);
  assert.equal(await readFile(join(failedTarget, "SKILL.md"), "utf8"), "partial copy\n");
  await assert.rejects(lstat(join(`${claude}.toomean-skills-state`, "mental-map.json")), { code: "ENOENT" });
  for (const rootPath of [claude, codex]) for (const skill of ["earned-done", "brainstorm"]) {
    assert.equal(JSON.parse(await readFile(join(`${rootPath}.toomean-skills-state`, `${skill}.json`), "utf8")).mode, "copy");
  }
});

test("activation failure retains old tree backup and a path-bearing recovery lock", async () => {
  await using root = await temporaryRoot("activation");
  const first = await fixture(root.path, "first", "0.1.0-alpha.7", "old\n");
  const second = await fixture(root.path, "second", "0.1.0-alpha.8", "new\n");
  const providerRoot = join(root.path, "skills");
  const env = { CODEX_SKILLS_DIR: providerRoot };
  const target = join(providerRoot, "earned-done");
  assert.equal((await run(["install", "earned-done", "--provider", "codex"], env, first)).exitCode, 0);
  fault.renameDestination = target;
  let result;
  try { result = await run(["update", "earned-done", "--provider", "codex"], env, second); }
  finally { fault.renameDestination = ""; }
  assert.equal(result.exitCode, 4);
  assert.match(result.stdout, /UNCERTAIN\/PARTIAL/);
  const recovery = JSON.parse(result.stdout.match(/^UNCERTAIN\/PARTIAL\t(.+)$/m)?.[1] ?? "null") as { backup: string } | null;
  const backup = recovery?.backup;
  assert.ok(backup);
  assert.equal(await readFile(join(backup, "SKILL.md"), "utf8"), "old\n");
  await assert.rejects(lstat(target), { code: "ENOENT" });
  const lock = JSON.parse(await readFile(join(`${providerRoot}.toomean-skills-state`, "earned-done.lock"), "utf8"));
  assert.equal(lock.target, target);
  assert.equal(lock.backup, backup);
  assert.ok(lock.stage && lock.oldReceipt);
});

test("stage failure leaves live tree untouched and releases its lock", async () => {
  await using root = await temporaryRoot("stage");
  const first = await fixture(root.path, "first", "0.1.0-alpha.7", "old\n");
  const second = await fixture(root.path, "second", "0.1.0-alpha.8", "new\n");
  const providerRoot = join(root.path, "skills");
  const env = { CODEX_SKILLS_DIR: providerRoot };
  const target = join(providerRoot, "earned-done");
  assert.equal((await run(["install", "earned-done", "--provider", "codex"], env, first)).exitCode, 0);
  fault.failStage = true;
  let result;
  try { result = await run(["update", "earned-done", "--provider", "codex"], env, second); }
  finally { fault.failStage = false; }
  assert.equal(result.exitCode, 4);
  assert.match(result.stdout, /REFUSED/);
  assert.doesNotMatch(result.stdout, /UNCERTAIN\/PARTIAL/);
  assert.equal(await readFile(join(target, "SKILL.md"), "utf8"), "old\n");
  await assert.rejects(lstat(join(`${providerRoot}.toomean-skills-state`, "earned-done.lock")), { code: "ENOENT" });
});

test("receipt-publication failure keeps new tree, old receipt, backup and recovery lock", async () => {
  await using root = await temporaryRoot("receipt");
  const first = await fixture(root.path, "first", "0.1.0-alpha.7", "old\n");
  const second = await fixture(root.path, "second", "0.1.0-alpha.8", "new\n");
  const providerRoot = join(root.path, "skills");
  const env = { CODEX_SKILLS_DIR: providerRoot };
  const target = join(providerRoot, "earned-done");
  const receipt = join(`${providerRoot}.toomean-skills-state`, "earned-done.json");
  assert.equal((await run(["install", "earned-done", "--provider", "codex"], env, first)).exitCode, 0);
  const before = await readFile(receipt, "utf8");
  fault.renameDestination = receipt;
  let result;
  try { result = await run(["update", "earned-done", "--provider", "codex"], env, second); }
  finally { fault.renameDestination = ""; }
  assert.equal(result.exitCode, 4);
  assert.match(result.stdout, /UNCERTAIN\/PARTIAL/);
  assert.equal(await readFile(join(target, "SKILL.md"), "utf8"), "new\n");
  assert.equal(await readFile(receipt, "utf8"), before);
  const recovery = JSON.parse(result.stdout.match(/^UNCERTAIN\/PARTIAL\t(.+)$/m)?.[1] ?? "null") as { backup: string } | null;
  const backup = recovery?.backup;
  assert.ok(backup);
  assert.equal(await readFile(join(backup, "SKILL.md"), "utf8"), "old\n");
  let prompts = 0;
  const retry = await run(["update", "earned-done", "--provider", "codex", "--replace"], env, second, async () => { prompts++; return true; });
  assert.equal(retry.exitCode, 1);
  assert.equal(prompts, 0);
  assert.match(retry.stderr, /recovery lock exists/);
});

test("lock write failure reports its surviving path without releasing a foreign lock", async () => {
  await using root = await temporaryRoot("lock-write");
  const first = await fixture(root.path, "first", "v1", "old\n");
  const second = await fixture(root.path, "second", "v2", "new\n");
  const providerRoot = join(root.path, "skills");
  const env = { CODEX_SKILLS_DIR: providerRoot };
  assert.equal((await run(["install", "earned-done", "--provider", "codex"], env, first)).exitCode, 0);
  const lock = join(`${providerRoot}.toomean-skills-state`, "earned-done.lock");
  fault.failLockWrite = lock;
  let result;
  try { result = await run(["update", "earned-done", "--provider", "codex"], env, second); }
  finally { fault.failLockWrite = ""; }
  assert.equal(result.exitCode, 4);
  assert.match(result.stdout, /UNCERTAIN\/PARTIAL/);
  assert.match(result.stderr, /retained lock blocks further writes/);
  assert.equal(JSON.parse(await readFile(lock, "utf8")).target, join(providerRoot, "earned-done"));
  const retry = await run(["update", "earned-done", "--provider", "codex"], env, second);
  assert.equal(retry.exitCode, 1);
  assert.match(retry.stderr, /recovery lock exists/);
});

test("post-publication receipt corruption cannot report UPDATED", async () => {
  await using root = await temporaryRoot("receipt-corruption");
  const first = await fixture(root.path, "first", "v1", "old\n");
  const second = await fixture(root.path, "second", "v2", "new\n");
  const providerRoot = join(root.path, "skills");
  const env = { CODEX_SKILLS_DIR: providerRoot };
  assert.equal((await run(["install", "earned-done", "--provider", "codex"], env, first)).exitCode, 0);
  const receipt = join(`${providerRoot}.toomean-skills-state`, "earned-done.json");
  fault.corruptReceipt = receipt;
  let result;
  try { result = await run(["update", "earned-done", "--provider", "codex"], env, second); }
  finally { fault.corruptReceipt = ""; }
  assert.equal(result.exitCode, 4);
  assert.match(result.stdout, /UNCERTAIN\/PARTIAL/);
  assert.doesNotMatch(result.stdout, /UPDATED/);
  assert.equal(JSON.parse(await readFile(receipt, "utf8")).packageVersion, "corrupted-version");
  await lstat(join(`${providerRoot}.toomean-skills-state`, "earned-done.lock"));
});

test("stage failure after target changes retains the lock and reports uncertainty", async () => {
  await using root = await temporaryRoot("stage-target-change");
  const first = await fixture(root.path, "first", "v1", "old\n");
  const second = await fixture(root.path, "second", "v2", "new\n");
  const providerRoot = join(root.path, "skills");
  const env = { CODEX_SKILLS_DIR: providerRoot };
  const target = join(providerRoot, "earned-done");
  assert.equal((await run(["install", "earned-done", "--provider", "codex"], env, first)).exitCode, 0);
  fault.stageTouchTarget = target;
  let result;
  try { result = await run(["update", "earned-done", "--provider", "codex"], env, second); }
  finally { fault.stageTouchTarget = ""; }
  assert.equal(result.exitCode, 4);
  assert.match(result.stdout, /UNCERTAIN\/PARTIAL/);
  assert.equal(await readFile(join(target, "SKILL.md"), "utf8"), "edited-during-stage\n");
  await lstat(join(`${providerRoot}.toomean-skills-state`, "earned-done.lock"));
});

test("unsafe backups directory refuses before moving old tree", async () => {
  await using root = await temporaryRoot("unsafe-backups");
  const first = await fixture(root.path, "first", "v1", "old\n");
  const second = await fixture(root.path, "second", "v2", "new\n");
  const providerRoot = join(root.path, "skills");
  const env = { CODEX_SKILLS_DIR: providerRoot };
  const target = join(providerRoot, "earned-done");
  assert.equal((await run(["install", "earned-done", "--provider", "codex"], env, first)).exitCode, 0);
  const backups = join(`${providerRoot}.toomean-skills-state`, "backups");
  await mkdir(backups);
  await chmod(backups, 0o777);
  const result = await run(["update", "earned-done", "--provider", "codex"], env, second);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /unsafe state directory/);
  assert.equal(await readFile(join(target, "SKILL.md"), "utf8"), "old\n");
  await assert.rejects(lstat(join(`${providerRoot}.toomean-skills-state`, "earned-done.lock")), { code: "ENOENT" });
});

test("lock-removal failure reports uncertainty while retaining backup and active receipt", async () => {
  await using root = await temporaryRoot("lock-removal");
  const first = await fixture(root.path, "first", "v1", "old\n");
  const second = await fixture(root.path, "second", "v2", "new\n");
  const providerRoot = join(root.path, "skills");
  const env = { CODEX_SKILLS_DIR: providerRoot };
  assert.equal((await run(["install", "earned-done", "--provider", "codex"], env, first)).exitCode, 0);
  fault.failLockRemoval = join(`${providerRoot}.toomean-skills-state`, "earned-done.lock");
  let result;
  try { result = await run(["update", "earned-done", "--provider", "codex"], env, second); }
  finally { fault.failLockRemoval = ""; }
  assert.equal(result.exitCode, 4);
  assert.match(result.stdout, /UNCERTAIN\/PARTIAL/);
  const recovery = JSON.parse(result.stdout.match(/^UNCERTAIN\/PARTIAL\t(.+)$/m)?.[1] ?? "null") as { backup: string } | null;
  assert.ok(recovery?.backup);
  assert.equal(await readFile(join(recovery.backup, "SKILL.md"), "utf8"), "old\n");
  assert.equal(await readFile(join(providerRoot, "earned-done", "SKILL.md"), "utf8"), "new\n");
  assert.equal(JSON.parse(await readFile(join(`${providerRoot}.toomean-skills-state`, "earned-done.json"), "utf8")).packageVersion, "v2");
  await lstat(join(`${providerRoot}.toomean-skills-state`, "earned-done.lock"));
});

test("concurrent install refuses while update target is temporarily absent", async () => {
  await using root = await temporaryRoot("shared-lock");
  const first = await fixture(root.path, "first", "v1", "old\n");
  const second = await fixture(root.path, "second", "v2", "new\n");
  const providerRoot = join(root.path, "skills");
  const target = join(providerRoot, "earned-done");
  const env = { CODEX_SKILLS_DIR: providerRoot };
  assert.equal((await run(["install", "earned-done", "--provider", "codex"], env, first)).exitCode, 0);
  let reached!: () => void;
  let resume!: () => void;
  const reachedPromise = new Promise<void>((resolve) => { reached = resolve; });
  const resumePromise = new Promise<void>((resolve) => { resume = resolve; });
  fault.pauseTarget = target;
  fault.reached = reached;
  fault.resume = resumePromise;
  try {
    const updating = run(["update", "earned-done", "--provider", "codex"], env, second);
    await reachedPromise;
    await assert.rejects(lstat(target), { code: "ENOENT" });
    const install = await run(["install", "earned-done", "--provider", "codex"], env, second);
    assert.equal(install.exitCode, 1);
    assert.match(install.stderr, /recovery lock exists/);
    resume();
    const updated = await updating;
    assert.equal(updated.exitCode, 0, updated.stderr);
    assert.equal(await readFile(join(target, "SKILL.md"), "utf8"), "new\n");
  } finally {
    resume();
    fault.pauseTarget = "";
    fault.reached = undefined;
    fault.resume = undefined;
  }
});
