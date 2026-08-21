import { homedir } from "node:os";
import { isAbsolute, join, normalize, parse } from "node:path";

import { CliError } from "./errors.ts";
import type { Provider } from "./types.ts";

// Resolve the one provider-owned destination used by install previews. Overrides must be explicit,
// normalized directories rather than filesystem roots.
export function providerRoot(provider: Provider, environment: NodeJS.ProcessEnv): string {
  const variable = provider === "claude" ? "CLAUDE_SKILLS_DIR" : "CODEX_SKILLS_DIR";
  const fallback = provider === "claude" ? join(homedir(), ".claude", "skills") : join(homedir(), ".agents", "skills");
  const value = environment[variable] ?? fallback;
  if (!isAbsolute(value) || normalize(value) !== value || parse(value).root === value) {
    throw new CliError("usage", `${variable} must be an absolute normalized non-root path`);
  }
  return value;
}
