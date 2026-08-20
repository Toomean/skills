import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";

export class IntegrityError extends Error {}

export interface CatalogFile {
  readonly bytes: number;
  readonly executable: boolean;
  readonly path: string;
  readonly sha256: string;
}

export interface CatalogSkill {
  readonly description: string;
  readonly files: readonly CatalogFile[];
  readonly loadCheck: string;
  readonly name: string;
  readonly path: string;
  readonly payloadSha256: string;
  readonly version: string;
}

export interface Catalog {
  readonly catalogVersion: 1;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly skills: readonly CatalogSkill[];
}

const SHA256_RE = /^[0-9a-f]{64}$/;
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PACKAGE_RE = /^@[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_RE = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalValue(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalValue(item)}`).join(",")}}`;
  }
  throw new IntegrityError("canonical JSON contains an unsupported value");
}

export function canonicalJson(value: unknown): string {
  return `${canonicalValue(value)}\n`;
}

export function payloadDigest(files: readonly CatalogFile[]): string {
  const input = files
    .map((file) => `${file.path}\0${file.executable ? "0755" : "0644"}\0${file.bytes}\0${file.sha256}\n`)
    .join("");
  return sha256(input);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new IntegrityError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new IntegrityError(`${label} schema drift`);
  }
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new IntegrityError(`invalid ${label}`);
  }
  return value;
}

function relativePath(value: unknown, label: string): string {
  const path = string(value, label);
  if (
    path.includes("\\") ||
    posix.isAbsolute(path) ||
    posix.normalize(path) !== path ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new IntegrityError(`invalid ${label}`);
  }
  return path;
}

function parseFile(value: unknown, label: string): CatalogFile {
  const item = object(value, label);
  exactKeys(item, ["bytes", "executable", "path", "sha256"], label);
  if (!Number.isSafeInteger(item.bytes) || (item.bytes as number) < 0) {
    throw new IntegrityError(`invalid ${label}.bytes`);
  }
  if (typeof item.executable !== "boolean") throw new IntegrityError(`invalid ${label}.executable`);
  const path = relativePath(item.path, `${label}.path`);
  const digest = string(item.sha256, `${label}.sha256`);
  if (!SHA256_RE.test(digest)) throw new IntegrityError(`invalid ${label}.sha256`);
  return { bytes: item.bytes as number, executable: item.executable, path, sha256: digest };
}

function parseCatalog(text: string): Catalog {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new IntegrityError(`invalid catalog JSON: ${String(error)}`);
  }
  const root = object(raw, "catalog");
  exactKeys(root, ["catalogVersion", "packageName", "packageVersion", "skills"], "catalog");
  if (root.catalogVersion !== 1) throw new IntegrityError("catalogVersion must be 1");
  if (!Array.isArray(root.skills) || root.skills.length === 0) {
    throw new IntegrityError("catalog.skills must be non-empty");
  }
  const skills: CatalogSkill[] = root.skills.map((value, index) => {
    const label = `catalog.skills[${index}]`;
    const item = object(value, label);
    exactKeys(item, ["description", "files", "loadCheck", "name", "path", "payloadSha256", "version"], label);
    if (!Array.isArray(item.files) || item.files.length === 0) {
      throw new IntegrityError(`${label}.files must be non-empty`);
    }
    const files = item.files.map((file, fileIndex) => parseFile(file, `${label}.files[${fileIndex}]`));
    const paths = files.map((file) => file.path);
    if (paths.some((path, pathIndex) => path !== [...paths].sort()[pathIndex]) || new Set(paths).size !== paths.length) {
      throw new IntegrityError(`${label}.files must be sorted and unique`);
    }
    const digest = string(item.payloadSha256, `${label}.payloadSha256`);
    if (!SHA256_RE.test(digest) || payloadDigest(files) !== digest) {
      throw new IntegrityError(`${label}.payloadSha256 mismatch`);
    }
    const name = string(item.name, `${label}.name`);
    if (!NAME_RE.test(name)) throw new IntegrityError(`invalid ${label}.name`);
    const path = relativePath(item.path, `${label}.path`);
    if (path !== `skills/${name}`) throw new IntegrityError(`${label}.path must equal skills/${name}`);
    const version = string(item.version, `${label}.version`);
    if (!VERSION_RE.test(version)) throw new IntegrityError(`invalid ${label}.version`);
    return {
      description: string(item.description, `${label}.description`),
      files,
      loadCheck: string(item.loadCheck, `${label}.loadCheck`),
      name,
      path,
      payloadSha256: digest,
      version,
    };
  });
  const names = skills.map((skill) => skill.name);
  if (names.some((name, index) => name !== [...names].sort()[index]) || new Set(names).size !== names.length) {
    throw new IntegrityError("catalog.skills must be sorted and unique");
  }
  const packageName = string(root.packageName, "catalog.packageName");
  if (!PACKAGE_RE.test(packageName)) throw new IntegrityError("invalid catalog.packageName");
  const packageVersion = string(root.packageVersion, "catalog.packageVersion");
  if (!VERSION_RE.test(packageVersion)) throw new IntegrityError("invalid catalog.packageVersion");
  return {
    catalogVersion: 1,
    packageName,
    packageVersion,
    skills,
  };
}

