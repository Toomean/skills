const ERRORS = {
  usage: { exitCode: 2 },
  "invalid-package": { exitCode: 4 },
  internal: { exitCode: 4 },
} as const;

export type CliErrorCode = keyof typeof ERRORS;

export class CliError extends Error {
  readonly code: CliErrorCode;
  readonly exitCode: 2 | 4;

  constructor(code: CliErrorCode, message: string) {
    super(message);
    this.code = code;
    this.exitCode = ERRORS[code].exitCode;
  }
}

export function errorDetails(error: unknown): {
  readonly code: CliErrorCode;
  readonly exitCode: 2 | 4;
  readonly message: string;
} {
  if (error instanceof CliError) {
    return { code: error.code, exitCode: error.exitCode, message: error.message };
  }
  return {
    code: "internal",
    exitCode: ERRORS.internal.exitCode,
    message: error instanceof Error ? error.message : String(error),
  };
}
