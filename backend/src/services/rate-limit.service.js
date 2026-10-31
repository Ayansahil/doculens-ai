import { limits } from '../config/limits.js';
import { getRateStore } from './rate-store.service.js';

export const msUntilNextUtcMidnight = (nowMs = Date.now()) => {
  const date = new Date(nowMs);
  const next = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
  );
  return Math.max(1000, next - nowMs);
};

export const utcDateKey = (nowMs = Date.now()) =>
  new Date(nowMs).toISOString().slice(0, 10);

/**
 * Daily AI quota, keyed by the verified user id. Only requests that are
 * actually allowed increment the counter. `limit = 0` means unlimited
 * (configurable, but not recommended for a public deployment).
 */
export const createQuotaService = ({
  store,
  now = Date.now,
  limit = limits.aiDailyRequestQuota,
  scope = 'ai-daily',
} = {}) => {
  if (!store) throw new Error('createQuotaService requires a rate store');

  const keyFor = (userId, nowMs) =>
    `${scope}:${userId}:${utcDateKey(nowMs)}`;

  return {
    scope,
    limit,

    async consume(userId) {
      if (!userId) throw new Error('Quota requires an authenticated user id');

      if (limit <= 0) {
        return {
          allowed: true,
          unlimited: true,
          limit: 0,
          used: 0,
          remaining: null,
          retryAfter: 0,
          resetAt: null,
        };
      }

      const current = now();
      const ttlMs = msUntilNextUtcMidnight(current);
      const result = await store.consume(keyFor(userId, current), limit, ttlMs);

      return {
        allowed: result.allowed,
        unlimited: false,
        limit,
        used: result.count,
        remaining: Math.max(0, limit - result.count),
        retryAfter: Math.max(1, Math.ceil(result.ttlMs / 1000)),
        resetAt: new Date(current + result.ttlMs).toISOString(),
      };
    },

    async peek(userId) {
      if (!userId) throw new Error('Quota requires an authenticated user id');

      if (limit <= 0) {
        return {
          unlimited: true,
          limit: 0,
          used: 0,
          remaining: null,
          retryAfter: 0,
          resetAt: null,
        };
      }

      const current = now();
      const ttlMs = msUntilNextUtcMidnight(current);
      const result = await store.peek(keyFor(userId, current));
      const used = Math.min(result.count, limit);
      const effectiveTtl = result.ttlMs > 0 ? result.ttlMs : ttlMs;

      return {
        unlimited: false,
        limit,
        used,
        remaining: Math.max(0, limit - used),
        retryAfter: Math.max(1, Math.ceil(effectiveTtl / 1000)),
        resetAt: new Date(current + effectiveTtl).toISOString(),
      };
    },
  };
};

let singleton = null;

export const getQuotaService = () => {
  if (!singleton) {
    singleton = (async () =>
      createQuotaService({
        store: await getRateStore(),
        limit: limits.aiDailyRequestQuota,
      }))();
  }
  return singleton;
};

export const resetQuotaServiceForTests = () => {
  singleton = null;
};
