import { lstat, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, normalize, parse, relative, sep } from "node:path";

import { CliFailure, EXIT_CODES, SKILL } from "./contracts.ts";

const PROVIDER_CONFIG = {
  claude: {
    environmentVariable: "CLAUDE_SKILLS_DIR",
    defaultRoot: [".claude", "skills"],
  },
  codex: {
    environmentVariable: "CODEX_SKILLS_DIR",
    defaultRoot: [".agents", "skills"],
  },
} as const;

export type Provider = keyof typeof PROVIDER_CONFIG;

export const PROVIDERS: readonly Provider[] = Object.keys(PROVIDER_CONFIG) as Provider[];

export interface Destination {
  readonly provider: Provider;
  readonly root: string;
  readonly target: string;
}

/**
 * Resolves and validates package and provider paths without performing installation writes.
 * Path relationships are lexical unless a method explicitly returns a canonical path.
 */
export class InstallationPaths {
  private readonly environment: NodeJS.ProcessEnv;
  private readonly packageRoot: string;

  /** Uses the supplied environment and package root for deterministic provider and source resolution. */
  constructor(environment: NodeJS.ProcessEnv, packageRoot: string) {
    this.environment = environment;
    this.packageRoot = packageRoot;
  }

  /** Returns an absolute, non-root installation root and skill target for each requested provider. */
  destinations(providers: readonly Provider[]): readonly Destination[] {
    return providers.map((provider) => {
      const root = this.providerRoot(provider);
      return { provider, root, target: join(root, SKILL) };
    });
  }

  /** Rejects any equal or nested target pair so a multi-provider install cannot write inside another target. */
  assertNoTargetOverlap(destinations: readonly Destination[]): void {
    for (const [index, first] of destinations.entries()) {
      for (const second of destinations.slice(index + 1)) {
        if (
          this.isSameOrDescendant(first.target, second.target) ||
          this.isSameOrDescendant(second.target, first.target)
        ) {
          throw new CliFailure(EXIT_CODES.refused, "provider targets must not overlap");
        }
      }
    }
  }

  /** Validates a regular-file SKILL.md marker and returns the canonical packaged-skill directory. */
  async packagedSkillRoot(): Promise<string> {
    const source = join(this.packageRoot, SKILL);
    try {
      const skillMetadata = await lstat(join(source, "SKILL.md"));
      if (!skillMetadata.isFile()) throw new Error("invalid source shape");
      return await realpath(source);
    } catch {
      throw new CliFailure(EXIT_CODES.internal, `invalid packaged skill: ${SKILL}`);
    }
  }

  /**
   * Rejects destinations equal to or lexically beneath the source so a recursive copy cannot consume its output.
   * This is a lexical preflight: existing symlinked ancestors of a destination are not resolved.
   */
  assertOutsideSource(source: string, destinations: readonly Destination[]): void {
    if (destinations.some(({ target }) => this.isSameOrDescendant(source, target))) {
      throw new CliFailure(EXIT_CODES.refused, "provider target must be outside the packaged skill source");
    }
  }

  /**
   * Returns true for any directory entry, including a broken symlink.
   * Returns false only when lstat reports ENOENT; all other errors propagate.
   */
  async isOccupied(target: string): Promise<boolean> {
    try {
      await lstat(target);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  /** Uses the provider's environment override or home default and rejects relative or filesystem-root paths. */
  private providerRoot(provider: Provider): string {
    const { defaultRoot, environmentVariable } = PROVIDER_CONFIG[provider];
    const configured = this.environment[environmentVariable] ?? join(homedir(), ...defaultRoot);
    if (!isAbsolute(configured)) {
      throw new CliFailure(EXIT_CODES.usage, `${environmentVariable} must be an absolute non-root path`);
    }
    const root = normalize(configured);
    if (parse(root).root === root) {
      throw new CliFailure(EXIT_CODES.usage, `${environmentVariable} must be an absolute non-root path`);
    }
    return root;
  }

  /** Tests lexical equality or descent without resolving filesystem symlinks. */
  private isSameOrDescendant(parent: string, child: string): boolean {
    const delta = relative(parent, child);
    return delta === "" || (delta !== ".." && !delta.startsWith(`..${sep}`) && !isAbsolute(delta));
  }
}
