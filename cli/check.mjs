#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const cliRoot = realpathSync(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = realpathSync(resolve(cliRoot, ".."));

function fail(message) {
  throw new Error(message);
}

function validatedScratch(value, requireEmpty = false) {
  if (!isAbsolute(value)) fail("scratch path must be absolute");
  const canonical = realpathSync(value);
  const prefix = `${realpathSync(tmpdir())}${sep}toomean-skills-check.`;
  const metadata = lstatSync(canonical);
  if (!canonical.startsWith(prefix) || !metadata.isDirectory() || metadata.isSymbolicLink()) {
    fail(`invalid scratch path: ${canonical}`);
  }
  if (requireEmpty && readdirSync(canonical).length !== 0) fail(`scratch path must be empty: ${canonical}`);
  return canonical;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (options.capture) {
      if (result.stdout) process.stderr.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    fail(`${command} ${args.join(" ")} exited ${String(result.status)}`);
  }
  return result;
}

function inventory(root) {
  const files = [];
  function visit(directory) {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const metadata = lstatSync(path);
      if (metadata.isSymbolicLink()) fail(`symlink is forbidden in package inventory: ${path}`);
      if (metadata.isDirectory()) visit(path);
      else if (metadata.isFile()) {
        const bytes = readFileSync(path);
        files.push({
          mode: metadata.mode & 0o777,
          path: relative(root, path).split(sep).join("/"),
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      } else fail(`special file is forbidden in package inventory: ${path}`);
    }
  }
  visit(root);
  return files;
}

function expectedPackageInventory(packageRoot) {
  const catalog = JSON.parse(readFileSync(join(packageRoot, "catalog.json"), "utf8"));
  const expected = new Set([
    "LICENSE",
    "README.md",
    "bin/toomean-skills.js",
    "catalog.json",
    "catalog.sha256",
    "package.json",
  ]);
  for (const skill of catalog.skills) {
    for (const file of skill.files) expected.add(`${skill.path}/${file.path}`);
  }
  return [...expected].sort();
}

function prepare(scratch) {
  const bundleRoot = join(scratch, "bundle");
  const compiledTests = join(scratch, "compiled-tests");
  const packageRoot = join(scratch, "package");
  mkdirSync(join(scratch, "archive"));
  symlinkSync(join(cliRoot, "node_modules"), join(scratch, "node_modules"), "dir");

  run("pnpm", ["exec", "tsc", "--noEmit"], { cwd: cliRoot });
  run("pnpm", ["exec", "tsc", "--outDir", compiledTests], { cwd: cliRoot });
  run("pnpm", ["exec", "tsdown", "--config", join(cliRoot, "tsdown.config.ts"), "--out-dir", bundleRoot], {
    cwd: cliRoot,
  });
  const bundledCli = join(bundleRoot, "toomean-skills.js");
  const bundleInventory = inventory(bundleRoot);
  if (bundleInventory.length !== 1 || bundleInventory[0]?.path !== "toomean-skills.js") {
    fail("tsdown output must contain exactly one CLI bundle");
  }
  if (!readFileSync(bundledCli, "utf8").startsWith("#!/usr/bin/env node\n")) {
    fail("tsdown CLI bundle lost its Node shebang");
  }
  run(
    "node",
    [
      "--test",
      join(compiledTests, "test", "cli.test.js"),
      join(compiledTests, "test", "package.test.js"),
    ],
    {
      env: { ...process.env, SKILLS_BUNDLED_CLI: bundledCli, SKILLS_REPO_ROOT: repositoryRoot },
    },
  );
  run("node", [join(compiledTests, "src", "package.js"), repositoryRoot, bundledCli, packageRoot]);

  const actual = inventory(packageRoot);
  const expectedPaths = expectedPackageInventory(packageRoot);
  if (actual.map((item) => item.path).join("\n") !== expectedPaths.join("\n")) {
    fail("generated package inventory does not match catalog closure");
  }
  if (actual.some((item) => item.path.endsWith(".py") || item.path.endsWith(".pyc"))) {
    fail("generated package contains Python");
  }
  const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  if (Object.hasOwn(packageJson, "scripts")) fail("generated package.json contains scripts");

  const networkTokens = /(?:node:(?:dgram|dns|http|https|net|tls)|\bfetch\s*\()/;
  for (const path of [
    join(cliRoot, "src", "catalog.ts"),
    join(cliRoot, "src", "cli.ts"),
    join(packageRoot, "bin", "toomean-skills.js"),
  ]) {
    if (networkTokens.test(readFileSync(path, "utf8"))) fail(`network-capable token in CLI: ${path}`);
  }
  process.stdout.write(`PASS  TypeScript tests and generated package closure (${actual.length} files)\n`);
}

function verifyCliSmoke(scratch) {
  const listed = JSON.parse(readFileSync(join(scratch, "list-smoke.json"), "utf8"));
  if (listed.ok !== true || listed.skills?.map((skill) => skill.name).join(",") !== "earned-done") {
    fail("packaged CLI list smoke returned an unexpected catalog");
  }
  const planned = JSON.parse(readFileSync(join(scratch, "dry-run-smoke.json"), "utf8"));
  if (planned.ok !== true || planned.plans?.length !== 2 || existsSync(join(scratch, "dry-run-targets"))) {
    fail("packaged CLI dry-run smoke was incomplete or mutated a provider root");
  }
  process.stdout.write("PASS  packaged CLI entrypoint and zero-write dry-run smoke\n");
}

function verifyArchive(scratch) {
  const packageRoot = join(scratch, "package");
  const archiveRoot = join(scratch, "archive");
  const extractedRoot = join(scratch, "extracted");
  mkdirSync(extractedRoot);
  const archives = readdirSync(archiveRoot).filter((name) => name.endsWith(".tgz"));
  if (archives.length !== 1) fail(`expected one archive, found ${archives.length}`);
  run("tar", ["-xzf", join(archiveRoot, archives[0]), "-C", extractedRoot]);
  const actual = inventory(packageRoot);
  const extracted = inventory(join(extractedRoot, "package"));
  const withoutManifest = (items) => items.filter((item) => item.path !== "package.json");
  if (JSON.stringify(withoutManifest(extracted)) !== JSON.stringify(withoutManifest(actual))) {
    fail("packed archive bytes or modes differ from generated package");
  }
  const actualManifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  const packedManifest = JSON.parse(readFileSync(join(extractedRoot, "package", "package.json"), "utf8"));
  const packedManifestMode = extracted.find((item) => item.path === "package.json")?.mode;
  if (!isDeepStrictEqual(packedManifest, actualManifest) || packedManifestMode !== 0o644) {
    fail("package manager changed package.json semantics or mode");
  }
  process.stdout.write(`PASS  pnpm dry-run + produced archive (${actual.length} files)\n`);
  process.stdout.write("NOTE  npm pack remains a release gate because npm is unavailable on this host\n");
  rmSync(scratch, { recursive: true });
}

const [mode, rawScratch, ...extra] = process.argv.slice(2);
if ((mode !== "prepare" && mode !== "smoke" && mode !== "verify") || rawScratch === undefined || extra.length !== 0) {
  fail("usage: check.mjs {prepare|smoke|verify} <absolute-scratch-path>");
}
const scratch = validatedScratch(rawScratch, mode === "prepare");
try {
  if (mode === "prepare") prepare(scratch);
  else if (mode === "smoke") verifyCliSmoke(scratch);
  else verifyArchive(scratch);
} catch (error) {
  process.stderr.write(`PRESERVED failed package check: ${scratch}\n`);
  throw error;
}
