import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtempDisposable, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "vitest";
import { parse } from "yaml";

import coreTemplate from "../sources/earned-done/skill.template.mjs";
import routingTemplate from "../sources/earned-done/model-routing.template.mjs";
import { render } from "./render-skills.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const core = parse(await readFile(join(repo, "sources/earned-done/catalog.yml"), "utf8"));
const routing = parse(await readFile(join(repo, "sources/earned-done/model-routing.catalog.yml"), "utf8"));
const testWithFixture = test.extend({
  fixture: async ({}, use) => {
    await using temp = await mkdtempDisposable(join(tmpdir(), "toomean-keyed-source-"));
    const fixture = temp.path;
    await Promise.all(["scripts", "sources", "earned-done"].map((path) =>
      cp(join(repo, path), join(fixture, path), { recursive: true }),
    ));
    const installedYaml = await realpath(dirname(dirname(fileURLToPath(import.meta.resolve("yaml")))));
    await mkdir(join(fixture, "node_modules"), { recursive: true });
    await cp(installedYaml, join(fixture, "node_modules/yaml"), { recursive: true });
    await use(fixture);
  },
});
const outputPaths = [
  "earned-done/SKILL.md",
  "earned-done/references/model-routing.md",
];
const eachOutput = testWithFixture.for(outputPaths.map((path) => ({ path })));
const run = (fixture, action) =>
  execFileAsync("node", ["scripts/build-skills.mjs", action], { cwd: fixture });
const readOutputs = (fixture) =>
  Promise.all(outputPaths.map((path) => readFile(join(fixture, path), "utf8")));

test.each([
  ["non-function templates", null, {}, /Template must be a function/u],
  ["non-object catalogues", () => "", null, /Catalogue must be an object/u],
  ["duplicate IDs, even with different labels", (rules) => rules["A1 — First"], { "A1 — First": "one", "A1 — Second": "two" }, /Duplicate catalogue ID/u],
  ["unknown references", (rules) => rules["A2 — Unknown"], { "A1 — First": "one" }, /Unknown or stale template reference/u],
  ["stale labels", (rules) => rules["A1 — Old"], { "A1 — First": "one" }, /Unknown or stale template reference/u],
  ["missing references", () => "# Layout", { "A1 — First": "one" }, /exactly once/u],
  ["repeated references", (rules) => `${rules["A1 — First"]}\n${rules["A1 — First"]}`, { "A1 — First": "one" }, /exactly once/u],
  ["repeated and missing references", (rules) => `${rules["A1 — First"]}\n${rules["A1 — First"]}`, { "A1 — First": "one", "B2 — Second": "two" }, /exactly once/u],
  ["empty values", (rules) => rules["A1 — First"], { "A1 — First": "  " }, /nonempty string/u],
  ["non-string values", (rules) => rules["A1 — First"], { "A1 — First": 1 }, /nonempty string/u],
  ["malformed keys", () => "", { bad: "one" }, /Malformed catalogue key/u],
  ["non-string template result", () => 1, {}, /Template must return a string/u],
])("renderer rejects %s", (_name, template, catalogue, expected) => {
  assert.throws(() => render(template, catalogue), expected);
});

test("native template literals preserve ordinary prose and interpolation bytes", () => {
  const template = (rules) => `Ordinary {{braces}}; \`inline\`; literal \${...}; escaped \\_; ${rules["A1 — First"]}`;
  assert.equal(
    render(template, { "A1 — First": "value {{ID — Meaning}}" }),
    "Ordinary {{braces}}; `inline`; literal ${...}; escaped \\_; value {{ID — Meaning}}",
  );
});

test.each([
  ["duplicate YAML keys", '"A1 — First": one\n"A1 — First": two\n', /unique|repeated|duplicate/u],
  ["malformed YAML", '"A1 — First": [unterminated\n', /Unexpected token|Flow sequence in block collection/u],
])("YAML parser rejects %s", (_name, source, expected) => {
  assert.throws(() => parse(source), expected);
});

test("parsed YAML catalogues still reject non-string rule values", () => {
  const catalogue = parse('"A1 — First": 42\n');
  assert.throws(() => render((rules) => rules["A1 — First"], catalogue), /nonempty string/u);
});

test.each([
  ["one-digit continuation", "T1 — Trace dependencies before claiming independence", "first\ncontinuation", "1. first\n   continuation"],
  ["two-digit continuation", "T10 — Diagnose hook failures and hidden stashes", "first\ncontinuation", "10. first\n    continuation"],
  ["blank lines, nested lists, code, backslashes, and backticks", "T10 — Diagnose hook failures and hidden stashes", "first\n\n- nested\n\n  ```js\n  const value = `tick` + \\_;\n  ```\n\nlast", "10. first\n\n    - nested\n\n      ```js\n      const value = `tick` + \\_;\n      ```\n\n    last"],
])("core template lays out %s", (_name, key, value, expected) => {
  const catalogue = { ...core, [key]: value };
  const rendered = coreTemplate(catalogue);
  assert.ok(rendered.includes(expected), `expected list layout:\n${expected}`);
});

