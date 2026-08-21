#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { COMMANDS } from "./commands.ts";
import { EXIT_CODES, USAGE } from "./constants.ts";
import { CliError, errorDetails } from "./errors.ts";
import type { CliResult } from "./types.ts";

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

// Execute the CLI contract without writing to process streams or the filesystem. Command modules
// own their behavior; this boundary only dispatches and presents failures consistently.
export async function run(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
  packageRoot: string,
): Promise<CliResult> {
  const [commandName, ...commandArgs] = argv;
  const wantsJson = argv.includes("--json");

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
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const result = await run(process.argv.slice(2), process.env, packageRoot);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const details = errorDetails(error);
    process.stderr.write(`ERROR ${details.code}: ${details.message}\n`);
    process.exitCode = details.exitCode;
  });
}
