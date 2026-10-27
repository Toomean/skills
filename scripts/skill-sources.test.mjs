import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtempDisposable, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "vitest";

import { rules as core } from "../sources/earned-done/catalog.mjs";
import { rules as routing } from "../sources/earned-done/model-routing.catalog.mjs";
import { render } from "./render-skills.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);

test.each([
  ["non-string templates", null, {}, /Template must be a string/u],
  ["non-object catalogues", "{{A1 — First}}", null, /Catalogue must be an object/u],
  ["duplicate IDs, even with different labels", "{{A1 — First}}", { "A1 — First": "one", "A1 — Second": "two" }, /Duplicate catalogue ID/u],
  ["unknown references", "{{A2 — Unknown}}", { "A1 — First": "one" }, /Unknown or stale template reference/u],
  ["stale labels", "{{A1 — Old}}", { "A1 — First": "one" }, /Unknown or stale template reference/u],
  ["missing references", "# Layout", { "A1 — First": "one" }, /exactly once/u],
  ["repeated references", "{{A1 — First}}\n{{A1 — First}}", { "A1 — First": "one" }, /exactly once/u],
  ["repeated and missing references", "{{A1 — First}}\n{{A1 — First}}", { "A1 — First": "one", "B2 — Second": "two" }, /exactly once/u],
  ["empty values", "{{A1 — First}}", { "A1 — First": "  " }, /nonempty string/u],
  ["non-string values", "{{A1 — First}}", { "A1 — First": 1 }, /nonempty string/u],
  ["malformed keys", "{{bad}}", { "bad": "one" }, /Malformed catalogue key/u],
  ["malformed references", "{{bad}}", { "A1 — First": "one" }, /Malformed template reference/u],
  ["malformed tokens", "{{A1 — First", { "A1 — First": "one" }, /Malformed or unresolved/u],
])("renderer rejects %s", (_name, template, catalogue, expected) => {
  assert.throws(() => render(template, catalogue), expected);
});

test("ordinary template prose and frontmatter render unchanged", () => {
  const template = "---\nname: sample\ndescription: Ordinary metadata prose.\n---\nIntroductory prose.\n# Layout\n{{A1 — First}}";
  assert.equal(render(template, { "A1 — First": "one" }), template.replace("{{A1 — First}}", "one"));
});

test("committed generated Markdown matches both keyed sources", async () => {
  const pairs = [
    ["sources/earned-done/skill.template.md", "earned-done/SKILL.md", core],
    [
      "sources/earned-done/model-routing.template.md",
      "earned-done/references/model-routing.md",
      routing,
    ],
  ];
  for (const [templatePath, outputPath, catalogue] of pairs) {
    const [template, output] = await Promise.all([
      readFile(join(repo, templatePath), "utf8"),
      readFile(join(repo, outputPath), "utf8"),
    ]);
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

  const catalogPath = join(fixture, "sources/earned-done/catalog.mjs");
  const catalogBefore = await readFile(catalogPath, "utf8");
  const catalogAfter = catalogBefore.replace(
    "This skill is the portable, project-agnostic protocol",
    "This skill is the local, project-agnostic protocol",
  );
  assert.notEqual(catalogAfter, catalogBefore, "catalogue mutation fixture must match");
  await writeFile(catalogPath, catalogAfter);
  const beforeCatalogBuild = await Promise.all(outputPaths.map((outputPath) => readFile(outputPath, "utf8")));
  await assert.rejects(check(), /Stale generated output/u);
  for (const [index, outputPath] of outputPaths.entries()) {
    assert.equal(await readFile(outputPath, "utf8"), beforeCatalogBuild[index]);
  }
  await build();
  await check();
  assert.notEqual(await readFile(outputPaths[0], "utf8"), initial[0]);
  assert.equal(await readFile(outputPaths[1], "utf8"), initial[1]);

  const templatePath = join(fixture, "sources/earned-done/model-routing.template.md");
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
