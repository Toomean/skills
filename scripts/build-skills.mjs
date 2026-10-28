import { readFile, writeFile } from "node:fs/promises";
import { parse } from "yaml";
import coreTemplate from "../sources/earned-done/skill.template.mjs";
import routingTemplate from "../sources/earned-done/model-routing.template.mjs";
import { render } from "./render-skills.mjs";

const root = new URL("../", import.meta.url);
// Combine YAML rule text with JavaScript layout templates to build committed Markdown.
const sources = [
  {
    source: "sources/earned-done/catalog.yml",
    template: coreTemplate,
    output: "earned-done/SKILL.md",
  },
  {
    source: "sources/earned-done/model-routing.catalog.yml",
    template: routingTemplate,
    output: "earned-done/references/model-routing.md",
  },
];

const action = process.argv[2] ?? "build";
if (!["build", "check"].includes(action) || process.argv.length > 3) {
  throw new Error("Usage: node scripts/build-skills.mjs [build|check]");
}

// Prepare every parsed and rendered document before the first write, catching later invalid input
// before any output changes. This does not make the subsequent filesystem writes transactional.
const generated = await Promise.all(sources.map(async ({ source, template, output }) => {
  const catalogue = parse(await readFile(new URL(source, root), "utf8"));
  return { output, generatedContent: render(template, catalogue) };
}));

for (const { output, generatedContent } of generated) {
  const outputPath = new URL(output, root);
  if (action === "build") {
    await writeFile(outputPath, generatedContent, "utf8");
    process.stdout.write(`built ${output}\n`);
    continue;
  }
  // Check must expose stale committed docs to CI instead of silently regenerating them.
  const existingContent = await readFile(outputPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") {
      throw new Error(`Missing generated output: ${output}`);
    }
    throw error;
  });
  if (existingContent !== generatedContent) {
    throw new Error(`Stale generated output: ${output}; run pnpm build:skills`);
  }
  process.stdout.write(`fresh ${output}\n`);
}
