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
import { type Destination, InstallationPaths } from "../src/installation-paths.ts";

const packageRoot = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), "../.."));
const execFileAsync = promisify(execFile);
const skillInstallCases = [
  {
    skill: "earned-done",
    files: ["SKILL.md", "references/codex.md", "ReviewTaste.md"],
  },
  {
    skill: "brainstorm",
    files: ["SKILL.md", "README.md", "ideation-techniques.md"],
  },
  {
    skill: "mental-map",
    files: ["SKILL.md", "README.md"],
  },
] as const;

function temporaryRoot(name: string) {
  return mkdtempDisposable(join(tmpdir(), `toomean-skills-${name}-`));
}

test("list, help, and usage stay small and text-only", async () => {
  assert.deepEqual(await run(["list"], {}, packageRoot), {
    exitCode: 0,
    stderr: "",
    stdout: "earned-done\nbrainstorm\nmental-map\n",
  });

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
    ["install", "brainstorm", ".."],
    ["install", "../brainstorm", "--provider", "codex"],
    ["install", "earned-done", "--provider", "other"],
  ]) {
    const result = await run(argv, {}, packageRoot);
    assert.equal(result.exitCode, 2, argv.join(" "));
    assert.match(result.stderr, /^ERROR:/);
    assert.equal(result.stdout, "");
  }
});

test("unsupported and traversal-like skill selections are rejected before writes", async () => {
  await using root = await temporaryRoot("invalid-skill");
  const claudeRoot = join(root.path, "claude", "skills");
  const codexRoot = join(root.path, "codex", "skills");

  for (const skill of ["not-a-skill", "../brainstorm", "brainstorm/../earned-done"]) {
    const result = await run(
      ["install", skill, "--provider", "all"],
      { CLAUDE_SKILLS_DIR: claudeRoot, CODEX_SKILLS_DIR: codexRoot },
      packageRoot,
    );
    assert.equal(result.exitCode, 2, skill);
    assert.equal(result.stdout, "", skill);
  }

  await assert.rejects(lstat(claudeRoot), { code: "ENOENT" });
  await assert.rejects(lstat(codexRoot), { code: "ENOENT" });
});

for (const { skill, files } of skillInstallCases) {
  test(`single-provider install copies ${skill}`, async () => {
    await using root = await temporaryRoot(`single-${skill}`);
    const providerRoot = join(root.path, "codex", "skills");
    const target = join(providerRoot, skill);
    const siblingTarget = join(providerRoot, skill === "earned-done" ? "brainstorm" : "earned-done");
    await mkdir(siblingTarget, { recursive: true });
    await writeFile(join(siblingTarget, "user-owned.txt"), "keep me\n");

    const result = await run(["install", skill, "--provider=codex"], { CODEX_SKILLS_DIR: providerRoot }, packageRoot);

    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, `INSTALLED\t[codex]\t${skill}\t${target}\n`);
    for (const file of files) {
      assert.equal(await readFile(join(target, file), "utf8"), await readFile(join(packageRoot, skill, file), "utf8"));
    }
    assert.equal(await readFile(join(siblingTarget, "user-owned.txt"), "utf8"), "keep me\n");
  });

  test(`dry-run and missing-source preflight do not write roots for ${skill}`, async () => {
    await using root = await temporaryRoot(`source-${skill}`);
    const claudeRoot = join(root.path, "claude", "skills");
    const codexRoot = join(root.path, "codex", "skills");
    const environment = { CLAUDE_SKILLS_DIR: claudeRoot, CODEX_SKILLS_DIR: codexRoot };
    const dryRun = await run(["install", skill, "--provider", "all", "--dry-run"], environment, packageRoot);

    assert.equal(dryRun.exitCode, 0);
    assert.equal(
      dryRun.stdout,
      `PLAN\t[claude]\t${skill}\t${join(claudeRoot, skill)}\nPLAN\t[codex]\t${skill}\t${join(codexRoot, skill)}\n`,
    );
    await assert.rejects(lstat(claudeRoot), { code: "ENOENT" });
    await assert.rejects(lstat(codexRoot), { code: "ENOENT" });

    const fixturePackage = join(root.path, "fixture");
    await mkdir(join(fixturePackage, "earned-done"), { recursive: true });
    const missing = await run(["install", skill, "--provider", "all"], environment, fixturePackage);
    assert.equal(missing.exitCode, 4);
    assert.equal(missing.stderr, `ERROR: invalid packaged skill: ${skill}\n`);
    await assert.rejects(lstat(claudeRoot), { code: "ENOENT" });
    await assert.rejects(lstat(codexRoot), { code: "ENOENT" });
  });

  test(`all-provider install copies ${skill}`, async () => {
    await using root = await temporaryRoot(`all-${skill}`);
    const claudeRoot = join(root.path, "claude", "skills");
    const codexRoot = join(root.path, "codex", "skills");
    const result = await run(
      ["install", skill, "--provider", "all"],
      { CLAUDE_SKILLS_DIR: claudeRoot, CODEX_SKILLS_DIR: codexRoot },
      packageRoot,
    );

    assert.equal(result.exitCode, 0);
    assert.equal(
      result.stdout,
      `INSTALLED\t[claude]\t${skill}\t${join(claudeRoot, skill)}\nINSTALLED\t[codex]\t${skill}\t${join(codexRoot, skill)}\n`,
    );
    for (const providerRoot of [claudeRoot, codexRoot]) {
      for (const file of files) {
        assert.equal(
          await readFile(join(providerRoot, skill, file), "utf8"),
          await readFile(join(packageRoot, skill, file), "utf8"),
        );
      }
    }
  });

  test(`all-provider preflight preserves the occupied ${skill} target`, async () => {
    await using root = await temporaryRoot(`preflight-${skill}`);
    const claudeRoot = join(root.path, "claude", "skills");
    const codexRoot = join(root.path, "codex", "skills");
    const target = join(codexRoot, skill);
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "foreign.txt"), "preserve\n");

    const result = await run(
      ["install", skill, "--provider", "all"],
      { CLAUDE_SKILLS_DIR: claudeRoot, CODEX_SKILLS_DIR: codexRoot },
      packageRoot,
    );

    assert.equal(result.exitCode, 1);
    assert.equal(
      result.stdout,
      `PLAN\t[claude]\t${skill}\t${join(claudeRoot, skill)}\nREFUSE\t[codex]\t${skill}\t${target}\n`,
    );
    await assert.rejects(lstat(claudeRoot), { code: "ENOENT" });
    assert.equal(await readFile(join(target, "foreign.txt"), "utf8"), "preserve\n");
  });
}

