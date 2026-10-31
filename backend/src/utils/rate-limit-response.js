const seconds = (ms) => Math.max(1, Math.ceil(Number(ms) / 1000));

/**
 * Standard rate-limit headers (IETF draft names) plus the widely supported
 * Retry-After header on 429 responses.
 */
export const setRateLimitHeaders = (
  res,
  { limit, info, scope, windowMs },
) => {
  const remaining = Math.max(0, Number(limit) - Number(info.count));
  const reset = seconds(info.ttlMs);

  res.set('RateLimit-Limit', String(limit));
  res.set('RateLimit-Remaining', String(remaining));
  res.set('RateLimit-Reset', String(reset));
  if (scope) res.set('RateLimit-Policy', `${scope};w=${Math.round(windowMs / 1000)}`);
  return { remaining, reset };
};

/**
 * Sends a consistent 429 body. Never includes keys, prompts, other users or
 * provider internals.
 */
export const sendRateLimited = (
  res,
  {
    code = 'RATE_LIMITED',
    message = 'Too many requests. Please try again later.',
    info,
    limit,
    scope,
    windowMs,
    quota = null,
  },
) => {
  const retryAfter = seconds(info?.ttlMs ?? windowMs ?? 1000);
  const resetAt = new Date(
    Date.now() + (Number(info?.ttlMs) || Number(windowMs) || 1000),
  ).toISOString();

  setRateLimitHeaders(res, { limit, info, scope, windowMs });
  res.set('Retry-After', String(retryAfter));

  const body = {
    success: false,
    status: 429,
    code,
    message,
    retryAfter,
    resetAt,
  };

  if (scope && limit) {
    body.limit = {
      scope,
      max: limit,
      windowSeconds: Math.max(1, Math.round(windowMs / 1000)),
      remaining: 0,
      resetAt,
    };
  }

  if (quota) {
    body.quota = {
      limit: quota.limit,
      used: quota.used,
      remaining: quota.remaining,
      resetAt: quota.resetAt,
    };
  }

  return res.status(429).json(body);
};

export const setQuotaHeaders = (res, quota) => {
  if (!quota || quota.unlimited) return;
  res.set('X-AI-Quota-Limit', String(quota.limit));
  res.set('X-AI-Quota-Remaining', String(quota.remaining));
  if (quota.resetAt) res.set('X-AI-Quota-Reset', quota.resetAt);
};
