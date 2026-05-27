/**
 * Thin fetch wrapper that talks to /api/* (rewritten to the NestJS API in next.config.mjs).
 * In production the API is served from api.converflow.ai but the cookie is set on
 * .converflow.ai so requests still carry credentials.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

type RequestOptions = Omit<RequestInit, 'body'> & { json?: unknown };

export async function apiFetch<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { json, headers, ...rest } = opts;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      'content-type': 'application/json',
      ...(headers ?? {}),
    },
    credentials: 'include',
    body: json !== undefined ? JSON.stringify(json) : (rest as { body?: BodyInit }).body,
  });

  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text();
    }
    throw new ApiError(res.status, (detail as { error?: { message?: string } })?.error?.message ?? res.statusText, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
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
