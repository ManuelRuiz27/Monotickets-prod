export interface ApiErrorPayload {
  error: string;
  message?: string;
  details?: unknown;
  requestId?: string;
}

export interface HandleErrorOptions {
  scope?: string;
  request?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: unknown;
  readonly scope?: string;
  readonly request?: string;

  constructor(message: string, options: { status: number; code: string; requestId?: string; details?: unknown; scope?: string; request?: string }) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.details = options.details;
    this.scope = options.scope;
    this.request = options.request;
  }
}

export async function handleError(response: Response, options: HandleErrorOptions = {}): Promise<never> {
  let payload: ApiErrorPayload | null = null;
  let rawBody: string | null = null;
  try {
    rawBody = await response.text();
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch (parseError) {
        if (!(parseError instanceof SyntaxError)) {
          throw parseError;
        }
      }
    }
  } catch (readError) {
    rawBody = null;
  }

  const code = payload?.error || `http_${response.status}`;
  const message = payload?.message || rawBody || `Request failed with status ${response.status}`;

  const error = new ApiError(message, {
    status: response.status,
    code,
    requestId: payload?.requestId,
    details: payload?.details,
    scope: options.scope,
    request: options.request,
  });

  throw error;
}
