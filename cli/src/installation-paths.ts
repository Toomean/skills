import { lstat, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, normalize, parse, relative, sep } from "node:path";

import { CliFailure, EXIT_CODES, SKILL } from "./cli-contracts.ts";

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

export class InstallationPaths {
  private readonly environment: NodeJS.ProcessEnv;
  private readonly packageRoot: string;

  constructor(environment: NodeJS.ProcessEnv, packageRoot: string) {
    this.environment = environment;
    this.packageRoot = packageRoot;
  }

  destinations(providers: readonly Provider[]): readonly Destination[] {
    return providers.map((provider) => {
      const root = this.providerRoot(provider);
      return { provider, root, target: join(root, SKILL) };
    });
  }

  assertIndependent(destinations: readonly Destination[]): void {
    const [first, second] = destinations;
    if (
      first !== undefined &&
      second !== undefined &&
      (this.isSameOrDescendant(first.target, second.target) ||
        this.isSameOrDescendant(second.target, first.target))
    ) {
      throw new CliFailure(EXIT_CODES.refused, "provider targets must be independent");
    }
  }

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

  assertOutsideSource(source: string, destinations: readonly Destination[]): void {
    // Copying into the source tree can make a recursive copy consume its own output.
    if (destinations.some(({ target }) => this.isSameOrDescendant(source, target))) {
      throw new CliFailure(EXIT_CODES.refused, "provider target overlaps the packaged skill");
    }
  }

  async isOccupied(target: string): Promise<boolean> {
    try {
      await lstat(target);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

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

  private isSameOrDescendant(parent: string, child: string): boolean {
    const delta = relative(parent, child);
    return delta === "" || (delta !== ".." && !delta.startsWith(`..${sep}`) && !isAbsolute(delta));
  }
}
