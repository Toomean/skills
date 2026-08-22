#!/usr/bin/env node

import { constants, realpathSync } from "node:fs";
import { cp, lstat, mkdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const SKILL = "earned-done";
const EXIT_CODES = {
  success: 0,
  refused: 1,
  usage: 2,
  internal: 4,
} as const;
const PROVIDER_CONFIG = {
  claude: {
    environmentVariable: "CLAUDE_SKILLS_DIR",
    defaultRoot: [".claude", "skills"],
  },
  codex: {
    environmentVariable: "CODEX_SKILLS_DIR",
    defaultRoot: [".agents", "skills"],
  },
} as const;
const USAGE = [
  "usage:",
  "  toomean-skills list",
  "  toomean-skills install earned-done --provider claude|codex|all [--dry-run]",
].join("\n");

type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];
type FailureExitCode = Exclude<ExitCode, typeof EXIT_CODES.success>;
type Provider = keyof typeof PROVIDER_CONFIG;

const PROVIDERS: readonly Provider[] = Object.keys(PROVIDER_CONFIG) as Provider[];

interface CliResult {
  readonly exitCode: ExitCode;
  readonly stderr: string;
  readonly stdout: string;
}

interface Destination {
  readonly provider: Provider;
  readonly root: string;
  readonly target: string;
}

class CliFailure extends Error {
  readonly exitCode: FailureExitCode;

