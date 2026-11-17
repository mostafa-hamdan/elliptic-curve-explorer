/**
 * Talking to the OnCurve server: one function for every API call, which sends JSON, adds
 * the CSRF token to requests that change something, remembers a new token when the server
 * issues one, and turns any failure into an error with a message fit for the screen.
 */

/** An API failure with a message that can be shown as it is. */
export class ApiError extends Error {
  /** The HTTP status, or 0 when the server could not be reached at all. */
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** The CSRF token for this browser, received from the server. */
let csrfToken = '';

/**
 * Remember the CSRF token (the server sends it with the session and after sign-in).
 *
 * @param token - the token.
 */
export function setCsrfToken(token: string): void {
  csrfToken = token;
}

/**
 * Call the API.
 *
 * @param method - HTTP method.
 * @param path - the route, for example "/api/auth/signin".
 * @param body - JSON body for POST and PUT.
 * @returns the parsed JSON answer.
 * @throws ApiError with a readable message when the request fails for any reason.
 */
export async function api<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  // Marks the request as coming from this website: expected refusals (wrong password,
  // invalid input) then arrive as status 200 with the real status in a header, so the
  // browser does not print them as network errors in the console.
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-OnCurve-Client': 'web',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    // A form sent within moments of the page loading can beat the first session request,
    // which is what delivers the token. Fetch it first instead of sending an empty one.
    if (csrfToken === '') await api('GET', '/api/auth/session').catch(() => undefined);
    headers['X-CSRF-Token'] = csrfToken;
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(
      0,
      'The OnCurve server cannot be reached. Check that the window running the app is still open.',
    );
  }

  const data = (await response.json().catch(() => ({}))) as { error?: string; csrfToken?: string };
  if (typeof data.csrfToken === 'string') setCsrfToken(data.csrfToken);
  const status = Number(response.headers.get('X-OnCurve-Status') ?? response.status);
  if (!response.ok || status >= 400) {
    throw new ApiError(
      status,
      data.error ?? `The server could not handle the request (error ${status}).`,
    );
  }
  return data as T;
}

/**
 * The message to show for any error thrown by {@link api} (or anything else).
 *
 * @param error - what was caught.
 * @returns a readable sentence.
 */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}
