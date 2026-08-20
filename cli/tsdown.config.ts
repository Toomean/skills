import { defineConfig } from "tsdown";

export default defineConfig({
  clean: false,
  dts: false,
  entry: { "toomean-skills": "src/cli.ts" },
  failOnWarn: true,
  fixedExtension: false,
  format: "esm",
  hash: false,
  minify: false,
  platform: "node",
  report: false,
  sourcemap: false,
  target: "node24",
});
