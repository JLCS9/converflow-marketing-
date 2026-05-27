/**
 * Server-side fetch helper for Next.js Server Components / route handlers.
 *
 * In production, web → api goes over the Docker internal network
 * (http://api:4000) — faster than going out to nginx + back. Cookies from
 * the incoming request are forwarded so the API sees the admin session.
 *
 * Errors are thrown as ApiError (same shape as the client helper).
 */
import { cookies } from 'next/headers';
import { ApiError } from './api-client';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://api:4000';

type ServerRequestOptions = Omit<RequestInit, 'body'> & { json?: unknown };

export async function serverApiFetch<T = unknown>(
  path: string,
  opts: ServerRequestOptions = {},
): Promise<T> {
  const { json, headers, ...rest } = opts;

  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  let res: Response;
  try {
    res = await fetch(`${INTERNAL_API_URL}${path}`, {
      ...rest,
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader,
        ...(headers ?? {}),
      },
      body: json !== undefined ? JSON.stringify(json) : (rest as { body?: BodyInit }).body,
      cache: 'no-store',
    });
  } catch (err) {
    throw new ApiError(0, err instanceof Error ? err.message : 'network error', err);
  }

  if (!res.ok) {
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

export { ApiError };
