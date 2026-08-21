#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { COMMANDS } from "./commands.ts";
import { EXIT_CODES, USAGE } from "./constants.ts";
import { CliError, errorDetails } from "./errors.ts";
import type { CliResult } from "./types.ts";

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const canonicalModulePath = realpathSync(fileURLToPath(import.meta.url));

function isDirectEntry(entryPath: string | undefined): boolean {
  if (entryPath === undefined) return false;
  try {
    return realpathSync(entryPath) === canonicalModulePath;
  } catch {
    return false;
  }
}

// Command handlers own parsing and success output; this boundary owns global help, dispatch, and
// failure formatting.
export async function run(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
  packageRoot: string,
): Promise<CliResult> {
  const [commandName, ...commandArgs] = argv;
  const terminatorIndex = argv.indexOf("--");
  const optionArgs = terminatorIndex === -1 ? argv : argv.slice(0, terminatorIndex);
  const wantsJson = optionArgs.includes("--json");

  try {
    if (commandName === undefined || commandName === "--help" || commandName === "-h") {
      return { exitCode: EXIT_CODES.success, stderr: "", stdout: `${USAGE}\n` };
    }

    const command = COMMANDS.get(commandName);
    if (command === undefined) throw new CliError("usage", `unknown or unavailable command: ${commandName}`);
    return await command(commandArgs, { environment, packageRoot });
  } catch (error) {
    const details = errorDetails(error);
    if (wantsJson) {
      return {
        exitCode: details.exitCode,
        stderr: "",
        stdout: json({ code: details.code, error: details.message, exitCode: details.exitCode, ok: false }),
      };
    }
    return {
      exitCode: details.exitCode,
      stderr: `ERROR ${details.code}: ${details.message}\n`,
      stdout: "",
    };
  }
}

// Bind the testable command contract to the real process only at the executable boundary.
async function main(): Promise<void> {
  const packageRoot = resolve(dirname(canonicalModulePath), "..");
  const result = await run(process.argv.slice(2), process.env, packageRoot);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

if (isDirectEntry(process.argv[1])) {
  main().catch((error: unknown) => {
    const details = errorDetails(error);
    process.stderr.write(`ERROR ${details.code}: ${details.message}\n`);
    process.exitCode = details.exitCode;
  });
}
