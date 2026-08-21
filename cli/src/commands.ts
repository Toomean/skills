import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { ParseArgsOptionsConfig } from "node:util";

import { EXIT_CODES, INSTALL_OPTIONS, LIST_OPTIONS, PROVIDERS, SKILL_NAME, USAGE } from "./constants.ts";
import { CliError } from "./errors.ts";
import { providerRoot } from "./paths.ts";
import type { CommandHandler, InstallPlan, PackageMetadata, Provider, Skill } from "./types.ts";

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

// Node owns option syntax and validation. This adapter only translates parser failures into the
// CLI error contract shared by all commands.
function parseCommandArgs<const Options extends ParseArgsOptionsConfig>(
  argv: readonly string[],
  options: Options,
) {
  try {
    return parseArgs({ args: argv, options, strict: true, allowPositionals: true });
  } catch (error) {
    throw new CliError("usage", error instanceof Error ? error.message : String(error));
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

async function loadPackage(packageRoot: string): Promise<PackageMetadata> {
  let raw: Partial<PackageMetadata>;
  try {
    raw = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as Partial<PackageMetadata>;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError("invalid-package", `cannot read package skill metadata: ${reason}`);
  }
  if (
    typeof raw.name !== "string" ||
    typeof raw.version !== "string" ||
    !Array.isArray(raw.toomeanSkills) ||
    raw.toomeanSkills.length === 0 ||
    !raw.toomeanSkills.every(isSkill)
  ) {
    throw new CliError("invalid-package", "invalid package skill metadata");
  }
  return raw as PackageMetadata;
}

function selectedSkills(skills: readonly Skill[], selector: string): readonly Skill[] {
  if (selector === "all") return skills;
  const skill = skills.find((candidate) => candidate.name === selector);
  if (skill === undefined) throw new CliError("usage", `unknown skill: ${selector}`);
  return [skill];
}

async function requireSkill(packageRoot: string, skill: Skill): Promise<void> {
  const skillRoot = join(packageRoot, skill.name);
  let rootMetadata;
  let sourceMetadata;
  try {
    rootMetadata = await lstat(skillRoot);
    sourceMetadata = await lstat(join(skillRoot, "SKILL.md"));
  } catch {
    throw new CliError("invalid-package", `invalid packaged skill: ${skill.name}`);
  }
  if (
    rootMetadata.isSymbolicLink() ||
    !rootMetadata.isDirectory() ||
    sourceMetadata.isSymbolicLink() ||
    !sourceMetadata.isFile()
  ) {
    throw new CliError("invalid-package", `invalid packaged skill: ${skill.name}`);
  }
}

function selectedProviders(selector: string): readonly Provider[] {
  if (selector === "all") return PROVIDERS;
  if (selector !== "claude" && selector !== "codex") {
    throw new CliError("usage", `unknown provider: ${selector}`);
  }
  return [selector];
}

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

const runList: CommandHandler = async (argv, { packageRoot }) => {
  const { values, positionals } = parseCommandArgs(argv, LIST_OPTIONS);
  if (values.help === true) return { exitCode: EXIT_CODES.success, stderr: "", stdout: `${USAGE}\n` };
  if (positionals.length > 1) throw new CliError("usage", "list accepts at most one skill selector");

  const metadata = await loadPackage(packageRoot);
  const [selector = "all"] = positionals;
  const skills = selectedSkills(metadata.toomeanSkills, selector);
  const result = {
    command: "list",
    ok: true,
    package: { name: metadata.name, version: metadata.version },
    skills,
  };
  return {
    exitCode: EXIT_CODES.success,
    stderr: "",
    stdout: values.json === true ? json(result) : listText(skills),
  };
};

const runInstall: CommandHandler = async (argv, { environment, packageRoot }) => {
  const { values, positionals } = parseCommandArgs(argv, INSTALL_OPTIONS);
  if (values.help === true) return { exitCode: EXIT_CODES.success, stderr: "", stdout: `${USAGE}\n` };
  const [selector] = positionals;
  if (selector === undefined || positionals.length !== 1) {
    throw new CliError("usage", "install requires exactly one skill selector");
  }
  if (values["dry-run"] !== true) {
    throw new CliError("usage", "filesystem mutation is not implemented; install requires --dry-run");
  }
  if (typeof values.provider !== "string") throw new CliError("usage", "install requires --provider");

  const metadata = await loadPackage(packageRoot);
  const skills = selectedSkills(metadata.toomeanSkills, selector);
  // Validate every selected source before returning any destination plan.
  await Promise.all(skills.map((skill) => requireSkill(packageRoot, skill)));

  const plans: InstallPlan[] = [];
  for (const selectedProvider of selectedProviders(values.provider)) {
    const root = providerRoot(selectedProvider, environment);
    for (const skill of skills) {
      const target = join(root, skill.name);
      plans.push({
        provider: selectedProvider,
        skill: skill.name,
        state: await targetState(target),
        target,
      });
    }
  }

  const ok = plans.every((plan) => plan.state === "absent");
  const result = { command: "install", dryRun: true, ok, plans };
  return {
    exitCode: ok ? EXIT_CODES.success : EXIT_CODES.refused,
    stderr: "",
    stdout: values.json === true ? json(result) : installText(plans),
  };
};

export const COMMANDS: ReadonlyMap<string, CommandHandler> = new Map([
  ["install", runInstall],
  ["list", runList],
]);