  constructor(exitCode: FailureExitCode, message: string) {
    super(message);
    this.exitCode = exitCode;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class InstallationPaths {
  private readonly environment: NodeJS.ProcessEnv;
  private readonly packageRoot: string;

  constructor(environment: NodeJS.ProcessEnv, packageRoot: string) {
    this.environment = environment;
    this.packageRoot = packageRoot;
  }

  destinations(providers: readonly Provider[]): readonly Destination[] {
    return providers.map((provider) => {
      const root = this.providerRoot(provider);
      return { provider, root, target: join(root, SKILL) };
    });
  }

  assertIndependent(destinations: readonly Destination[]): void {
    const [first, second] = destinations;
    if (
      first !== undefined &&
      second !== undefined &&
      (this.isSameOrDescendant(first.target, second.target) ||
        this.isSameOrDescendant(second.target, first.target))
    ) {
      throw new CliFailure(EXIT_CODES.refused, "provider targets must be independent");
    }
  }

  async packagedSkillRoot(): Promise<string> {
    const source = join(this.packageRoot, SKILL);
    try {
      const skillMetadata = await lstat(join(source, "SKILL.md"));
      if (!skillMetadata.isFile()) throw new Error("invalid source shape");
      return await realpath(source);
    } catch {
      throw new CliFailure(EXIT_CODES.internal, `invalid packaged skill: ${SKILL}`);
    }
  }

  assertOutsideSource(source: string, destinations: readonly Destination[]): void {
    // Copying into the source tree can make a recursive copy consume its own output.
    if (destinations.some(({ target }) => this.isSameOrDescendant(source, target))) {
      throw new CliFailure(EXIT_CODES.refused, "provider target overlaps the packaged skill");
    }
  }

  async isOccupied(target: string): Promise<boolean> {
    try {
      await lstat(target);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  private providerRoot(provider: Provider): string {
    const { defaultRoot, environmentVariable } = PROVIDER_CONFIG[provider];
    const configured = this.environment[environmentVariable] ?? join(homedir(), ...defaultRoot);
    if (!isAbsolute(configured)) {
      throw new CliFailure(EXIT_CODES.usage, `${environmentVariable} must be an absolute non-root path`);
    }
    const root = normalize(configured);
    if (parse(root).root === root) {
      throw new CliFailure(EXIT_CODES.usage, `${environmentVariable} must be an absolute non-root path`);
    }
    return root;
  }

  private isSameOrDescendant(parent: string, child: string): boolean {
    const delta = relative(parent, child);
    return delta === "" || (delta !== ".." && !delta.startsWith(`..${sep}`) && !isAbsolute(delta));
  }
}

class Cli {
  private readonly paths: InstallationPaths;

  constructor(environment: NodeJS.ProcessEnv, packageRoot: string) {
    this.paths = new InstallationPaths(environment, packageRoot);
  }

  async run(argv: readonly string[]): Promise<CliResult> {
    try {
      const [command, ...commandArgs] = argv;
      if (command === undefined || command === "--help" || command === "-h") return this.usage();
      if (command === "list") return await this.runList(commandArgs);
      if (command === "install") return await this.runInstall(commandArgs);
      throw new CliFailure(EXIT_CODES.usage, `unknown command: ${command}`);
    } catch (error) {
      const exitCode = error instanceof CliFailure ? error.exitCode : EXIT_CODES.internal;
      return { exitCode, stderr: `ERROR: ${errorMessage(error)}\n`, stdout: "" };
    }
  }

  private parseCliArgs(
    argv: readonly string[],
    options: Record<string, { readonly short?: string; readonly type: "boolean" | "string" }>,
  ) {
    try {
      return parseArgs({ args: [...argv], options, strict: true, allowPositionals: true });
    } catch (error) {
      throw new CliFailure(EXIT_CODES.usage, errorMessage(error));
    }
  }

  private async runList(argv: readonly string[]): Promise<CliResult> {
    const { positionals, values } = this.parseCliArgs(argv, { help: { type: "boolean", short: "h" } });
    if (values.help === true) return this.usage();
    if (positionals.length !== 0) throw new CliFailure(EXIT_CODES.usage, "list accepts no arguments");
    return { exitCode: EXIT_CODES.success, stderr: "", stdout: `${SKILL}\n` };
  }

  private async runInstall(argv: readonly string[]): Promise<CliResult> {
    const { positionals, values } = this.parseCliArgs(argv, {
      provider: { type: "string" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    });
    if (values.help === true) return this.usage();
    if (positionals.length !== 1 || positionals[0] !== SKILL) {
      throw new CliFailure(EXIT_CODES.usage, `install requires exactly: ${SKILL}`);
    }

    const destinations = this.paths.destinations(this.selectedProviders(values.provider));
    this.paths.assertIndependent(destinations);
    const source = await this.paths.packagedSkillRoot();
    this.paths.assertOutsideSource(source, destinations);

    const occupied = new Set<string>();
    for (const { target } of destinations) {
      if (await this.paths.isOccupied(target)) occupied.add(target);
    }
    if (occupied.size > 0) {
      const stdout = `${destinations
        .map(({ provider, target }) => `${occupied.has(target) ? "REFUSE" : "PLAN"}\t[${provider}]\t${SKILL}\t${target}`)
        .join("\n")}\n`;
      return { exitCode: EXIT_CODES.refused, stderr: "", stdout };
    }

    if (values["dry-run"] === true) {
      return { exitCode: EXIT_CODES.success, stderr: "", stdout: this.formatDestinations("PLAN", destinations) };
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
          exitCode: EXIT_CODES.internal,
          stdout: this.formatDestinations("INSTALLED", installed),
          stderr:
            `ERROR: install failed for [${destination.provider}] ${destination.target}: ${errorMessage(error)}. ` +
            "The destination root or target may now be partial; completed installs were not removed.\n",
        };
      }
    }

    return {
      exitCode: EXIT_CODES.success,
      stderr: "",
      stdout: this.formatDestinations("INSTALLED", installed),
    };
  }

  private usage(): CliResult {
    return { exitCode: EXIT_CODES.success, stderr: "", stdout: `${USAGE}\n` };
  }

  private formatDestinations(action: "INSTALLED" | "PLAN", destinations: readonly Destination[]): string {
    if (destinations.length === 0) return "";
    return `${destinations.map(({ provider, target }) => `${action}\t[${provider}]\t${SKILL}\t${target}`).join("\n")}\n`;
  }

  private selectedProviders(value: unknown): readonly Provider[] {
    if (value === "all") return PROVIDERS;
    const provider = PROVIDERS.find((candidate) => candidate === value);
    if (provider === undefined) {
      throw new CliFailure(EXIT_CODES.usage, "install requires --provider claude|codex|all");
    }
    return [provider];
  }
}

export function run(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
  packageRoot: string,
): Promise<CliResult> {
  return new Cli(environment, packageRoot).run(argv);
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
    process.stderr.write(`ERROR: ${errorMessage(error)}\n`);
    process.exitCode = EXIT_CODES.internal;
  });
}
