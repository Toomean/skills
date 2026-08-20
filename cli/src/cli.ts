#!/usr/bin/env node

import { homedir } from "node:os";
import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  type Catalog,
  type CatalogSkill,
  IntegrityError,
  canonicalJson,
  loadCatalog,
  verifyPayload,
} from "./catalog.ts";

const PROVIDERS = ["claude", "codex"] as const;
type Provider = (typeof PROVIDERS)[number];

class CliError extends Error {
  constructor(readonly exitCode: 1 | 2 | 4, message: string) {
    super(message);
  }
}

interface CommonResult {
  readonly command: string;
  readonly ok: boolean;
}

interface ListResult extends CommonResult {
  readonly command: "list";
  readonly package: { readonly name: string; readonly version: string };
  readonly skills: readonly {
    readonly description: string;
    readonly name: string;
    readonly version: string;
  }[];
}

interface InstallPlan {
  readonly action: "install" | "refuse";
  readonly provider: Provider;
  readonly skill: string;
  readonly state: "absent" | "foreign";
  readonly target: string;
}

interface InstallResult extends CommonResult {
  readonly command: "install";
  readonly dryRun: true;
  readonly plans: readonly InstallPlan[];
}

function usage(): string {
  return [
    "usage:",
    "  toomean-skills list [<skill>|all] [--json]",
    "  toomean-skills install <skill>|all --provider claude|codex|all [--scope user] --dry-run [--json]",
  ].join("\n");
}

function parseOptions(argv: readonly string[]): { readonly flags: Map<string, string | true>; readonly positional: string[] } {
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  const valueFlags = new Set(["--provider", "--scope"]);
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]!;
    if (!item.startsWith("--")) {
      positional.push(item);
      continue;
    }
    if (flags.has(item)) throw new CliError(2, `duplicate option: ${item}`);
    if (valueFlags.has(item)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) throw new CliError(2, `missing value: ${item}`);
      flags.set(item, value);
      index += 1;
    } else if (item === "--json" || item === "--dry-run" || item === "--help") {
      flags.set(item, true);
    } else {
      throw new CliError(2, `unknown option: ${item}`);
    }
  }
  return { flags, positional };
}

function selectedSkills(catalog: Catalog, selector: string): readonly CatalogSkill[] {
  if (selector === "all") return catalog.skills;
  const skill = catalog.skills.find((candidate) => candidate.name === selector);
  if (skill === undefined) throw new CliError(2, `unknown skill: ${selector}`);
  return [skill];
}

function selectedProviders(selector: string): readonly Provider[] {
  if (selector === "all") return PROVIDERS;
  if (selector !== "claude" && selector !== "codex") {
    throw new CliError(2, `unknown provider: ${selector}`);
  }
  return [selector];
}

function pathContains(parent: string, child: string): boolean {
  const delta = relative(parent, child);
  return delta === "" || (!delta.startsWith(`..${sep}`) && delta !== ".." && !isAbsolute(delta));
}

function providerRoot(provider: Provider, environment: NodeJS.ProcessEnv): string {
  const variable = provider === "claude" ? "CLAUDE_SKILLS_DIR" : "CODEX_SKILLS_DIR";
  const fallback = provider === "claude" ? join(homedir(), ".claude", "skills") : join(homedir(), ".agents", "skills");
  const value = environment[variable] ?? fallback;
  if (!isAbsolute(value) || normalize(value) !== value || parse(value).root === value) {
    throw new CliError(2, `${variable} must be an absolute normalized non-root path`);
  }
  return value;
}

async function hasSymlinkComponent(path: string): Promise<boolean> {
  const root = parse(path).root;
  let cursor = root;
  for (const part of path.slice(root.length).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    try {
      const metadata = await lstat(cursor);
      if (metadata.isSymbolicLink()) return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
  return false;
}

async function targetState(target: string): Promise<"absent" | "foreign"> {
  if (await hasSymlinkComponent(dirname(target))) return "foreign";
  try {
    await lstat(target);
    return "foreign";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
    throw error;
  }
}

function listText(result: ListResult): string {
  return result.skills.map((skill) => `${skill.name}\t${skill.version}\t${skill.description}`).join("\n") + "\n";
}

function installText(result: InstallResult): string {
  return result.plans
    .map((plan) => `${plan.state === "absent" ? "PLAN" : "REFUSE"}\t[${plan.provider}]\t${plan.skill}\t${plan.target}`)
    .join("\n") + "\n";
}

export async function run(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
  packageRoot: string,
): Promise<{ readonly exitCode: number; readonly stderr: string; readonly stdout: string }> {
  let json = argv.includes("--json");
  try {
    const command = argv[0];
    if (command === undefined || command === "--help" || command === "-h") {
      return { exitCode: 0, stderr: "", stdout: `${usage()}\n` };
    }
    const { flags, positional } = parseOptions(argv.slice(1));
    json = flags.has("--json");
    if (flags.has("--help")) return { exitCode: 0, stderr: "", stdout: `${usage()}\n` };
    const catalog = await loadCatalog(packageRoot);

    if (command === "list") {
      for (const forbidden of ["--provider", "--scope", "--dry-run"] as const) {
        if (flags.has(forbidden)) throw new CliError(2, `${forbidden} is not valid for list`);
      }
      if (positional.length > 1) throw new CliError(2, "list accepts at most one skill selector");
      const skills = selectedSkills(catalog, positional[0] ?? "all");
      const result: ListResult = {
        command: "list",
        ok: true,
        package: { name: catalog.packageName, version: catalog.packageVersion },
        skills: skills.map(({ description, name, version }) => ({ description, name, version })),
      };
      return { exitCode: 0, stderr: "", stdout: json ? canonicalJson(result) : listText(result) };
    }

    if (command === "install") {
      if (positional.length !== 1) throw new CliError(2, "install requires exactly one skill selector");
      if (flags.get("--scope") !== undefined && flags.get("--scope") !== "user") {
        throw new CliError(2, "install supports only --scope user; project scope belongs to init");
      }
      if (!flags.has("--dry-run")) {
        throw new CliError(2, "filesystem mutation is not implemented; install requires --dry-run");
      }
      const provider = flags.get("--provider");
      if (typeof provider !== "string") throw new CliError(2, "install requires --provider");
      const skills = selectedSkills(catalog, positional[0]!);
      const providers = selectedProviders(provider);
      await verifyPayload(packageRoot, skills);
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
            action: state === "absent" ? "install" : "refuse",
            provider: selectedProvider,
            skill: skill.name,
            state,
            target,
          });
        }
      }
      const ok = plans.every((plan) => plan.state === "absent");
      const result: InstallResult = { command: "install", dryRun: true, ok, plans };
      return { exitCode: ok ? 0 : 1, stderr: "", stdout: json ? canonicalJson(result) : installText(result) };
    }

    throw new CliError(2, `unknown or unavailable command: ${command}`);
  } catch (error) {
    const exitCode = error instanceof CliError ? error.exitCode : error instanceof IntegrityError ? 4 : 4;
    const message = error instanceof Error ? error.message : String(error);
    if (json) {
      return { exitCode, stderr: "", stdout: canonicalJson({ error: message, exitCode, ok: false }) };
    }
    return { exitCode, stderr: `ERROR ${message}\n`, stdout: "" };
  }
}

async function main(): Promise<void> {
  const modulePath = fileURLToPath(import.meta.url);
  const packageRoot = resolve(dirname(modulePath), "..");
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
