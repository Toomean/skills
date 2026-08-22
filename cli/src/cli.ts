#!/usr/bin/env node

import { constants, realpathSync } from "node:fs";
import { cp, lstat, mkdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const SKILL = "earned-done";
const PROVIDERS = ["claude", "codex"] as const;
const USAGE = [
  "usage:",
  "  toomean-skills list",
  "  toomean-skills install earned-done --provider claude|codex|all [--dry-run]",
].join("\n");

type Provider = (typeof PROVIDERS)[number];

interface CliResult {
  readonly exitCode: 0 | 1 | 2 | 4;
  readonly stderr: string;
  readonly stdout: string;
}

interface Destination {
  readonly provider: Provider;
  readonly root: string;
  readonly target: string;
}

class CliFailure extends Error {
  readonly exitCode: 1 | 2 | 4;

  constructor(exitCode: 1 | 2 | 4, message: string) {
    super(message);
    this.exitCode = exitCode;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseCommandArgs(
  argv: readonly string[],
  options: Record<string, { readonly short?: string; readonly type: "boolean" | "string" }>,
) {
  try {
    return parseArgs({ args: [...argv], options, strict: true, allowPositionals: true });
  } catch (error) {
    throw new CliFailure(2, message(error));
  }
}

function selectedProviders(value: unknown): readonly Provider[] {
  if (value === "all") return PROVIDERS;
  if (value !== "claude" && value !== "codex") {
    throw new CliFailure(2, "install requires --provider claude|codex|all");
  }
  return [value];
}

function providerRoot(provider: Provider, environment: NodeJS.ProcessEnv): string {
  const variable = provider === "claude" ? "CLAUDE_SKILLS_DIR" : "CODEX_SKILLS_DIR";
  const fallback = provider === "claude" ? join(homedir(), ".claude", "skills") : join(homedir(), ".agents", "skills");
  const configured = environment[variable] ?? fallback;
  if (!isAbsolute(configured)) throw new CliFailure(2, `${variable} must be an absolute non-root path`);
  const root = normalize(configured);
  if (parse(root).root === root) throw new CliFailure(2, `${variable} must be an absolute non-root path`);
  return root;
}

function pathContains(parent: string, child: string): boolean {
  const delta = relative(parent, child);
  return delta === "" || (delta !== ".." && !delta.startsWith(`..${sep}`) && !isAbsolute(delta));
}

async function packagedSkillRoot(packageRoot: string): Promise<string> {
  const source = join(packageRoot, SKILL);
  try {
    const skillMetadata = await lstat(join(source, "SKILL.md"));
    if (!skillMetadata.isFile()) throw new Error("invalid source shape");
    return await realpath(source);
  } catch {
    throw new CliFailure(4, `invalid packaged skill: ${SKILL}`);
  }
}

async function targetExists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function formatDestinations(action: "INSTALLED" | "PLAN", destinations: readonly Destination[]): string {
  if (destinations.length === 0) return "";
  return `${destinations.map(({ provider, target }) => `${action}\t[${provider}]\t${SKILL}\t${target}`).join("\n")}\n`;
}

async function runList(argv: readonly string[]): Promise<CliResult> {
  const { positionals, values } = parseCommandArgs(argv, { help: { type: "boolean", short: "h" } });
  if (values.help === true) return { exitCode: 0, stderr: "", stdout: `${USAGE}\n` };
  if (positionals.length !== 0) throw new CliFailure(2, "list accepts no arguments");
  return { exitCode: 0, stderr: "", stdout: `${SKILL}\n` };
}

async function runInstall(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
  packageRoot: string,
): Promise<CliResult> {
  const { positionals, values } = parseCommandArgs(argv, {
    provider: { type: "string" },
    "dry-run": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  });
  if (values.help === true) return { exitCode: 0, stderr: "", stdout: `${USAGE}\n` };
  if (positionals.length !== 1 || positionals[0] !== SKILL) {
    throw new CliFailure(2, `install requires exactly: ${SKILL}`);
  }

  const destinations = selectedProviders(values.provider).map((provider) => {
    const root = providerRoot(provider, environment);
    return { provider, root, target: join(root, SKILL) };
  });
  const [firstDestination, secondDestination] = destinations;

  if (
    firstDestination !== undefined &&
    secondDestination !== undefined &&
    (pathContains(firstDestination.target, secondDestination.target) ||
      pathContains(secondDestination.target, firstDestination.target))
  ) {
    throw new CliFailure(1, "provider targets must be independent");
  }

  const source = await packagedSkillRoot(packageRoot);

  // Copying into the source tree can make a recursive copy consume its own output.
  if (destinations.some(({ target }) => pathContains(source, target))) {
    throw new CliFailure(1, "provider target overlaps the packaged skill");
  }

  const occupied = new Set<string>();
  for (const { target } of destinations) {
    if (await targetExists(target)) occupied.add(target);
  }
  if (occupied.size > 0) {
    const stdout = `${destinations
      .map(({ provider, target }) => `${occupied.has(target) ? "REFUSE" : "PLAN"}\t[${provider}]\t${SKILL}\t${target}`)
      .join("\n")}\n`;
    return { exitCode: 1, stderr: "", stdout };
  }

  if (values["dry-run"] === true) {
    return { exitCode: 0, stderr: "", stdout: formatDestinations("PLAN", destinations) };
  }

  const installed: Destination[] = [];
  for (const destination of destinations) {
    try {
      await mkdir(destination.root, { recursive: true });
      // This is a second no-clobber check after the racy preflight on the supported runtime;
      // recursive cp remains non-transactional.
      await cp(source, destination.target, {
        recursive: true,
        force: false,
        errorOnExist: true,
        mode: constants.COPYFILE_EXCL,
      });
      installed.push(destination);
    } catch (error) {
      return {
        exitCode: 4,
        stdout: formatDestinations("INSTALLED", installed),
        stderr:
          `ERROR: install failed for [${destination.provider}] ${destination.target}: ${message(error)}. ` +
          "The destination root or target may now be partial; completed installs were not removed.\n",
      };
    }
  }

  return { exitCode: 0, stderr: "", stdout: formatDestinations("INSTALLED", installed) };
}

export async function run(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
  packageRoot: string,
): Promise<CliResult> {
  try {
    const [command, ...commandArgs] = argv;
    if (command === undefined || command === "--help" || command === "-h") {
      return { exitCode: 0, stderr: "", stdout: `${USAGE}\n` };
    }
    if (command === "list") return await runList(commandArgs);
    if (command === "install") return await runInstall(commandArgs, environment, packageRoot);
    throw new CliFailure(2, `unknown command: ${command}`);
  } catch (error) {
    const exitCode = error instanceof CliFailure ? error.exitCode : 4;
    return { exitCode, stderr: `ERROR: ${message(error)}\n`, stdout: "" };
  }
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

async function main(): Promise<void> {
  const result = await run(process.argv.slice(2), process.env, resolve(dirname(canonicalModulePath), ".."));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

if (isDirectEntry(process.argv[1])) {
  main().catch((error: unknown) => {
    process.stderr.write(`ERROR: ${message(error)}\n`);
    process.exitCode = 4;
  });
}
