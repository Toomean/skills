import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  type Catalog,
  type CatalogFile,
  canonicalJson,
  payloadDigest,
  sha256,
} from "./catalog.ts";
import { loadManifest } from "./manifest.ts";

export class BuildError extends Error {}

async function requireRegular(path: string, label: string): Promise<void> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (await realpath(path)) !== path) {
    throw new BuildError(`${label} must be a regular non-symlink file: ${path}`);
  }
}

async function writeNew(path: string, bytes: Uint8Array | string, mode: number): Promise<void> {
  await mkdir(dirname(path), { mode: 0o755, recursive: true });
  await writeFile(path, bytes, { flag: "wx", mode });
}

async function copyRegular(source: string, destination: string, mode: number): Promise<Buffer> {
  await requireRegular(source, "package input");
  const bytes = await readFile(source);
  await writeNew(destination, bytes, mode);
  return bytes;
}

async function requireBuildRoots(repositoryRoot: string, compiledCli: string, outputRoot: string): Promise<void> {
  if (![repositoryRoot, compiledCli, outputRoot].every(isAbsolute)) {
    throw new BuildError("repository, compiled CLI, and output paths must be absolute");
  }
  const repositoryMetadata = await lstat(repositoryRoot);
  if (!repositoryMetadata.isDirectory() || repositoryMetadata.isSymbolicLink()) {
    throw new BuildError(`repository root must be a real directory: ${repositoryRoot}`);
  }
  if ((await realpath(repositoryRoot)) !== repositoryRoot) {
    throw new BuildError(`repository root must be canonical: ${repositoryRoot}`);
  }
  await requireRegular(compiledCli, "compiled CLI");
  await requireRegular(join(dirname(compiledCli), "catalog.js"), "compiled CLI dependency");
  const parent = dirname(outputRoot);
  const parentMetadata = await lstat(parent);
  if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink() || (await realpath(parent)) !== parent) {
    throw new BuildError(`output parent must be a canonical real directory: ${parent}`);
  }
  try {
    await lstat(outputRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new BuildError(`output must be absent: ${outputRoot}`);
}

export async function buildPackage(
  repositoryRoot: string,
  compiledCli: string,
  outputRoot: string,
): Promise<Catalog> {
  await requireBuildRoots(repositoryRoot, compiledCli, outputRoot);
  const manifest = await loadManifest(join(repositoryRoot, "skills.toml"));
  await mkdir(outputRoot, { mode: 0o755 });

  await copyRegular(join(repositoryRoot, "LICENSE"), join(outputRoot, "LICENSE"), 0o644);
  await copyRegular(join(repositoryRoot, "README.md"), join(outputRoot, "README.md"), 0o644);
  await copyRegular(compiledCli, join(outputRoot, "bin", `${manifest.package.binary}.js`), 0o755);
  await copyRegular(join(dirname(compiledCli), "catalog.js"), join(outputRoot, "bin", "catalog.js"), 0o644);

  const catalogSkills = [];
  for (const skill of manifest.skills.values()) {
    const files: CatalogFile[] = [];
    for (const relative of skill.runtimeFiles) {
      const executable = skill.runtimeExecutables.includes(relative);
      const bytes = await copyRegular(
        join(repositoryRoot, skill.path, ...relative.split("/")),
        join(outputRoot, "skills", skill.name, ...relative.split("/")),
        executable ? 0o755 : 0o644,
      );
      files.push({
        bytes: bytes.byteLength,
        executable,
        path: relative,
        sha256: sha256(bytes),
      });
    }
    catalogSkills.push({
      description: skill.description,
      files,
      loadCheck: skill.loadCheck,
      name: skill.name,
      path: `skills/${skill.name}`,
      payloadSha256: payloadDigest(files),
      version: skill.version,
    });
  }

  const catalog: Catalog = {
    catalogVersion: manifest.package.catalogVersion,
    packageName: manifest.package.name,
    packageVersion: manifest.package.version,
    skills: catalogSkills,
  };
  const catalogBytes = canonicalJson(catalog);
  await writeNew(join(outputRoot, "catalog.json"), catalogBytes, 0o644);
  await writeNew(join(outputRoot, "catalog.sha256"), `${sha256(catalogBytes)}\n`, 0o644);

  const packageJson = canonicalJson({
    bin: { [manifest.package.binary]: `./bin/${manifest.package.binary}.js` },
    description: manifest.repository.tagline,
    engines: { node: manifest.package.node },
    license: "Apache-2.0",
    name: manifest.package.name,
    publishConfig: { access: "public" },
    repository: { type: "git", url: "git+https://github.com/Toomean/skills.git" },
    type: "module",
    version: manifest.package.version,
  });
  await writeNew(join(outputRoot, "package.json"), packageJson, 0o644);
  return catalog;
}

async function main(argv: readonly string[]): Promise<void> {
  if (argv.length !== 3) {
    throw new BuildError("usage: build.js <absolute-repository-root> <absolute-compiled-cli> <absolute-output-root>");
  }
  await buildPackage(argv[0]!, argv[1]!, argv[2]!);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`ERROR ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
