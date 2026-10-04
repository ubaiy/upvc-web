/**
 * How the api answers (phase 9 log, section 1): success is
 * `{success: true, data, message}`; a refusal is HTTP 200 with
 * `{status: 0, message}`. A refusal's message is the api's own wording and is
 * shown as it is.
 */
export type Result<T> = { ok: true; data: T; message: string } | { ok: false; message: string; data?: any };

const GENERAL = 'Something went wrong. Try again.';

export function toResult<T>(res: any, map: (data: any) => T, fallback = GENERAL): Result<T> {
  if (res && res.success === true && res.data !== null && res.data !== undefined) {
    return { ok: true, data: map(res.data), message: res.message || '' };
  }
  return { ok: false, message: (res && typeof res.message === 'string' && res.message) || fallback, data: res?.data };
}

/** The api's reason when a request failed with one (404 for an unknown id), else the connection. */
export function httpMessage(error: any, what: string): string {
  const reason = error?.error?.message;
  return `${what} ${typeof reason === 'string' && reason ? reason : 'Check your connection.'}`;
}

/** `2026-10-05` for today, in local time (the api takes dates without a time). */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

export function idOrNull(value: unknown): number | null {
  const n = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(n) && n > 0 ? n : null;
}
