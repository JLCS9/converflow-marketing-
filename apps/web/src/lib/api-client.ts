/**
 * Thin fetch wrapper. Talks to api.converflow.ai in prod (via NEXT_PUBLIC_API_URL,
 * inlined at build time). Cookies are shared across .converflow.ai subdomains.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

type RequestOptions = Omit<RequestInit, 'body'> & { json?: unknown };

export async function apiFetch<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { json, headers, ...rest } = opts;
  const rawBody = (rest as { body?: BodyInit }).body;
  const body = json !== undefined ? JSON.stringify(json) : rawBody;

  // Only declare content-type when we actually send a body. Otherwise Fastify
  // throws FST_ERR_CTP_EMPTY_JSON_BODY on POST/PATCH requests with no payload
  // (e.g. /admin/auth/2fa/enroll, /admin/auth/logout).
  const finalHeaders: Record<string, string> = { ...((headers as Record<string, string>) ?? {}) };
  if (body !== undefined && finalHeaders['content-type'] == null) {
    finalHeaders['content-type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...rest,
      headers: finalHeaders,
      credentials: 'include',
      body,
    });
  } catch (err) {
    // Network / CORS error before any HTTP response was received.
    throw new ApiError(0, networkErrorMessage(err), err);
  }

  if (!res.ok) {
    // Read body ONCE as text, then try to parse as JSON. Calling .json() and
    // then .text() on the same response throws "Already read".
    const text = await res.text().catch(() => '');
    let detail: unknown = text;
    try {
      detail = JSON.parse(text);
    } catch {
      /* keep as text */
    }
    const message =
      (detail as { error?: { message?: string } })?.error?.message ??
      (typeof detail === 'string' && detail ? detail : res.statusText) ??
      `HTTP ${res.status}`;
    throw new ApiError(res.status, message, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function networkErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.message.includes('CORS')) return 'CORS rechazó la petición';
    if (err.message.includes('Failed to fetch')) return 'No se pudo contactar con la API';
    return err.message;
  }
  return 'Error de red';
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
