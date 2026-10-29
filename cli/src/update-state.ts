import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, parse, relative, sep } from "node:path";

import { CliFailure, EXIT_CODES } from "./contracts.ts";
import type { Destination, Provider } from "./installation-paths.ts";

export interface Entry {
  readonly path: string;
  readonly type: "directory" | "file";
  readonly sha256?: string;
}

export interface Receipt {
  readonly schema: 1;
  readonly mode: "copy";
  readonly provider: Provider;
  readonly target: string;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly inventory: readonly Entry[];
}

export interface StatePaths extends Destination {
  readonly state: string;
  readonly receipt: string;
  readonly lock: string;
}

const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

export function treeDigest(entries: readonly Entry[]): string {
  return hash(JSON.stringify(entries));
}

/** Resolves existing ancestors, preserving a missing suffix without creating it. */
export async function canonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOTDIR") {
      throw new CliFailure(EXIT_CODES.refused, `provider root is not a directory: ${path}`);
    }
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return join(await canonicalPath(parent), basename(path));
  }
}

export function overlaps(a: string, b: string): boolean {
  const delta = relative(a, b);
  return delta === "" || (delta !== ".." && !delta.startsWith(`..${sep}`) && !isAbsolute(delta));
}

export async function statePaths(destination: Destination): Promise<StatePaths> {
  const root = await canonicalPath(destination.root);
  if (parse(root).root === root) throw new CliFailure(EXIT_CODES.refused, `provider root resolves to filesystem root: ${destination.root}`);
  try {
    if (!(await lstat(root)).isDirectory()) throw new CliFailure(EXIT_CODES.refused, `provider root is not a directory: ${destination.root}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const target = join(root, basename(destination.target));
  const state = `${root}.toomean-skills-state`;
  return { provider: destination.provider, root, target, state, receipt: join(state, `${basename(target)}.json`), lock: join(state, `${basename(target)}.lock`) };
}

export function assertSeparate(source: string, paths: StatePaths): void {
  if ([paths.target, paths.state].some((path) => overlaps(source, path) || overlaps(path, source)) ||
      overlaps(paths.target, paths.state) || overlaps(paths.state, paths.target)) {
    throw new CliFailure(EXIT_CODES.refused, "source, target and state paths must not overlap");
  }
}

/** A complete no-follow content inventory; link/special entries and target hardlinks refuse. */
export async function inventory(root: string, target = false): Promise<readonly Entry[]> {
  let rootStat;
  try { rootStat = await lstat(root); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new CliFailure(EXIT_CODES.refused, `missing skill target: ${root}`);
    throw error;
  }
  if (!rootStat.isDirectory()) throw new CliFailure(EXIT_CODES.refused, `not a skill directory: ${root}`);
  const entries: Entry[] = [];
  async function walk(directory: string, prefix: string): Promise<void> {
    for (const name of await readdir(directory)) {
      const path = join(directory, name);
      const relativePath = prefix ? `${prefix}/${name}` : name;
      const stat = await lstat(path);
      if (stat.isDirectory()) {
        entries.push({ path: relativePath, type: "directory" });
        await walk(path, relativePath);
      } else if (stat.isFile()) {
        if (target && stat.nlink !== 1) throw new CliFailure(EXIT_CODES.refused, `hardlinked target entry: ${relativePath}`);
        entries.push({ path: relativePath, type: "file", sha256: hash(await readFile(path)) });
      } else {
        throw new CliFailure(EXIT_CODES.refused, `link or special entry: ${relativePath}`);
      }
    }
  }
  await walk(root, "");
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (!entries.some((entry) => entry.path === "SKILL.md" && entry.type === "file")) {
    throw new CliFailure(EXIT_CODES.refused, `missing regular SKILL.md: ${root}`);
  }
  return entries;
}

export async function packageIdentity(packageRoot: string): Promise<{ name: string; version: string }> {
  const value: unknown = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  if (typeof value !== "object" || value === null || !("name" in value) || !("version" in value) ||
      value.name !== "@toomean/skills" || typeof value.version !== "string" || !value.version) {
    throw new CliFailure(EXIT_CODES.internal, "invalid package identity");
  }
  return { name: value.name, version: value.version };
}

function validEntry(value: unknown): value is Entry {
  if (typeof value !== "object" || value === null || !("path" in value) || !("type" in value)) return false;
  const path = value.path;
  if (typeof path !== "string" || !path || path.startsWith("/") || path.split("/").some((part) => !part || part === "." || part === ".." || part.includes("\\"))) return false;
  if (value.type === "directory") return !("sha256" in value);
  return value.type === "file" && "sha256" in value && typeof value.sha256 === "string" && /^[a-f0-9]{64}$/.test(value.sha256);
}

export function parseReceipt(text: string, paths: StatePaths, packageName: string): Receipt {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new CliFailure(EXIT_CODES.refused, `invalid receipt: ${paths.receipt}`); }
  if (typeof value !== "object" || value === null || !("schema" in value) || value.schema !== 1 ||
      !("mode" in value) || value.mode !== "copy" || !("provider" in value) || value.provider !== paths.provider ||
      !("target" in value) || value.target !== paths.target || !("packageName" in value) || value.packageName !== packageName ||
      !("packageVersion" in value) || typeof value.packageVersion !== "string" || !value.packageVersion ||
      !("inventory" in value) || !Array.isArray(value.inventory) || !value.inventory.every(validEntry)) {
    throw new CliFailure(EXIT_CODES.refused, `invalid receipt: ${paths.receipt}`);
  }
  const entries = value.inventory as Entry[];
  if (entries.some((entry, index) => index > 0 && entries[index - 1]!.path >= entry.path) ||
      !entries.some((entry) => entry.path === "SKILL.md" && entry.type === "file")) {
    throw new CliFailure(EXIT_CODES.refused, `invalid receipt: ${paths.receipt}`);
  }
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  if (entries.some((entry) => {
    const parts = entry.path.split("/");
    return parts.slice(1).some((_, index) => byPath.get(parts.slice(0, index + 1).join("/"))?.type !== "directory");
  })) throw new CliFailure(EXIT_CODES.refused, `invalid receipt: ${paths.receipt}`);
  return value as Receipt;
}

export function delta(current: readonly Entry[], incoming: readonly Entry[]): string[] {
  const old = new Map(current.map((entry) => [entry.path, entry]));
  const next = new Map(incoming.map((entry) => [entry.path, entry]));
  return [...new Set([...old.keys(), ...next.keys()])].sort().flatMap((path) => {
    const before = old.get(path);
    const after = next.get(path);
    if (!before) return [`ADD\t${JSON.stringify(path)}`];
    if (!after) return [`REMOVE\t${JSON.stringify(path)}`];
    return before.type !== after.type || before.sha256 !== after.sha256 ? [`CHANGE\t${JSON.stringify(path)}`] : [];
  });
}
