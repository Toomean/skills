import type { PROVIDERS } from "./constants.ts";

export type Provider = (typeof PROVIDERS)[number];

export interface Skill {
  readonly description: string;
  readonly name: string;
  readonly version: string;
}

export interface PackageMetadata {
  readonly name: string;
  readonly toomeanSkills: readonly Skill[];
  readonly version: string;
}

export interface InstallPlan {
  readonly provider: Provider;
  readonly skill: string;
  readonly state: "absent" | "foreign";
  readonly target: string;
}

export interface CliResult {
  readonly exitCode: 0 | 1 | 2 | 4;
  readonly stderr: string;
  readonly stdout: string;
}

export interface CommandContext {
  readonly environment: NodeJS.ProcessEnv;
  readonly packageRoot: string;
}

export type CommandHandler = (argv: readonly string[], context: CommandContext) => Promise<CliResult>;
