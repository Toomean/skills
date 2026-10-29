import { randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { cp, lstat, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";

import { CliFailure, type CliResult, errorMessage, EXIT_CODES, SKILLS, type Skill } from "./contracts.ts";
import {
  type Destination,
  InstallationPaths,
  type Provider,
  PROVIDERS,
} from "./installation-paths.ts";
import { assertSeparate, delta, inventory, overlaps, packageIdentity, parseReceipt, statePaths, treeDigest, type Entry, type Receipt, type StatePaths } from "./update-state.ts";

const USAGE = [
  "usage:",
  "  toomean-skills list",
  `  toomean-skills install ${[...SKILLS, "all"].join("|")} --provider claude|codex|all [--dry-run]`,
  `  toomean-skills update ${SKILLS.join("|")} --provider claude|codex [--dry-run | --replace]`,
].join("\n");

interface InstallPlan extends Destination {
  readonly skill: Skill;
  readonly source: string;
  readonly state: StatePaths;
  readonly entries: readonly Entry[];
}

export type ConfirmReplacement = (prompt: string) => Promise<boolean>;

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

// Windows stat modes do not establish ACL ownership; only the entry type is checked there.
const unsafePosixOwnerOrMode = (stat: Stats) =>
  process.platform !== "win32" && ((process.getuid && stat.uid !== process.getuid()) || Boolean(stat.mode & 0o022));

function assertOwnedDirectory(path: string, stat: Stats): void {
  if (!stat.isDirectory() || unsafePosixOwnerOrMode(stat)) {
    throw new CliFailure(EXIT_CODES.refused, `unsafe state directory: ${path}`);
  }
}

/** Refuses links or unsafe pre-existing state rather than following them. */
async function checkState(paths: StatePaths): Promise<void> {
  if (await exists(paths.state)) {
    assertOwnedDirectory(paths.state, await lstat(paths.state));
  }
  if (await exists(paths.lock)) throw new CliFailure(EXIT_CODES.refused, `recovery lock exists: ${paths.lock}`);
  for (const path of [paths.receipt]) {
    if (await exists(path)) {
      const stat = await lstat(path);
      if (!stat.isFile() || unsafePosixOwnerOrMode(stat)) {
        throw new CliFailure(EXIT_CODES.refused, `unsafe state entry: ${path}`);
      }
    }
  }
}

async function receiptText(paths: StatePaths): Promise<string | undefined> {
  if (!(await exists(paths.receipt))) return undefined;
  try { return await readFile(paths.receipt, "utf8"); }
  catch { throw new CliFailure(EXIT_CODES.refused, `unreadable receipt: ${paths.receipt}`); }
}

class OwnedLockFailure extends Error {}

async function acquireLock(paths: StatePaths, details: object): Promise<void> {
  await mkdir(paths.state, { recursive: true, mode: 0o700 });
  await checkState(paths);
  let handle;
  try { handle = await open(paths.lock, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new CliFailure(EXIT_CODES.refused, `recovery lock exists: ${paths.lock}`);
    }
    throw error;
  }
  let failure: unknown;
  try { await handle.writeFile(`${JSON.stringify(details)}\n`); }
  catch (error) { failure = error; }
  try { await handle.close(); }
  catch (error) { failure ??= error; }
  if (failure) throw new OwnedLockFailure(`recovery lock may be partial: ${paths.lock}: ${errorMessage(failure)}`);
}

async function publishReceipt(paths: StatePaths, receipt: Receipt): Promise<string> {
  const temporary = join(paths.state, `${basename(paths.receipt)}.${randomUUID()}.tmp`);
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeFile(temporary, serialized, { flag: "wx", mode: 0o600 });
  await rename(temporary, paths.receipt);
  return serialized;
}

function sameEntries(first: readonly Entry[], second: readonly Entry[]): boolean {
  return treeDigest(first) === treeDigest(second);
}

/**
 * Executes catalog, install and update commands while returning output instead of writing to streams.
 * Install/update may write to provider roots; callers retain control of presentation and exit.
 */
class Cli {
  private readonly paths: InstallationPaths;
  private readonly packageRoot: string;
  private readonly confirm: ConfirmReplacement | undefined;

  constructor(environment: NodeJS.ProcessEnv, packageRoot: string, confirm?: ConfirmReplacement) {
    this.paths = new InstallationPaths(environment, packageRoot);
    this.packageRoot = packageRoot;
    this.confirm = confirm;
  }

  /** Dispatches one invocation and converts expected and unexpected failures into a CliResult. */
  async run(argv: readonly string[]): Promise<CliResult> {
    try {
      const [command, ...commandArgs] = argv;
      if (command === undefined || command === "--help" || command === "-h") return this.usage();
      if (command === "list") return await this.runList(commandArgs);
      if (command === "install") return await this.runInstall(commandArgs);
      if (command === "update") return await this.runUpdate(commandArgs);
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
    return { exitCode: EXIT_CODES.success, stderr: "", stdout: `${SKILLS.join("\n")}\n` };
  }

  /**
   * Plans or copies selected packaged skills into provider roots without replacing targets.
   * Batch copies are sequential and preserve completed destinations if a later copy fails.
   */
  private async runInstall(argv: readonly string[]): Promise<CliResult> {
    const { positionals, values } = this.parseCliArgs(argv, {
      provider: { type: "string" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    });
    if (values.help === true) return this.usage();
    if (positionals.length !== 1 || (positionals[0] !== "all" && !SKILLS.includes(positionals[0] as Skill))) {
      throw new CliFailure(EXIT_CODES.usage, `install requires exactly one supported skill or all: ${SKILLS.join(" or ")}`);
    }
    const allSkills = positionals[0] === "all";
    const skills = allSkills ? SKILLS : [positionals[0] as Skill];
    const providers = this.selectedProviders(values.provider);
    const destinationsBySkill = skills.map((skill) => ({ skill, destinations: this.paths.destinations(providers, skill) }));
    const rawDestinations = destinationsBySkill.flatMap(({ destinations }) => destinations);
    this.paths.assertNoTargetOverlap(rawDestinations);

    const skillPlans: Array<{ readonly skill: Skill; readonly source: string; readonly entries: readonly Entry[]; readonly destinations: readonly Destination[] }> = [];
    for (const { skill, destinations: skillDestinations } of destinationsBySkill) {
      const source = await this.paths.packagedSkillRoot(skill);
      skillPlans.push({ skill, source, entries: await inventory(source), destinations: skillDestinations });
    }
    for (const { source } of skillPlans) this.paths.assertOutsideSource(source, rawDestinations);

    const destinations: InstallPlan[] = [];
    for (const { skill, source, entries, destinations: skillDestinations } of skillPlans) {
      for (const destination of skillDestinations) {
        const state = await statePaths(destination);
        destinations.push({ ...destination, skill, source, entries, state });
      }
    }
    this.assertCanonicalSeparation(destinations);

    const occupied = new Set<string>();
    for (const { target, state } of destinations) {
      await checkState(state);
      if (await this.paths.isOccupied(target) || await exists(state.receipt)) occupied.add(target);
    }
    if (occupied.size > 0) {
      const stdout = `${destinations
        .map(({ provider, skill, target }) => `${occupied.has(target) ? "REFUSE" : "PLAN"}\t[${provider}]\t${skill}\t${target}`)
        .join("\n")}\n`;
      return { exitCode: EXIT_CODES.refused, stderr: "", stdout };
    }

    if (values["dry-run"] === true) {
      return { exitCode: EXIT_CODES.success, stderr: "", stdout: this.formatPlan("PLAN", destinations) };
    }

    const identity = await packageIdentity(this.packageRoot);
    const installed: InstallPlan[] = [];
    for (const destination of destinations) {
      let locked = false;
      let copying = false;
      try {
        await acquireLock(destination.state, { target: destination.state.target, stage: null, backup: null, oldReceipt: null });
        locked = true;
        if (await this.paths.isOccupied(destination.target) || await exists(destination.state.receipt) ||
            !sameEntries(await inventory(destination.source), destination.entries) ||
            (await statePaths(destination)).target !== destination.state.target) {
          throw new CliFailure(EXIT_CODES.refused, "install target, receipt or source changed after preflight");
        }
        await mkdir(destination.root, { recursive: true });
        copying = true;
        await cp(destination.source, destination.target, {
          recursive: true,
          force: false,
          errorOnExist: true,
          mode: constants.COPYFILE_EXCL,
        });
        if (!sameEntries(await inventory(destination.target, true), destination.entries)) {
          throw new Error("copied tree differs from source inventory");
        }
        const published = await publishReceipt(destination.state, { schema: 1, mode: "copy", provider: destination.provider,
          target: destination.state.target, packageName: identity.name, packageVersion: identity.version,
          inventory: destination.entries });
        if ((await receiptText(destination.state)) !== published) throw new Error("published receipt differs from verified copy");
        await unlink(destination.state.lock);
        locked = false;
        installed.push(destination);
      } catch (error) {
        if (error instanceof OwnedLockFailure) locked = true;
        if (locked && !copying && !(error instanceof OwnedLockFailure)) {
          try { await unlink(destination.state.lock); locked = false; } catch { /* Keep a recovery lock on cleanup failure. */ }
        }
        return {
          exitCode: error instanceof CliFailure ? error.exitCode : EXIT_CODES.internal,
          stdout: this.formatPlan("INSTALLED", installed),
          stderr:
            `ERROR: install failed for [${destination.provider}]${allSkills ? ` ${destination.skill}` : ""} ${destination.target}: ` +
            `${errorMessage(error)}. ` +
            `The destination root or target may now be partial; completed installs were not removed. ` +
            `The failed target may be unclaimed.${locked ? ` Inspect recovery lock ${destination.state.lock}.` : ""}\n`,
        };
      }
    }

    return {
      exitCode: EXIT_CODES.success,
      stderr: "",
      stdout: this.formatPlan("INSTALLED", destinations),
    };
  }

  /** Replaces one copied tree only after a complete preview and applicable consent. */
  private async runUpdate(argv: readonly string[]): Promise<CliResult> {
    const { positionals, values } = this.parseCliArgs(argv, {
      provider: { type: "string" }, "dry-run": { type: "boolean" },
      replace: { type: "boolean" }, help: { type: "boolean", short: "h" },
    });
    if (values.help === true) return this.usage();
    if (positionals.length !== 1 || !SKILLS.includes(positionals[0] as Skill) ||
        !PROVIDERS.includes(values.provider as Provider) ||
        (values["dry-run"] === true && values.replace === true)) {
      throw new CliFailure(EXIT_CODES.usage, "update requires one named skill, --provider claude|codex, and at most one of --dry-run/--replace");
    }
    const skill = positionals[0] as Skill;
    const provider = values.provider as Provider;
    const destination = this.paths.destinations([provider], skill)[0]!;
    const paths = await statePaths(destination);
    const source = await this.paths.packagedSkillRoot(skill);
    assertSeparate(source, paths);
    const incoming = await inventory(source);
    const identity = await packageIdentity(this.packageRoot);
    await checkState(paths);
    const current = await inventory(paths.target, true);
    const stat = await lstat(paths.target);
    const oldText = await receiptText(paths);
    const receipt = oldText === undefined ? undefined : parseReceipt(oldText, paths, identity.name);
    const category = receipt === undefined ? "UNCLAIMED" : sameEntries(receipt.inventory, current) ? "CLEAN" : "EDITED";
    const changes = delta(current, incoming);
    const preview = [
      `PREVIEW\t[${provider}]\t${skill}\t${JSON.stringify(paths.target)}`,
      `STATE\t${category}`,
      `INCOMING\t${identity.name}@${identity.version}\t${treeDigest(incoming)}`,
      ...(changes.length ? changes : ["DELTA\tNONE"]),
    ].join("\n") + "\n";
    if (values["dry-run"] === true) return { exitCode: EXIT_CODES.success, stderr: "", stdout: preview };
    if (category === "CLEAN" && sameEntries(current, incoming) && values.replace !== true) {
      return { exitCode: EXIT_CODES.success, stderr: "", stdout: `${preview}UNCHANGED\t${JSON.stringify(paths.target)}\n` };
    }
    if (category !== "CLEAN" && values.replace !== true) {
      return { exitCode: EXIT_CODES.refused, stderr: "", stdout: `${preview}REFUSED\t${category} requires --replace\n` };
    }
    if (values.replace === true && (!this.confirm || !(await this.confirm(`${preview}Replace this entire skill tree? Type yes to confirm: `)))) {
      return { exitCode: EXIT_CODES.refused, stderr: "", stdout: `${preview}REFUSED\tconfirmation required\n` };
    }

    const matchesPreview = async (): Promise<boolean> => {
      try {
        const again = await statePaths(destination);
        const nowStat = await lstat(paths.target);
        return again.target === paths.target && again.state === paths.state &&
          stat.dev === nowStat.dev && stat.ino === nowStat.ino &&
          sameEntries(await inventory(paths.target, true), current) &&
          sameEntries(await inventory(source), incoming) &&
          (await receiptText(paths)) === oldText &&
          JSON.stringify(await packageIdentity(this.packageRoot)) === JSON.stringify(identity);
      } catch { return false; }
    };
    if (!(await matchesPreview())) {
      return { exitCode: EXIT_CODES.refused, stderr: "ERROR: source, target or receipt changed after preview.\n",
        stdout: `${preview}REFUSED\tstale confirmation\n` };
    }

    const nonce = randomUUID();
    const stage = join(paths.state, `${skill}.stage-${nonce}`);
    const backupDirectory = join(paths.state, "backups", `${skill}-${nonce}`);
    const backup = join(backupDirectory, "tree");
    const oldReceipt = join(backupDirectory, "receipt.json");
    const recovery = JSON.stringify({ target: paths.target, stage, backup, oldReceipt, receipt: paths.receipt, lock: paths.lock });
    let locked = false;
    let moveMayHaveStarted = false;
    try {
      await acquireLock(paths, { target: paths.target, stage, backup, oldReceipt });
      locked = true;
      if (!(await matchesPreview())) {
        throw new CliFailure(EXIT_CODES.refused, "source, target or receipt changed after preview");
      }
      await cp(source, stage, { recursive: true, force: false, errorOnExist: true, mode: constants.COPYFILE_EXCL });
      if (!sameEntries(await inventory(stage, true), incoming)) throw new Error("staged tree differs from incoming inventory");
      const backupRoot = join(paths.state, "backups");
      await mkdir(backupRoot, { recursive: true, mode: 0o700 });
      assertOwnedDirectory(backupRoot, await lstat(backupRoot));
      await mkdir(backupDirectory, { mode: 0o700 });
      if (oldText !== undefined) await writeFile(oldReceipt, oldText, { flag: "wx", mode: 0o600 });
      if (!(await matchesPreview())) {
        throw new CliFailure(EXIT_CODES.refused, "target or receipt changed before activation");
      }
      moveMayHaveStarted = true;
      await rename(paths.target, backup);
      if (await exists(paths.target)) throw new Error("target reappeared before activation");
      await rename(stage, paths.target);
      const published = await publishReceipt(paths, { schema: 1, mode: "copy", provider, target: paths.target,
        packageName: identity.name, packageVersion: identity.version, inventory: incoming });
      if (!sameEntries(await inventory(paths.target, true), incoming) ||
          (await receiptText(paths)) !== published) {
        throw new Error("final tree or receipt verification failed");
      }
      await unlink(paths.lock);
      locked = false;
      return { exitCode: EXIT_CODES.success, stderr: "", stdout: `${preview}UPDATED\t${JSON.stringify(paths.target)}\nBACKUP\t${JSON.stringify(backup)}\nOLD_RECEIPT\t${oldText === undefined ? "none" : JSON.stringify(oldReceipt)}\n` };
    } catch (error) {
      if (error instanceof OwnedLockFailure) locked = true;
      if (locked && !moveMayHaveStarted && !(error instanceof OwnedLockFailure)) {
        try { if (await matchesPreview()) { await unlink(paths.lock); locked = false; } }
        catch { /* Preserve the lock when cleanup fails. */ }
      }
      const uncertain = moveMayHaveStarted || locked;
      return { exitCode: uncertain ? EXIT_CODES.internal : error instanceof CliFailure ? error.exitCode : EXIT_CODES.internal,
        stdout: `${preview}${uncertain ? "UNCERTAIN/PARTIAL" : "REFUSED"}\t${recovery}\n`,
        stderr: `ERROR: update failed: ${errorMessage(error)}. ${uncertain ? "Inspect target, backup and receipt before manual recovery; retained lock blocks further writes." : "No live-tree rename was attempted; another writer may have changed the target."}\n` };
    }
  }

  private assertCanonicalSeparation(plans: readonly InstallPlan[]): void {
    for (const { source } of plans) for (const { state } of plans) assertSeparate(source, state);
    for (const [index, first] of plans.entries()) for (const second of plans.slice(index + 1)) {
      if (overlaps(first.state.target, second.state.target) || overlaps(second.state.target, first.state.target) ||
          overlaps(first.state.state, second.state.target) || overlaps(second.state.target, first.state.state) ||
          overlaps(second.state.state, first.state.target) || overlaps(first.state.target, second.state.state)) {
        throw new CliFailure(EXIT_CODES.refused, "canonical provider targets/state must not overlap");
      }
    }
  }

  /** Returns the command synopsis as a successful CLI result. */
  private usage(): CliResult {
    return { exitCode: EXIT_CODES.success, stderr: "", stdout: `${USAGE}\n` };
  }

  /** Formats outcomes for one or more skills while keeping the existing single-skill record shape. */
  private formatPlan(action: "INSTALLED" | "PLAN", destinations: readonly InstallPlan[]): string {
    if (destinations.length === 0) return "";
    return `${destinations.map(({ provider, target, skill }) => `${action}\t[${provider}]\t${skill}\t${target}`).join("\n")}\n`;
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
  confirm?: ConfirmReplacement,
): Promise<CliResult> {
  return new Cli(environment, packageRoot, confirm).run(argv);
}
