import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import coreTemplate from "../sources/earned-done/skill.template.mjs";
import routingTemplate from "../sources/earned-done/model-routing.template.mjs";
import { render } from "./render-skills.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entries = [
  {
    source: "sources/earned-done/catalog.yml",
    render: coreTemplate,
    output: "earned-done/SKILL.md",
  },
  {
    source: "sources/earned-done/model-routing.catalog.yml",
    render: routingTemplate,
    output: "earned-done/references/model-routing.md",
  },
];

const action = process.argv[2] ?? "build";
if (!["build", "check"].includes(action) || process.argv.length > 3) {
  throw new Error("Usage: node scripts/build-skills.mjs [build|check]");
}

const outputs = await Promise.all(entries.map(async (entry) => {
  const catalogue = parse(await readFile(resolve(root, entry.source), "utf8"));
  return { ...entry, expected: render(entry.render, catalogue) };
}));

for (const { output, expected } of outputs) {
  const outputPath = resolve(root, output);
  if (action === "build") {
    await writeFile(outputPath, expected, "utf8");
    process.stdout.write(`built ${output}\n`);
    continue;
  }
  let actual;
  try {
    actual = await readFile(outputPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`Missing generated output: ${output}`);
    }
    throw error;
  }
  if (actual !== expected) throw new Error(`Stale generated output: ${output}; run pnpm build:skills`);
  process.stdout.write(`fresh ${output}\n`);
}
