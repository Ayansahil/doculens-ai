/**
 * Small, dependency-free retry helpers.
 *
 * Rules used by the AI client:
 * - retry only transient failures (network errors, timeouts, 408/425/5xx and
 *   genuinely transient 429s)
 * - never retry provider quota / credit exhaustion 429s or other 4xx
 * - always cap attempts and honour an overall deadline
 */

export const sleep = (ms) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, ms));
    timer.unref?.();
  });

export const computeBackoffMs = (
  attempt,
  { baseMs = 500, maxMs = 4000, jitter = 0.2, random = Math.random } = {},
) => {
  const step = Math.max(1, Number(attempt) || 1);
  const exponential = Math.min(maxMs, baseMs * 2 ** (step - 1));
  const jitterAmount = exponential * jitter;
  const value = exponential - jitterAmount + random() * jitterAmount * 2;
  return Math.max(0, Math.round(value));
};

export const isRetryableStatus = (status) =>
  status === 408 || status === 425 || status === 429 || status >= 500;

const QUOTA_PATTERN =
  /free-models-per-day|daily quota|quota exceeded|quota exhausted|insufficient (?:credit|balance|funds)|out of credits|credit limit/i;

/**
 * Distinguishes a hard quota/credit failure (never retry) from a transient
 * provider rate limit (safe to retry once or twice).
 */
export const isQuotaErrorBody = (body) => QUOTA_PATTERN.test(String(body || ''));

export const classifyProviderResponse = (status, body = "") => {
  if (status >= 200 && status < 300) return "success";
  if (status === 429 && isQuotaErrorBody(body)) return "fatal";
  if (isRetryableStatus(status)) return "retry";
  return "fatal";
};

export const parseRetryAfterMs = (headers) => {
  if (!headers) return null;
  const raw =
    typeof headers.get === "function"
      ? headers.get("retry-after")
      : headers["retry-after"];
  if (!raw) return null;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);

  const dateMs = Date.parse(String(raw));
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
};

export const isAbortError = (error) =>
  error?.name === "AbortError" || error?.code === "ABORT_ERR";
