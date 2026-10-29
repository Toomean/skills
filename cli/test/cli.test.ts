import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
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
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "vitest";

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
    ["install", "all"],
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

test.each(skillInstallCases)("single-provider install copies $skill", async ({ skill, files }) => {
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

test.each(skillInstallCases)("dry-run and missing-source preflight do not write roots for $skill", async ({ skill }) => {
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

test.each(skillInstallCases)("all-provider install copies $skill", async ({ skill, files }) => {
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

test.each([
  { provider: "codex", selected: ["codex"] },
  { provider: "all", selected: ["claude", "codex"] },
] as const)("install all copies every skill in catalog order to $provider", async ({ provider, selected }) => {
  await using root = await temporaryRoot(`install-all-${provider}`);
  const claudeRoot = join(root.path, "claude", "skills");
  const codexRoot = join(root.path, "codex", "skills");
  const environment = { CLAUDE_SKILLS_DIR: claudeRoot, CODEX_SKILLS_DIR: codexRoot };
  const result = await run(["install", "all", "--provider", provider], environment, packageRoot);

  assert.equal(result.exitCode, 0);
  assert.equal(
    result.stdout,
    skillInstallCases.flatMap(({ skill }) => selected.map((selectedProvider) => {
      const target = join(selectedProvider === "claude" ? claudeRoot : codexRoot, skill);
      return `INSTALLED\t[${selectedProvider}]\t${skill}\t${target}`;
    })).join("\n") + "\n",
  );
  for (const { skill, files } of skillInstallCases) {
    for (const selectedProvider of selected) {
      const target = join(selectedProvider === "claude" ? claudeRoot : codexRoot, skill);
      for (const file of files) {
        assert.equal(await readFile(join(target, file), "utf8"), await readFile(join(packageRoot, skill, file), "utf8"));
      }
    }
  }
});

test("install all dry-run plans every skill without creating roots", async () => {
  await using root = await temporaryRoot("install-all-dry-run");
  const claudeRoot = join(root.path, "claude", "skills");
  const codexRoot = join(root.path, "codex", "skills");
  const result = await run(
    ["install", "all", "--provider", "all", "--dry-run"],
    { CLAUDE_SKILLS_DIR: claudeRoot, CODEX_SKILLS_DIR: codexRoot },
    packageRoot,
  );

  assert.equal(result.exitCode, 0);
  assert.equal(
    result.stdout,
    skillInstallCases.flatMap(({ skill }) => [
      `PLAN\t[claude]\t${skill}\t${join(claudeRoot, skill)}`,
      `PLAN\t[codex]\t${skill}\t${join(codexRoot, skill)}`,
    ]).join("\n") + "\n",
  );
  await assert.rejects(lstat(claudeRoot), { code: "ENOENT" });
  await assert.rejects(lstat(codexRoot), { code: "ENOENT" });
});

test.each(["file", "directory", "broken-symlink"] as const)(
  "install all refuses the whole batch when a late target is a $kind",
  async (kind) => {
    await using root = await temporaryRoot(`install-all-occupied-${kind}`);
    const claudeRoot = join(root.path, "claude", "skills");
    const codexRoot = join(root.path, "codex", "skills");
    const target = join(codexRoot, "mental-map");
    await mkdir(codexRoot, { recursive: true });
    if (kind === "file") await writeFile(target, "foreign file\n");
    if (kind === "directory") {
      await mkdir(target);
      await writeFile(join(target, "foreign.txt"), "foreign directory\n");
    }
    if (kind === "broken-symlink") await symlink(join(root.path, "missing"), target, "file");

    const result = await run(
      ["install", "all", "--provider", "all"],
      { CLAUDE_SKILLS_DIR: claudeRoot, CODEX_SKILLS_DIR: codexRoot },
      packageRoot,
    );

    assert.equal(result.exitCode, 1);
    assert.equal(
      result.stdout,
      skillInstallCases.flatMap(({ skill }) => [
        `PLAN\t[claude]\t${skill}\t${join(claudeRoot, skill)}`,
        `${skill === "mental-map" ? "REFUSE" : "PLAN"}\t[codex]\t${skill}\t${join(codexRoot, skill)}`,
      ]).join("\n") + "\n",
    );
    await assert.rejects(lstat(claudeRoot), { code: "ENOENT" });
    await assert.rejects(lstat(join(codexRoot, "earned-done")), { code: "ENOENT" });
    if (kind === "file") assert.equal(await readFile(target, "utf8"), "foreign file\n");
    if (kind === "directory") assert.equal(await readFile(join(target, "foreign.txt"), "utf8"), "foreign directory\n");
    if (kind === "broken-symlink") assert.equal(await readlink(target), join(root.path, "missing"));
  },
);

test("install all validates every packaged source before creating roots", async () => {
  await using root = await temporaryRoot("install-all-invalid-source");
  const fixturePackage = join(root.path, "fixture");
  const claudeRoot = join(root.path, "claude", "skills");
  const codexRoot = join(root.path, "codex", "skills");
  for (const skill of ["earned-done", "brainstorm"]) {
    const skillRoot = join(fixturePackage, skill);
    await mkdir(skillRoot, { recursive: true });
    await writeFile(join(skillRoot, "SKILL.md"), "fixture\n");
  }

  const result = await run(
    ["install", "all", "--provider", "all"],
    { CLAUDE_SKILLS_DIR: claudeRoot, CODEX_SKILLS_DIR: codexRoot },
    fixturePackage,
  );

  assert.equal(result.exitCode, 4);
  assert.equal(result.stderr, "ERROR: invalid packaged skill: mental-map\n");
  await assert.rejects(lstat(claudeRoot), { code: "ENOENT" });
  await assert.rejects(lstat(codexRoot), { code: "ENOENT" });
});

test("install all rejects cross-skill destination overlap and source containment", async () => {
  await using overlapRoot = await temporaryRoot("install-all-overlap");
  const claudeRoot = join(overlapRoot.path, "shared");
  const codexRoot = join(claudeRoot, "earned-done");
  const overlap = await run(
    ["install", "all", "--provider", "all", "--dry-run"],
    { CLAUDE_SKILLS_DIR: claudeRoot, CODEX_SKILLS_DIR: codexRoot },
    packageRoot,
  );
  assert.equal(overlap.exitCode, 1);
  assert.match(overlap.stderr, /provider targets must not overlap/);
  await assert.rejects(lstat(claudeRoot), { code: "ENOENT" });

  await using containmentRoot = await temporaryRoot("install-all-containment");
  const fixturePackage = join(containmentRoot.path, "fixture");
  for (const { skill } of skillInstallCases) {
    const skillRoot = join(fixturePackage, skill);
    await mkdir(skillRoot, { recursive: true });
    await writeFile(join(skillRoot, "SKILL.md"), "fixture\n");
  }
  const nestedOutputRoot = join(fixturePackage, "brainstorm", "nested");
  const contained = await run(
    ["install", "all", "--provider", "codex", "--dry-run"],
    {
      CLAUDE_SKILLS_DIR: join(containmentRoot.path, "claude", "skills"),
      CODEX_SKILLS_DIR: nestedOutputRoot,
    },
    fixturePackage,
  );
  assert.equal(contained.exitCode, 1);
  assert.match(contained.stderr, /provider target must be outside the packaged skill source/);
  await assert.rejects(lstat(join(containmentRoot.path, "claude")), { code: "ENOENT" });
  await assert.rejects(lstat(nestedOutputRoot), { code: "ENOENT" });
});

test("install all refuses a special source entry before copying any selected skill", async () => {
  await using root = await temporaryRoot("install-all-partial");
  const fixturePackage = join(root.path, "fixture");
  const claudeRoot = join(root.path, "claude", "skills");
  const codexRoot = join(root.path, "codex", "skills");
  for (const { skill } of skillInstallCases) {
    const skillRoot = join(fixturePackage, skill);
    await mkdir(skillRoot, { recursive: true });
    await writeFile(join(skillRoot, "SKILL.md"), "fixture\n");
  }
  const socketPath = join(fixturePackage, "mental-map", "un-copyable-socket");
  const socketServer = createServer();
  socketServer.listen(socketPath);
  await new Promise<void>((resolveListening, reject) => {
    socketServer.once("listening", resolveListening);
    socketServer.once("error", reject);
  });

  let result;
  try {
    result = await run(
      ["install", "all", "--provider", "all"],
      { CLAUDE_SKILLS_DIR: claudeRoot, CODEX_SKILLS_DIR: codexRoot },
      fixturePackage,
    );
  } finally {
    await new Promise<void>((resolveClosing, reject) => socketServer.close((error) => error ? reject(error) : resolveClosing()));
  }

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /link or special entry: un-copyable-socket/);
  assert.equal(result.stdout, "");
  await assert.rejects(lstat(claudeRoot), { code: "ENOENT" });
  await assert.rejects(lstat(codexRoot), { code: "ENOENT" });
});

test.each(skillInstallCases)("all-provider preflight preserves the occupied $skill target", async ({ skill }) => {
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
