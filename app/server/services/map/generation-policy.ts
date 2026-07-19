export const PUBLIC_REGENERATION_MESSAGE =
  "Explicit map regeneration is disabled on public Pokeworld deployments";

export class GenerationControlError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = "GenerationControlError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function isPublicDeployment(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    environment.POKEWORLD_PUBLIC_BUILD === "true" ||
    environment.VERCEL === "1" ||
    Boolean(environment.VERCEL_ENV)
  );
}

export function assertRegenerationAllowed(
  regenerate: boolean,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (regenerate && isPublicDeployment(environment)) {
    throw new GenerationControlError(
      PUBLIC_REGENERATION_MESSAGE,
      403,
      "PUBLIC_REGENERATION_DISABLED",
    );
  }
}

export function assertPublicWorkflowReservation(
  reservationId: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (isPublicDeployment(environment) && !reservationId) {
    throw new GenerationControlError(
      "Public map generation requires a quota reservation",
      503,
      "GENERATION_QUOTA_UNAVAILABLE",
    );
  }
}

export function assertPublicGenerationPermit(
  permitId: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (isPublicDeployment(environment) && !permitId) {
    throw new GenerationControlError(
      "Public map generation requires a quota permit",
      503,
      "GENERATION_QUOTA_UNAVAILABLE",
    );
  }
}

export function generationControlStatus(
  error: unknown,
  fallbackStatus = 400,
): number {
  return error instanceof GenerationControlError
    ? error.statusCode
    : fallbackStatus;
}
