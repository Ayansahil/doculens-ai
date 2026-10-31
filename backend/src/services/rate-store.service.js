import { limits } from '../config/limits.js';

/**
 * Shared rate-limit/lock store.
 *
 * - `memory` (default): correct for local development and single-process
 *   deployments. Counters and locks are per process.
 * - `redis`: used automatically when REDIS_URL is set. Required for multiple
 *   Node instances to share rate-limit windows, daily quotas and locks.
 *
 * If Redis is configured but unreachable, the store falls back to memory so
 * the API keeps serving and still enforces limits locally. That is a
 * deliberate availability trade-off; see RATE_LIMITING.md.
 */

const CLEANUP_INTERVAL_MS = 60_000;

const normalizeTtl = (ttlMs, fallbackTtlMs) => {
  const value = Number(ttlMs);
  if (!Number.isFinite(value) || value <= 0) return fallbackTtlMs;
  return value;
};

export const createMemoryStore = ({ now = Date.now } = {}) => {
  const counters = new Map();
  const locks = new Map();

  const timer = setInterval(() => {
    const current = now();
    for (const [key, entry] of counters) {
      if (entry.expiresAt <= current) counters.delete(key);
    }
    for (const [key, entry] of locks) {
      if (entry.expiresAt <= current) locks.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
  timer.unref?.();

  const store = {
    kind: 'memory',

    async consume(key, limit, ttlMs) {
      const current = now();
      const max = Math.max(1, Number(limit) || 1);
      const ttl = normalizeTtl(ttlMs, 60_000);
      let entry = counters.get(key);

      if (!entry || entry.expiresAt <= current) {
        entry = { count: 0, expiresAt: current + ttl };
        counters.set(key, entry);
      }

      if (entry.count >= max) {
        return {
          allowed: false,
          count: entry.count,
          ttlMs: Math.max(1, entry.expiresAt - current),
        };
      }

      entry.count += 1;
      return {
        allowed: true,
        count: entry.count,
        ttlMs: Math.max(1, entry.expiresAt - current),
      };
    },

    async peek(key) {
      const current = now();
      const entry = counters.get(key);
      if (!entry || entry.expiresAt <= current) {
        counters.delete(key);
        return { count: 0, ttlMs: 0 };
      }
      return {
        count: entry.count,
        ttlMs: Math.max(1, entry.expiresAt - current),
      };
    },

    async setNx(key, ttlMs, value) {
      const current = now();
      const existing = locks.get(key);
      if (existing && existing.expiresAt > current) return false;
      locks.set(key, {
        value: String(value),
        expiresAt: current + normalizeTtl(ttlMs, 60_000),
      });
      return true;
    },

    async release(key, value) {
      const existing = locks.get(key);
      if (!existing) return false;
      if (existing.expiresAt <= now()) {
        locks.delete(key);
        return false;
      }
      if (existing.value !== String(value)) return false;
      locks.delete(key);
      return true;
    },

    async del(key) {
      const removedCounter = counters.delete(key);
      const removedLock = locks.delete(key);
      return removedCounter || removedLock;
    },

    async close() {
      clearInterval(timer);
      counters.clear();
      locks.clear();
    },

    _debugSize() {
      return { counters: counters.size, locks: locks.size };
    },
  };

  return store;
};

const CONSUME_LUA = `
local current = redis.call('GET', KEYS[1])
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local count = tonumber(current) or 0

local pttl = redis.call('PTTL', KEYS[1])
if pttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ttl)
  pttl = ttl
end

if count >= limit then
  return {0, count, pttl}
end

count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ttl)
  pttl = ttl
end

return {1, count, pttl}
`;

const RELEASE_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

const createRedisStore = (client, { prefix, memory, logger }) => {
  let healthy = true;
  let warned = false;

  const prefixed = (key) => `${prefix}${key}`;

  client.on?.('ready', () => {
    healthy = true;
  });
  client.on?.('error', (error) => {
    if (healthy && !warned) {
      warned = true;
      logger.warn(
        `[rate-limit] Redis error (${error?.message || error}); using local memory fallback until Redis is ready.`,
      );
    }
    healthy = false;
  });

  const run = async (operation, fallback) => {
    if (!healthy) return fallback();
    try {
      return await operation();
    } catch (error) {
      healthy = false;
      logger.warn(
        `[rate-limit] Redis command failed (${error?.message || error}); using local memory fallback.`,
      );
      return fallback();
    }
  };

  const store = {
    kind: 'redis',
    get degraded() {
      return !healthy;
    },

    consume(key, limit, ttlMs) {
      const ttl = normalizeTtl(ttlMs, 60_000);
      return run(
        async () => {
          const [allowed, count, pttl] = await client.eval(
            CONSUME_LUA,
            1,
            prefixed(key),
            String(Math.max(1, Number(limit) || 1)),
            String(ttl),
          );
          return {
            allowed: Number(allowed) === 1,
            count: Number(count),
            ttlMs: Math.max(1, Number(pttl) || ttl),
          };
        },
        () => memory.consume(key, limit, ttlMs),
      );
    },

    peek(key) {
      return run(
        async () => {
          const [count, pttl] = await Promise.all([
            client.get(prefixed(key)),
            client.pttl(prefixed(key)),
          ]);
          return {
            count: Number(count) || 0,
            ttlMs: Math.max(0, Number(pttl) || 0),
          };
        },
        () => memory.peek(key),
      );
    },

    setNx(key, ttlMs, value) {
      const ttl = normalizeTtl(ttlMs, 60_000);
      return run(
        async () => {
          const result = await client.set(
            prefixed(key),
            String(value),
            'PX',
            ttl,
            'NX',
          );
          return result === 'OK';
        },
        () => memory.setNx(key, ttl, value),
      );
    },

    release(key, value) {
      return run(
        async () => Number(await client.eval(RELEASE_LUA, 1, prefixed(key), String(value))) === 1,
        () => memory.release(key, value),
      );
    },

    del(key) {
      return run(
        async () => Number(await client.del(prefixed(key))) > 0,
        () => memory.del(key),
      );
    },

    async close() {
      try {
        await client.quit();
      } catch {
        try {
          client.disconnect();
        } catch {
          // ignore shutdown errors
        }
      }
    },
  };

  return store;
};

const withTimeout = (promise, timeoutMs, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

export const createRateStore = async ({
  redisUrl = '',
  redisFactory = null,
  prefix = '',
  connectTimeoutMs = 1500,
  logger = console,
  now = Date.now,
} = {}) => {
  const memory = createMemoryStore({ now });

  if (!redisUrl) return memory;

  let client = null;
  try {
    const RedisCtor =
      redisFactory || (await import('ioredis')).default;
    client = new RedisCtor(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: connectTimeoutMs,
      retryStrategy: (times) => (times > 3 ? null : Math.min(200 * times, 1000)),
    });

    // ioredis emits an 'error' event during connection failures. Without a
    // listener EventEmitter would throw before we reach the try/catch below.
    client.on?.('error', () => {});

    await withTimeout(client.connect(), connectTimeoutMs, 'Redis connect');
    await withTimeout(client.ping(), connectTimeoutMs, 'Redis ping');

    logger.info?.(`[rate-limit] Using Redis store at ${redisUrl.replace(/\/\/.*@/, '//***@')}`);
    return createRedisStore(client, { prefix, memory, logger });
  } catch (error) {
    logger.warn(
      `[rate-limit] Redis unavailable (${error?.message || error}); falling back to in-memory limits.`,
    );
    try {
      client?.disconnect();
    } catch {
      // ignore
    }
    return memory;
  }
};

let singletonPromise = null;

export const getRateStore = () => {
  if (!singletonPromise) {
    singletonPromise = createRateStore({
      redisUrl: limits.redisUrl,
      prefix: limits.redisKeyPrefix,
      connectTimeoutMs: limits.redisConnectTimeoutMs,
    });
  }
  return singletonPromise;
};

export const resetRateStoreForTests = async () => {
  if (!singletonPromise) return;
  try {
    const store = await singletonPromise;
    await store.close?.();
  } catch {
    // ignore
  }
  singletonPromise = null;
};