test("numbered-rule YAML omits only the outer list prefix", () => {
  const t1 = core["T1 — Trace dependencies before claiming independence"].split("\n");
  const c1 = core["C1 — Empirical verification before claim"].split("\n");
  assert.equal(t1[1], "of Y, trace the entire derivation and dependency chain, including upstream state.");
  assert.equal(c1[1], "tool/library behaves a certain way without empirical verification.");
  assert.equal(t1[1].startsWith("   "), false);
  assert.equal(c1[1].startsWith("   "), false);
});

test("W1 nested continuation retains its internal indentation", () => {
  const w1 = core["W1 — Plan agreement first"].split("\n");
  const nested = w1.find((line) => line.includes("higher-level instructions appear to permit."));
  assert.equal(nested, "  higher-level instructions appear to permit.");
  assert.ok(coreTemplate(core).includes(`     ${nested.trimStart()}`));
});

test("committed generated Markdown matches both keyed sources", async () => {
  const pairs = [
    [coreTemplate, "earned-done/SKILL.md", core],
    [routingTemplate, "earned-done/references/model-routing.md", routing],
  ];
  for (const [template, outputPath, catalogue] of pairs) {
    const output = await readFile(join(repo, outputPath), "utf8");
    assert.equal(render(template, catalogue), output, outputPath);
  }
});

testWithFixture("fresh check leaves generated outputs unchanged", async ({ fixture }) => {
  const initial = await readOutputs(fixture);

  await run(fixture, "check");
  assert.deepEqual(await readOutputs(fixture), initial);
});

eachOutput("build restores stale output: $path", async ({ path }, { fixture }) => {
  const output = join(fixture, path);
  const original = await readFile(output, "utf8");
  await writeFile(output, `${original}stale\n`);

  await assert.rejects(run(fixture, "check"), /Stale generated output/u);
  assert.equal(await readFile(output, "utf8"), `${original}stale\n`);
  await run(fixture, "build");
  await run(fixture, "check");
  assert.equal(await readFile(output, "utf8"), original);
});

eachOutput("build recreates missing output: $path", async ({ path }, { fixture }) => {
  const output = join(fixture, path);
  const original = await readFile(output, "utf8");
  await rm(output);

  await assert.rejects(run(fixture, "check"), /Missing generated output/u);
  await assert.rejects(readFile(output, "utf8"), { code: "ENOENT" });
  await run(fixture, "build");
  await run(fixture, "check");
  assert.equal(await readFile(output, "utf8"), original);
});

testWithFixture("check propagates output read errors other than missing files", async ({ fixture }) => {
  const output = join(fixture, outputPaths[0]);
  await rm(output);
  await mkdir(output);

  await assert.rejects(run(fixture, "check"), (error) => /EISDIR/u.test(error.stderr));
});

testWithFixture.for([
  {
    name: "catalogue",
    file: "catalog.yml",
    before: "This skill is the portable, project-agnostic protocol",
    after: "This skill is the local, project-agnostic protocol",
    changedOutput: 0,
  },
  {
    name: "template",
    file: "model-routing.template.mjs",
    before: "## Objective order",
    after: "## Objective order (layout)",
    changedOutput: 1,
  },
])("$name changes only its generated output after build", async (mutation, { fixture }) => {
  const input = join(fixture, "sources/earned-done", mutation.file);
  const originalInput = await readFile(input, "utf8");
  const changedInput = originalInput.replace(mutation.before, mutation.after);
  assert.notEqual(changedInput, originalInput, `${mutation.name} fixture must match`);
  await writeFile(input, changedInput);

  const originalOutputs = await readOutputs(fixture);
  await assert.rejects(run(fixture, "check"), /Stale generated output/u);
  assert.deepEqual(await readOutputs(fixture), originalOutputs);

  await run(fixture, "build");
  await run(fixture, "check");
  const builtOutputs = await readOutputs(fixture);
  assert.notEqual(builtOutputs[mutation.changedOutput], originalOutputs[mutation.changedOutput]);
  assert.equal(builtOutputs[1 - mutation.changedOutput], originalOutputs[1 - mutation.changedOutput]);
});

testWithFixture("invalid second catalogue prevents every build output write", async ({ fixture }) => {
  const coreCatalogue = join(fixture, "sources/earned-done/catalog.yml");
  const coreBefore = await readFile(coreCatalogue, "utf8");
  const coreAfter = coreBefore.replace(
    "This skill is the portable, project-agnostic protocol",
    "This skill is the local, project-agnostic protocol",
  );
  assert.notEqual(coreAfter, coreBefore, "catalogue fixture must match");
  await writeFile(coreCatalogue, coreAfter);

  const routingCatalogue = join(fixture, "sources/earned-done/model-routing.catalog.yml");
  const routingBefore = await readFile(routingCatalogue, "utf8");
  await writeFile(routingCatalogue, `${routingBefore}broken: [\n`);
  const beforeBuild = await readOutputs(fixture);

  await assert.rejects(run(fixture, "build"));
  assert.deepEqual(await readOutputs(fixture), beforeBuild);
});
