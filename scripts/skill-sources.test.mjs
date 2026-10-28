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

test("build and check controls operate on a temporary copy", async () => {
  await using temp = await mkdtempDisposable(join(tmpdir(), "toomean-keyed-source-"));
  const fixture = temp.path;
  await Promise.all([
    cp(join(repo, "scripts"), join(fixture, "scripts"), { recursive: true }),
    cp(join(repo, "sources"), join(fixture, "sources"), { recursive: true }),
    cp(join(repo, "earned-done"), join(fixture, "earned-done"), { recursive: true }),
  ]);
  const installedYaml = await realpath(dirname(dirname(fileURLToPath(import.meta.resolve("yaml")))));
  await mkdir(join(fixture, "node_modules"), { recursive: true });
  await cp(installedYaml, join(fixture, "node_modules/yaml"), { recursive: true });
  const check = () => execFileAsync("node", ["scripts/build-skills.mjs", "check"], { cwd: fixture });
  const build = () => execFileAsync("node", ["scripts/build-skills.mjs", "build"], { cwd: fixture });
  const outputPaths = [
    join(fixture, "earned-done/SKILL.md"),
    join(fixture, "earned-done/references/model-routing.md"),
  ];
  const initial = await Promise.all(outputPaths.map((outputPath) => readFile(outputPath, "utf8")));

  await check();
  for (const [index, outputPath] of outputPaths.entries()) {
    assert.equal(await readFile(outputPath, "utf8"), initial[index], "check must not write");

    await writeFile(outputPath, `${initial[index]}stale\n`);
    await assert.rejects(check(), /Stale generated output/u);
    assert.equal(await readFile(outputPath, "utf8"), `${initial[index]}stale\n`);

    await build();
    await check();
    await rm(outputPath);
    await assert.rejects(check(), /Missing generated output/u);
    await build();
    await check();
  }

  const catalogPath = join(fixture, "sources/earned-done/catalog.yml");
  const catalogBefore = await readFile(catalogPath, "utf8");
  const catalogAfter = catalogBefore.replace(
    "This skill is the portable, project-agnostic protocol",
    "This skill is the local, project-agnostic protocol",
  );
  assert.notEqual(catalogAfter, catalogBefore, "catalogue mutation fixture must match");

  const routingPath = join(fixture, "sources/earned-done/model-routing.catalog.yml");
  const routingBefore = await readFile(routingPath, "utf8");
  await writeFile(catalogPath, catalogAfter);
  await writeFile(routingPath, `${routingBefore}broken: [\n`);
  const beforeMalformedBuild = await Promise.all(outputPaths.map((outputPath) => readFile(outputPath, "utf8")));
  await assert.rejects(build());
  for (const [index, outputPath] of outputPaths.entries()) {
    assert.equal(await readFile(outputPath, "utf8"), beforeMalformedBuild[index]);
  }
  await writeFile(routingPath, routingBefore);

  const beforeCatalogBuild = await Promise.all(outputPaths.map((outputPath) => readFile(outputPath, "utf8")));
  await assert.rejects(check(), /Stale generated output/u);
  for (const [index, outputPath] of outputPaths.entries()) {
    assert.equal(await readFile(outputPath, "utf8"), beforeCatalogBuild[index]);
  }
  await build();
  await check();
  assert.notEqual(await readFile(outputPaths[0], "utf8"), initial[0]);
  assert.equal(await readFile(outputPaths[1], "utf8"), initial[1]);

  const templatePath = join(fixture, "sources/earned-done/model-routing.template.mjs");
  const templateBefore = await readFile(templatePath, "utf8");
  const templateAfter = templateBefore.replace("## Objective order", "## Objective order (layout)");
  assert.notEqual(templateAfter, templateBefore, "template mutation fixture must match");
  await writeFile(templatePath, templateAfter);
  const beforeTemplateBuild = await Promise.all(outputPaths.map((outputPath) => readFile(outputPath, "utf8")));
  await assert.rejects(check(), /Stale generated output/u);
  for (const [index, outputPath] of outputPaths.entries()) {
    assert.equal(await readFile(outputPath, "utf8"), beforeTemplateBuild[index]);
  }
  await build();
  await check();
  assert.notEqual(await readFile(outputPaths[1], "utf8"), beforeTemplateBuild[1]);
});
