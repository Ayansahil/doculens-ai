import fetch from "node-fetch";
import { limits } from "../config/limits.js";
import {
  classifyProviderResponse,
  computeBackoffMs,
  isAbortError,
  isQuotaErrorBody,
  parseRetryAfterMs,
  sleep,
} from "../utils/retry.js";

/**
 * Error thrown only when no HTTP response could be obtained (network error,
 * timeout) or the provider is not configured. HTTP error responses are
 * returned to the caller as `{ ok: false, status, raw }` so each feature can
 * keep its existing, user-friendly error mapping.
 */
export class AiClientError extends Error {
  constructor(
    message,
    { status = 502, code = "AI_PROVIDER_ERROR", retryAfter = null, attempts = 0, cause = null } = {},
  ) {
    super(message);
    this.name = "AiClientError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    this.attempts = attempts;
    if (cause) this.cause = cause;
  }
}

/**
 * POST JSON to an AI provider with bounded retries and a hard overall
 * deadline. Retries network errors, timeouts, 408/425/5xx and transient 429s.
 * Provider quota/credit 429s and other 4xx responses are never retried.
 */
export const postJson = async ({
  url,
  apiKey,
  body,
  headers = {},
  timeoutMs = limits.chatProviderTimeoutMs,
  deadlineMs = limits.chatAiDeadlineMs,
  maxRetries = limits.aiMaxRetries,
  retryBaseMs = limits.aiRetryBaseMs,
  retryMaxDelayMs = limits.aiRetryMaxDelayMs,
  label = "AI provider",
  fetchImpl = fetch,
  logger = console,
  random = Math.random,
  sleepImpl = sleep,
} = {}) => {
  if (!apiKey) {
    throw new AiClientError(
      "The AI service is not configured. Please contact support.",
      { status: 503, code: "PROVIDER_NOT_CONFIGURED" },
    );
  }

  const attemptsAllowed = Math.max(1, Number(maxRetries) + 1 || 1);
  const overallDeadline = Date.now() + Math.max(1000, Number(deadlineMs) || timeoutMs);
  let attempts = 0;
  let lastNetworkError = null;

  const buildHeaders = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...headers,
  };

  while (attempts < attemptsAllowed) {
    const remainingMs = overallDeadline - Date.now();
    if (remainingMs <= 0) break;

    attempts += 1;
    const controller = new AbortController();
    const attemptBudget = Math.max(1, Math.min(timeoutMs, remainingMs));
    const timer = setTimeout(() => controller.abort(), attemptBudget);

    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: buildHeaders,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const raw = await response.text().catch(() => "");
      const retryAfterMs = parseRetryAfterMs(response.headers);
      const result = {
        ok: Boolean(response.ok),
        status: response.status,
        raw,
        attempts,
        retryAfterMs,
      };

      if (result.ok) return result;

      const classification = classifyProviderResponse(
        response.status,
        raw,
      );
      const hasAttemptsLeft = attempts < attemptsAllowed;

      if (classification !== "retry" || !hasAttemptsLeft) {
        if (response.status === 429 && isQuotaErrorBody(raw)) {
          result.quotaExhausted = true;
        }
        return result;
      }

      const delay = retryAfterMs ??
        computeBackoffMs(attempts, {
          baseMs: retryBaseMs,
          maxMs: retryMaxDelayMs,
          random,
        });

      if (Date.now() + delay >= overallDeadline) return result;

      logger?.warn?.(
        `[ai] ${label} returned HTTP ${response.status}; retry ${attempts}/${maxRetries} in ${delay}ms`,
      );
      await sleepImpl(delay);
    } catch (error) {
      const timedOut = isAbortError(error) || controller.signal.aborted;
      lastNetworkError = new AiClientError(
        timedOut
          ? "The AI provider is responding slowly right now. Please try again in a moment."
          : "Could not reach the AI provider. Please try again.",
        {
          status: timedOut ? 504 : 502,
          code: timedOut ? "AI_TIMEOUT" : "AI_UNREACHABLE",
          attempts,
          cause: error,
        },
      );

      const hasAttemptsLeft = attempts < attemptsAllowed;
      if (!hasAttemptsLeft) break;

      const delay = computeBackoffMs(attempts, {
        baseMs: retryBaseMs,
        maxMs: retryMaxDelayMs,
        random,
      });
      if (Date.now() + delay >= overallDeadline) break;

      logger?.warn?.(
        `[ai] ${label} ${timedOut ? "timed out" : "network error"}; retry ${attempts}/${maxRetries} in ${delay}ms`,
      );
      await sleepImpl(delay);
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastNetworkError) {
    lastNetworkError.attempts = attempts;
    throw lastNetworkError;
  }

  throw new AiClientError(
    "The AI provider is responding slowly right now. Please try again in a moment.",
    { status: 504, code: "AI_TIMEOUT", attempts },
  );
};

export const extractUsage = (raw) => {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const usage = parsed?.usage;
    if (!usage || typeof usage !== "object") return null;

    const toInt = (value) => {
      const number = Number(value);
      return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
    };

    const promptTokens = toInt(usage.prompt_tokens);
    const completionTokens = toInt(usage.completion_tokens);
    const totalTokens =
      toInt(usage.total_tokens) ??
      (promptTokens !== null || completionTokens !== null
        ? (promptTokens || 0) + (completionTokens || 0)
        : null);

    if (promptTokens === null && completionTokens === null && totalTokens === null) {
      return null;
    }

    return { promptTokens, completionTokens, totalTokens };
  } catch {
    return null;
  }
};
