import { lstat, readFile } from "node:fs/promises";
import { posix } from "node:path";
import { parse } from "smol-toml";

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PACKAGE_RE = /^@[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_RE = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export class ManifestError extends Error {}

export interface RepositoryManifest {
  readonly contentFormat: "utf-8-text";
  readonly name: string;
  readonly rootFiles: readonly string[];
  readonly tagline: string;
  readonly title: string;
}

export interface PackageManifest {
  readonly binary: string;
  readonly catalogVersion: 1;
  readonly moduleFormat: "esm";
  readonly name: string;
  readonly node: ">=24";
  readonly version: string;
}

export interface SkillManifest {
  readonly description: string;
  readonly executables: readonly string[];
  readonly files: readonly string[];
  readonly loadCheck: string;
  readonly name: string;
  readonly path: string;
  readonly runtimeExecutables: readonly string[];
  readonly runtimeFiles: readonly string[];
  readonly version: string;
}

export interface SkillsManifest {
  readonly package: PackageManifest;
  readonly repository: RepositoryManifest;
  readonly skills: ReadonlyMap<string, SkillManifest>;
}

type Table = Record<string, unknown>;

function table(value: unknown, label: string): Table {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new ManifestError(`${label} must be a table`);
  }
  return value as Table;
}

function exactKeys(value: Table, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new ManifestError(`${label} schema drift`);
  }
}

function nonemptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new ManifestError(`invalid ${label}`);
  }
  return value;
}

function relativePath(value: unknown, label: string): string {
  const result = nonemptyString(value, label);
  if (
    result.includes("\\") ||
    posix.isAbsolute(result) ||
    posix.normalize(result) !== result ||
    result.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new ManifestError(`invalid ${label}: ${JSON.stringify(result)}`);
  }
  return result;
}

function sortedPaths(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new ManifestError(`${label} must be an array`);
  const paths = value.map((item) => relativePath(item, label));
  const sorted = [...paths].sort();
  if (paths.some((item, index) => item !== sorted[index]) || new Set(paths).size !== paths.length) {
    throw new ManifestError(`${label} must be sorted and unique`);
  }
  return paths;
}

function version(value: unknown, label: string): string {
  const result = nonemptyString(value, label);
  if (!VERSION_RE.test(result)) throw new ManifestError(`invalid ${label}`);
  return result;
}

function parseManifest(raw: unknown): SkillsManifest {
  const root = table(raw, "manifest");
  exactKeys(root, ["manifest_version", "package", "repository", "skills"], "manifest top-level");
  if (root.manifest_version !== 2) throw new ManifestError("manifest_version must be 2");

  const repository = table(root.repository, "repository");
  exactKeys(repository, ["content_format", "name", "root_files", "tagline", "title"], "repository manifest");
  if (repository.content_format !== "utf-8-text") {
    throw new ManifestError("repository.content_format must be 'utf-8-text'");
  }
  const rootFiles = sortedPaths(repository.root_files, "repository.root_files");
  for (const required of ["LICENSE", "manifest_contract.py", "skills.toml"]) {
    if (!rootFiles.includes(required)) throw new ManifestError(`repository.root_files must contain ${required}`);
  }

  const packageTable = table(root.package, "package");
  exactKeys(packageTable, ["binary", "catalog_version", "module_format", "name", "node", "version"], "package manifest");
  const packageName = nonemptyString(packageTable.name, "package.name");
  if (!PACKAGE_RE.test(packageName)) throw new ManifestError("invalid package.name");
  const binary = nonemptyString(packageTable.binary, "package.binary");
  if (!NAME_RE.test(binary)) throw new ManifestError("invalid package.binary");
  if (packageTable.catalog_version !== 1) throw new ManifestError("package.catalog_version must be 1");
  if (packageTable.module_format !== "esm") throw new ManifestError("package.module_format must be 'esm'");
  if (packageTable.node !== ">=24") throw new ManifestError("package.node must be '>=24'");

  const skillsTable = table(root.skills, "skills");
  if (Object.keys(skillsTable).length === 0) throw new ManifestError("skills must be non-empty");
  const skills = new Map<string, SkillManifest>();
  const sourcePaths = new Set(rootFiles);
  for (const name of Object.keys(skillsTable).sort()) {
    if (!NAME_RE.test(name)) throw new ManifestError(`invalid skill name: ${name}`);
    const skill = table(skillsTable[name], `skills.${name}`);
    exactKeys(
      skill,
      ["description", "executables", "files", "load_check", "path", "runtime_files", "version"],
      `skill schema: ${name}`,
    );
    if (skill.path !== name) throw new ManifestError(`skill path must equal its name: ${name}`);
    const files = sortedPaths(skill.files, `skills.${name}.files`);
    const runtimeFiles = sortedPaths(skill.runtime_files, `skills.${name}.runtime_files`);
    const executables = sortedPaths(skill.executables, `skills.${name}.executables`);
    if (!files.includes("SKILL.md") || !runtimeFiles.includes("SKILL.md")) {
      throw new ManifestError(`skill source/runtime allowlist has no SKILL.md: ${name}`);
    }
    if (runtimeFiles.some((item) => !files.includes(item))) {
      throw new ManifestError(`skill runtime_files must be a subset of files: ${name}`);
    }
    if (executables.some((item) => !files.includes(item))) {
      throw new ManifestError(`skill executables must be a subset of files: ${name}`);
    }
    for (const item of files) {
      const sourcePath = `${name}/${item}`;
      if (sourcePaths.has(sourcePath)) throw new ManifestError(`manifest path collision: ${sourcePath}`);
      sourcePaths.add(sourcePath);
    }
    skills.set(name, {
      description: nonemptyString(skill.description, `skills.${name}.description`),
      executables,
      files,
      loadCheck: nonemptyString(skill.load_check, `skills.${name}.load_check`),
      name,
      path: name,
      runtimeExecutables: executables.filter((item) => runtimeFiles.includes(item)),
      runtimeFiles,
      version: version(skill.version, `skills.${name}.version`),
    });
  }

  return {
    package: {
      binary,
      catalogVersion: 1,
      moduleFormat: "esm",
      name: packageName,
      node: ">=24",
      version: version(packageTable.version, "package.version"),
    },
    repository: {
      contentFormat: "utf-8-text",
      name: nonemptyString(repository.name, "repository.name"),
      rootFiles,
      tagline: nonemptyString(repository.tagline, "repository.tagline"),
      title: nonemptyString(repository.title, "repository.title"),
    },
    skills,
  };
}

export async function loadManifest(path: string): Promise<SkillsManifest> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new ManifestError(`manifest must be a regular non-symlink file: ${path}`);
  }
  const text = await readFile(path, "utf8");
  return parseManifest(parse(text));
}

export function parseManifestForTest(raw: unknown): SkillsManifest {
  return parseManifest(raw);
}