test("provider all rejects identical or nested targets before writes", async () => {
  for (const [relation, nestedProvider, dryRun] of [
    ["identical", undefined, false],
    ["codex-under-claude", "codex", true],
    ["claude-under-codex", "claude", false],
  ] as const) {
    await using root = await temporaryRoot(`overlap-${relation}`);
    let claudeRoot = join(root.path, "claude");
    let codexRoot = relation === "identical" ? claudeRoot : join(root.path, "codex");
    if (nestedProvider === "codex") codexRoot = join(claudeRoot, "earned-done", "nested");
    if (nestedProvider === "claude") claudeRoot = join(codexRoot, "earned-done", "nested");
    const argv = ["install", "earned-done", "--provider", "all"];
    if (dryRun) argv.push("--dry-run");

    const result = await run(
      argv,
      { CLAUDE_SKILLS_DIR: claudeRoot, CODEX_SKILLS_DIR: codexRoot },
      packageRoot,
    );

    assert.equal(result.exitCode, 1, relation);
    assert.match(result.stderr, /provider targets must not overlap/);
    for (const providerRoot of new Set([claudeRoot, codexRoot])) {
      await assert.rejects(lstat(providerRoot), { code: "ENOENT" });
    }
  }
});

test("target overlap checks every destination pair", () => {
  const firstRoot = join(packageRoot, "first-provider-root");
  const laterRoot = join(packageRoot, "later-provider-root");
  const nestedRoot = join(laterRoot, "earned-done", "nested");
  const destinations: readonly Destination[] = [
    { provider: "claude", root: firstRoot, target: join(firstRoot, "earned-done") },
    { provider: "codex", root: laterRoot, target: join(laterRoot, "earned-done") },
    { provider: "claude", root: nestedRoot, target: join(nestedRoot, "earned-done") },
  ];

  assert.throws(
    () => new InstallationPaths({}, packageRoot).assertNoTargetOverlap(destinations),
    /provider targets must not overlap/,
  );
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

test("the source entrypoint still runs when invoked through a symlink", async () => {
  await using root = await temporaryRoot("entry");
  const entry = join(root.path, "toomean-skills.ts");
  await symlink(join(packageRoot, "cli", "src", "main.ts"), entry, "file");

  const { stderr, stdout } = await execFileAsync(process.execPath, [entry, "--help"], { cwd: packageRoot });
  assert.equal(stderr, "");
  assert.match(stdout, /^usage:/);
});