export async function loadCatalog(packageRoot: string): Promise<Catalog> {
  const catalogPath = join(packageRoot, "catalog.json");
  const digestPath = join(packageRoot, "catalog.sha256");
  const [catalogMetadata, digestMetadata] = await Promise.all([
    lstat(catalogPath),
    lstat(digestPath),
  ]);
  if (
    !catalogMetadata.isFile() ||
    catalogMetadata.isSymbolicLink() ||
    !digestMetadata.isFile() ||
    digestMetadata.isSymbolicLink() ||
    (await realpath(catalogPath)) !== catalogPath ||
    (await realpath(digestPath)) !== digestPath
  ) {
    throw new IntegrityError("catalog files must be regular non-symlink files");
  }
  if (catalogMetadata.size > 1_048_576 || digestMetadata.size !== 65) {
    throw new IntegrityError("catalog files have invalid size");
  }
  const [bytes, digestText] = await Promise.all([readFile(catalogPath), readFile(digestPath, "utf8")]);
  if (digestText !== `${sha256(bytes)}\n`) throw new IntegrityError("catalog digest mismatch");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!text.endsWith("\n")) throw new IntegrityError("catalog must end with one LF");
  const catalog = parseCatalog(text);
  if (canonicalJson(catalog) !== text) throw new IntegrityError("catalog JSON is not canonical");
  return catalog;
}

async function inventoryFiles(root: string): Promise<readonly string[]> {
  const result: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new IntegrityError(`payload symlink is forbidden: ${path}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) result.push(relative(root, path).split(sep).join("/"));
      else throw new IntegrityError(`payload special file is forbidden: ${path}`);
    }
  }
  await visit(root);
  return result.sort();
}

export async function verifyPayload(packageRoot: string, skills: readonly CatalogSkill[]): Promise<void> {
  for (const skill of skills) {
    const root = join(packageRoot, skill.path);
    const rootMetadata = await lstat(root);
    if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink() || (await realpath(root)) !== root) {
      throw new IntegrityError(`payload root must be a real directory: ${skill.name}`);
    }
    const actualPaths = await inventoryFiles(root);
    const expectedPaths = skill.files.map((file) => file.path);
    if (actualPaths.length !== expectedPaths.length || actualPaths.some((path, index) => path !== expectedPaths[index])) {
      throw new IntegrityError(`payload inventory mismatch: ${skill.name}`);
    }
    const observed: CatalogFile[] = [];
    for (const expected of skill.files) {
      const path = join(root, ...expected.path.split("/"));
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new IntegrityError(`payload file must be regular: ${skill.name}/${expected.path}`);
      }
      const mode = metadata.mode & 0o7777;
      const expectedMode = expected.executable ? 0o755 : 0o644;
      if (mode !== expectedMode) throw new IntegrityError(`payload mode mismatch: ${skill.name}/${expected.path}`);
      const executable = mode === 0o755;
      const bytes = await readFile(path);
      const actual: CatalogFile = {
        bytes: bytes.byteLength,
        executable,
        path: expected.path,
        sha256: sha256(bytes),
      };
      if (
        actual.bytes !== expected.bytes ||
        actual.executable !== expected.executable ||
        actual.sha256 !== expected.sha256
      ) {
        throw new IntegrityError(`payload content/mode mismatch: ${skill.name}/${expected.path}`);
      }
      observed.push(actual);
    }
    if (payloadDigest(observed) !== skill.payloadSha256) {
      throw new IntegrityError(`payload digest mismatch: ${skill.name}`);
    }
  }
}
