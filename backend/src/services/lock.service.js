import crypto from "node:crypto";
import { limits } from "../config/limits.js";
import { getRateStore } from "./rate-store.service.js";

/**
 * Short-lived distributed locks (Redis when REDIS_URL is set, otherwise the
 * in-process memory store). Used to deduplicate work such as running the same
 * document's risk analysis twice at once.
 *
 * Locks always carry a TTL and release only when the caller still owns the
 * token (compare-and-delete), so a slow/retried request cannot release another
 * request's lock.
 */
export const createLockService = ({
  store,
  keyPrefix = "lock",
  defaultTtlMs = limits.riskAnalysisLockTtlMs,
  logger = console,
} = {}) => {
  if (!store) throw new Error("createLockService requires a rate store");

  const keyFor = (key) => `${keyPrefix}:${key}`;

  const service = {
    async acquire(key, { ttlMs = defaultTtlMs, value = crypto.randomUUID() } = {}) {
      const ttl = Math.max(1000, Number(ttlMs) || defaultTtlMs);
      const acquired = await store.setNx(keyFor(key), ttl, value);

      if (!acquired) {
        return {
          acquired: false,
          retryAfter: Math.max(1, Math.ceil(ttl / 1000)),
        };
      }

      let released = false;
      return {
        acquired: true,
        value,
        retryAfter: 0,
        async release() {
          if (released) return false;
          released = true;
          try {
            return await store.release(keyFor(key), value);
          } catch (error) {
            logger?.warn?.(`[lock] release failed: ${error?.message || error}`);
            return false;
          }
        },
      };
    },

    async withLock(key, fn, options = {}) {
      const lock = await service.acquire(key, options);
      if (!lock.acquired) {
        return { acquired: false, retryAfter: lock.retryAfter, result: null };
      }

      try {
        return { acquired: true, retryAfter: 0, result: await fn() };
      } finally {
        await lock.release();
      }
    },
  };

  return service;
};

let singleton = null;

export const getLockService = () => {
  if (!singleton) {
    singleton = (async () =>
      createLockService({
        store: await getRateStore(),
      }))();
  }
  return singleton;
};

export const resetLockServiceForTests = () => {
  singleton = null;
};
