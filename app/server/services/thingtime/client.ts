export const THINGTIME_DEFAULT_API_URL = "https://thingtime.com";
export const THINGTIME_DEFAULT_TIMEOUT_MS = 15_000;

export interface ThingtimeRequestOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export class ThingtimeApiError extends Error {
  readonly code?: string;
  readonly statusCode: number;

  constructor(
    message: string,
    statusCode: number,
    options?: ErrorOptions & { code?: string },
  ) {
    super(message, options);
    this.name = "ThingtimeApiError";
    this.code = options?.code;
    this.statusCode = statusCode;
  }
}

export function thingtimeApiUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.THINGTIME_API_URL || THINGTIME_DEFAULT_API_URL).replace(/\/+$/, "");
}

export function thingtimeServiceToken(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const token = env.THINGTIME_SERVICE_TOKEN?.trim();
  return token || undefined;
}

export function isThingtimeServiceConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(thingtimeServiceToken(env));
}

function requestTimeoutMs(env: NodeJS.ProcessEnv): number {
  const configured = Number(env.THINGTIME_API_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : THINGTIME_DEFAULT_TIMEOUT_MS;
}

export async function thingtimeServiceRequest<T>(
  path: string,
  init: RequestInit = {},
  options: ThingtimeRequestOptions = {},
): Promise<T> {
  const env = options.env ?? process.env;
  const token = thingtimeServiceToken(env);
  if (!token) {
    throw new ThingtimeApiError(
      "Thingtime service storage is not configured",
      503,
    );
  }

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${thingtimeApiUrl(env)}${path}`, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(requestTimeoutMs(env)),
    });
  } catch (error) {
    throw new ThingtimeApiError(
      "Thingtime storage could not be reached",
      503,
      { cause: error },
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | ({ error?: unknown } & Record<string, unknown>)
    | null;
  if (!response.ok) {
    const detail = typeof payload?.error === "string" ? payload.error : undefined;
    throw new ThingtimeApiError(
      detail ? `Thingtime storage failed: ${detail}` : "Thingtime storage request failed",
      response.status,
      {
        code: typeof payload?.code === "string" ? payload.code : undefined,
      },
    );
  }
  if (!payload) {
    throw new ThingtimeApiError("Thingtime storage returned invalid JSON", 502);
  }
  return payload as T;
}
