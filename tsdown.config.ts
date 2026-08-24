import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: false,
  entry: { "toomean-skills": "cli/src/main.ts" },
  failOnWarn: true,
  format: "esm",
  outDir: "dist",
  platform: "node",
  target: "node22",
});
