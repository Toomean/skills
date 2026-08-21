#!/usr/bin/env node

import { lstat, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

// This CLI exposes the packaged skill catalog and produces installation previews while leaving
// provider directories unchanged.
const PROVIDERS = ["claude", "codex"] as const;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OPTIONS = {
  provider: { type: "string" },
  json: { type: "boolean" },
  "dry-run": { type: "boolean" },
  help: { type: "boolean", short: "h" },
} as const;
type Provider = (typeof PROVIDERS)[number];

interface Skill {
  readonly description: string;
  readonly name: string;
  readonly version: string;
}

interface PackageMetadata {
  readonly name: string;
  readonly toomeanSkills: readonly Skill[];
  readonly version: string;
}

interface InstallPlan {
  readonly provider: Provider;
  readonly skill: string;
  readonly state: "absent" | "foreign";
  readonly target: string;
}

class CliError extends Error {
  readonly exitCode: 1 | 2 | 4;

  constructor(exitCode: 1 | 2 | 4, message: string) {
    super(message);
    this.exitCode = exitCode;
  }
}

function usage(): string {
  return [
    "usage:",
    "  toomean-skills list [<skill>|all] [--json]",
    "  toomean-skills install <skill>|all --provider claude|codex|all --dry-run [--json]",
  ].join("\n");
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

// Node owns tokenization and option syntax; this adapter only maps native parser failures into the
// CLI's usage-error contract.
function parseCliArgs(argv: readonly string[]) {
  try {
    return parseArgs({
      args: [...argv],
      options: OPTIONS,
      strict: true,
      allowPositionals: true,
    });
  } catch (error) {
    throw new CliError(2, error instanceof Error ? error.message : String(error));
  }
}

function isSkill(value: unknown): value is Skill {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<Skill>;
  return (
    typeof candidate.name === "string" &&
    SKILL_NAME.test(candidate.name) &&
    [candidate.version, candidate.description].every((field) => typeof field === "string" && field.length > 0)
  );
}

// The root package metadata is the public skill catalog. Reject malformed declarations before
// either listing them or using their names to resolve filesystem paths.
async function loadPackage(packageRoot: string): Promise<PackageMetadata> {
  const raw = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as Partial<PackageMetadata>;
  if (
    typeof raw.name !== "string" ||
    typeof raw.version !== "string" ||
    !Array.isArray(raw.toomeanSkills) ||
    raw.toomeanSkills.length === 0 ||
    !raw.toomeanSkills.every(isSkill)
  ) {
    throw new CliError(4, "invalid package skill metadata");
  }
  return raw as PackageMetadata;
}

function selectedSkills(skills: readonly Skill[], selector: string): readonly Skill[] {
  if (selector === "all") return skills;
  const skill = skills.find((candidate) => candidate.name === selector);
  if (skill === undefined) throw new CliError(2, `unknown skill: ${selector}`);
  return [skill];
}

function selectedProviders(selector: string): readonly Provider[] {
  if (selector === "all") return PROVIDERS;
  if (selector !== "claude" && selector !== "codex") throw new CliError(2, `unknown provider: ${selector}`);
  return [selector];
}

async function requireSkill(packageRoot: string, skill: Skill): Promise<void> {
  const skillRoot = join(packageRoot, skill.name);
  const rootMetadata = await lstat(skillRoot);
  const sourceMetadata = await lstat(join(skillRoot, "SKILL.md"));
  if (
    rootMetadata.isSymbolicLink() ||
    !rootMetadata.isDirectory() ||
    sourceMetadata.isSymbolicLink() ||
    !sourceMetadata.isFile()
  ) {
    throw new CliError(4, `invalid packaged skill: ${skill.name}`);
  }
}

// Provider roots bound where installation targets may be planned. Overrides remain limited to
// normalized, absolute, non-root paths so a dry-run cannot describe an unsafe target.
function providerRoot(provider: Provider, environment: NodeJS.ProcessEnv): string {
  const variable = provider === "claude" ? "CLAUDE_SKILLS_DIR" : "CODEX_SKILLS_DIR";
  const fallback = provider === "claude" ? join(homedir(), ".claude", "skills") : join(homedir(), ".agents", "skills");
  const value = environment[variable] ?? fallback;
  if (!isAbsolute(value) || normalize(value) !== value || parse(value).root === value) {
    throw new CliError(2, `${variable} must be an absolute normalized non-root path`);
  }
  return value;
}

function pathContains(parent: string, child: string): boolean {
  const delta = relative(parent, child);
  return delta === "" || (!delta.startsWith(`..${sep}`) && delta !== ".." && !isAbsolute(delta));
}

// Without install receipts, every existing target is foreign. The preview never infers ownership
// from a path or from where a symlink happens to point.
async function targetState(target: string): Promise<"absent" | "foreign"> {
  try {
    await lstat(target);
    return "foreign";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
    throw error;
  }
}

function listText(skills: readonly Skill[]): string {
  return `${skills.map((skill) => `${skill.name}\t${skill.version}\t${skill.description}`).join("\n")}\n`;
}

function installText(plans: readonly InstallPlan[]): string {
  return `${plans
    .map((plan) => `${plan.state === "absent" ? "PLAN" : "REFUSE"}\t[${plan.provider}]\t${plan.skill}\t${plan.target}`)
    .join("\n")}\n`;
}

// Execute the CLI contract without writing to process streams or the filesystem. Returning a
// complete result keeps command behavior testable and makes the current zero-write boundary clear.
export async function run(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
  packageRoot: string,
): Promise<{ readonly exitCode: number; readonly stderr: string; readonly stdout: string }> {
  let wantsJson = argv.includes("--json");
  try {
    const command = argv[0];
    if (command === undefined || command === "--help" || command === "-h") {
      return { exitCode: 0, stderr: "", stdout: `${usage()}\n` };
    }
    const { values, positionals } = parseCliArgs(argv.slice(1));
    wantsJson = values.json === true;
    if (values.help === true) return { exitCode: 0, stderr: "", stdout: `${usage()}\n` };
    const metadata = await loadPackage(packageRoot);

    if (command === "list") {
      if (values.provider !== undefined || values["dry-run"] === true) {
        throw new CliError(2, "list accepts only --json");
      }
      if (positionals.length > 1) throw new CliError(2, "list accepts at most one skill selector");
      const skills = selectedSkills(metadata.toomeanSkills, positionals[0] ?? "all");
      const result = {
        command: "list",
        ok: true,
        package: { name: metadata.name, version: metadata.version },
        skills,
      };
      return { exitCode: 0, stderr: "", stdout: wantsJson ? json(result) : listText(skills) };
    }

    if (command === "install") {
      if (positionals.length !== 1) throw new CliError(2, "install requires exactly one skill selector");
      if (values["dry-run"] !== true) {
        throw new CliError(2, "filesystem mutation is not implemented; install requires --dry-run");
      }
      const provider = values.provider;
      if (typeof provider !== "string") throw new CliError(2, "install requires --provider");
      const skills = selectedSkills(metadata.toomeanSkills, positionals[0]!);
      // Validate the complete source selection before producing any destination plan. A missing or
      // malformed packaged skill invalidates the whole request rather than yielding a partial plan.
      await Promise.all(skills.map((skill) => requireSkill(packageRoot, skill)));
      const providers = selectedProviders(provider);
      const canonicalPackageRoot = await realpath(packageRoot);
      const plans: InstallPlan[] = [];
      for (const selectedProvider of providers) {
        const root = providerRoot(selectedProvider, environment);
        if (pathContains(root, canonicalPackageRoot) || pathContains(canonicalPackageRoot, root)) {
          throw new CliError(1, `provider root overlaps package root: ${root}`);
        }
        for (const skill of skills) {
          const target = join(root, skill.name);
          const state = await targetState(target);
          plans.push({
            provider: selectedProvider,
            skill: skill.name,
            state,
            target,
          });
        }
      }
      const ok = plans.every((plan) => plan.state === "absent");
      const result = { command: "install", dryRun: true, ok, plans };
      return { exitCode: ok ? 0 : 1, stderr: "", stdout: wantsJson ? json(result) : installText(plans) };
    }

    throw new CliError(2, `unknown or unavailable command: ${command}`);
  } catch (error) {
    const exitCode = error instanceof CliError ? error.exitCode : 4;
    const message = error instanceof Error ? error.message : String(error);
    if (wantsJson) return { exitCode, stderr: "", stdout: json({ error: message, exitCode, ok: false }) };
    return { exitCode, stderr: `ERROR ${message}\n`, stdout: "" };
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
    process.stderr.write(`ERROR ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 4;
  });
}
