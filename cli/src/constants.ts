export const PROVIDERS = ["claude", "codex"] as const;

export const EXIT_CODES = {
  success: 0,
  refused: 1,
} as const;

export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const LIST_OPTIONS = {
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
} as const;

export const INSTALL_OPTIONS = {
  provider: { type: "string" },
  json: { type: "boolean" },
  "dry-run": { type: "boolean" },
  help: { type: "boolean", short: "h" },
} as const;

export const USAGE = [
  "usage:",
  "  toomean-skills list [<skill>|all] [--json]",
  "  toomean-skills install <skill>|all --provider claude|codex|all --dry-run [--json]",
].join("\n");
