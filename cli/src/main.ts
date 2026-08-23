#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { run } from "./cli.ts";
import { errorMessage, EXIT_CODES } from "./cli-contracts.ts";

const canonicalModulePath = realpathSync(fileURLToPath(import.meta.url));

function isDirectEntry(entryPath: string | undefined): boolean {
  if (entryPath === undefined) return false;
  try {
    return realpathSync(entryPath) === canonicalModulePath;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const result = await run(process.argv.slice(2), process.env, resolve(dirname(canonicalModulePath), ".."));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

if (isDirectEntry(process.argv[1])) {
  main().catch((error: unknown) => {
    process.stderr.write(`ERROR: ${errorMessage(error)}\n`);
    process.exitCode = EXIT_CODES.internal;
  });
}
