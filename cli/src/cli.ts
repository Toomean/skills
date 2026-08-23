import { constants } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";

import { CliFailure, type CliResult, errorMessage, EXIT_CODES, SKILL } from "./contracts.ts";
import {
  type Destination,
  InstallationPaths,
  type Provider,
  PROVIDERS,
} from "./installation-paths.ts";

const USAGE = [
  "usage:",
  "  toomean-skills list",
  "  toomean-skills install earned-done --provider claude|codex|all [--dry-run]",
].join("\n");

/**
 * Executes catalog and installation commands while returning output instead of writing to process streams.
 * Install commands may write to provider skill roots; callers retain control of presentation and process exit.
 */
class Cli {
  private readonly paths: InstallationPaths;

  constructor(environment: NodeJS.ProcessEnv, packageRoot: string) {
    this.paths = new InstallationPaths(environment, packageRoot);
  }

  /** Dispatches one invocation and converts expected and unexpected failures into a CliResult. */
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

  /** Parses a subcommand's arguments and exposes parser failures as CLI usage errors. */
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

  /** Returns the packaged skill catalog after rejecting unsupported list arguments. */
  private async runList(argv: readonly string[]): Promise<CliResult> {
    const { positionals, values } = this.parseCliArgs(argv, { help: { type: "boolean", short: "h" } });
    if (values.help === true) return this.usage();
    if (positionals.length !== 0) throw new CliFailure(EXIT_CODES.usage, "list accepts no arguments");
    return { exitCode: EXIT_CODES.success, stderr: "", stdout: `${SKILL}\n` };
  }

  /**
   * Plans or copies the packaged skill into the selected provider roots without replacing targets.
   * Multi-provider copies are sequential and preserve completed destinations if a later copy fails.
   */
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
    this.paths.assertNoTargetOverlap(destinations);
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

  /** Returns the command synopsis as a successful CLI result. */
  private usage(): CliResult {
    return { exitCode: EXIT_CODES.success, stderr: "", stdout: `${USAGE}\n` };
  }

  /** Formats destination outcomes as stable, line-oriented CLI records. */
  private formatDestinations(action: "INSTALLED" | "PLAN", destinations: readonly Destination[]): string {
    if (destinations.length === 0) return "";
    return `${destinations.map(({ provider, target }) => `${action}\t[${provider}]\t${SKILL}\t${target}`).join("\n")}\n`;
  }

  /** Validates one provider name or expands the explicit all-provider selection. */
  private selectedProviders(value: unknown): readonly Provider[] {
    if (value === "all") return PROVIDERS;
    const provider = PROVIDERS.find((candidate) => candidate === value);
    if (provider === undefined) {
      throw new CliFailure(EXIT_CODES.usage, "install requires --provider claude|codex|all");
    }
    return [provider];
  }
}

/** Runs one CLI invocation against an explicit environment and package root. */
export function run(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
  packageRoot: string,
): Promise<CliResult> {
  return new Cli(environment, packageRoot).run(argv);
}
