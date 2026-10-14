export const DEFAULT_USER_AGENT = "Varsellisten/0.1 (+https://varselliste-no.web.app)";

export function userAgent(): string {
  return process.env.INGEST_USER_AGENT || DEFAULT_USER_AGENT;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(`HTTP ${status} for ${url}: ${body.slice(0, 200)}`);
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface FetchOptions {
  method?: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Total attempts including the first one. */
  attempts?: number;
}

export interface TextResponse {
  status: number;
  text: string;
  headers: Headers;
}

/**
 * Fetch text with timeout and a small backoff. 304 is returned as-is (conditional
 * requests). 4xx responses (except 429) are not retried — retrying would only add
 * load on the source.
 */
export async function fetchText(url: string, opts: FetchOptions = {}): Promise<TextResponse> {
  const attempts = opts.attempts ?? 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        body: opts.body,
        headers: { "User-Agent": userAgent(), "Accept-Encoding": "gzip", ...opts.headers },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
      });
      const text = await res.text();
      if (res.ok || res.status === 304) return { status: res.status, text, headers: res.headers };
      const err = new HttpError(res.status, url, text);
      if (res.status !== 429 && res.status < 500) throw err;
      lastError = err;
    } catch (err) {
      if (err instanceof HttpError && err.status !== 429 && err.status < 500) throw err;
      lastError = err;
    }
    if (attempt < attempts) await sleep(2_000 * 2 ** (attempt - 1));
  }
  throw withCause(url, lastError);
}

/** Node's fetch reports network errors as "fetch failed"; keep the underlying code (ETIMEDOUT …). */
function withCause(url: string, err: unknown): unknown {
  if (!(err instanceof Error) || err instanceof HttpError) return err;
  const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
  const detail = cause?.code ?? cause?.message ?? (err.name === "TimeoutError" ? "timeout" : null);
  return detail ? new Error(`${err.message} (${detail}) for ${new URL(url).host}`) : err;
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const res = await fetchText(url, { ...opts, headers: { Accept: "application/json", ...opts.headers } });
  return JSON.parse(res.text) as T;
}
