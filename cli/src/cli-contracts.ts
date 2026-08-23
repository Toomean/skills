export const SKILL = "earned-done";

export const EXIT_CODES = {
  success: 0,
  refused: 1,
  usage: 2,
  internal: 4,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];
export type FailureExitCode = Exclude<ExitCode, typeof EXIT_CODES.success>;

export interface CliResult {
  readonly exitCode: ExitCode;
  readonly stderr: string;
  readonly stdout: string;
}

export class CliFailure extends Error {
  readonly exitCode: FailureExitCode;

  constructor(exitCode: FailureExitCode, message: string) {
    super(message);
    this.exitCode = exitCode;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
