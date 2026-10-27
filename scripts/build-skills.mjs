import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rules as core } from "../sources/earned-done/catalog.mjs";
import { rules as routing } from "../sources/earned-done/model-routing.catalog.mjs";
import coreTemplate from "../sources/earned-done/skill.template.mjs";
import routingTemplate from "../sources/earned-done/model-routing.template.mjs";
import { render } from "./render-skills.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entries = [
  {
    catalogue: core,
    render: coreTemplate,
    output: "earned-done/SKILL.md",
  },
  {
    catalogue: routing,
    render: routingTemplate,
    output: "earned-done/references/model-routing.md",
  },
];

const action = process.argv[2] ?? "build";
if (!["build", "check"].includes(action) || process.argv.length > 3) {
  throw new Error("Usage: node scripts/build-skills.mjs [build|check]");
}

for (const entry of entries) {
  const expected = render(entry.render, entry.catalogue);
  const outputPath = resolve(root, entry.output);
  if (action === "build") {
    await writeFile(outputPath, expected, "utf8");
    process.stdout.write(`built ${entry.output}\n`);
    continue;
  }
  let actual;
  try {
    actual = await readFile(outputPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`Missing generated output: ${entry.output}`);
    }
    throw error;
  }
  if (actual !== expected) throw new Error(`Stale generated output: ${entry.output}; run pnpm build:skills`);
  process.stdout.write(`fresh ${entry.output}\n`);
}
