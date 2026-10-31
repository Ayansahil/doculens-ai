// ============================================================
// DocuLens AI — Rate limiting, AI quota, locks and retry tests
//
// Run with:  node --test test_rate_limiting.mjs
//
// These tests are hermetic: no Redis, no live AI provider, no Supabase
// network calls. They exercise the production services/middleware directly.
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import {
  createMemoryStore,
  createRateStore,
} from "./src/services/rate-store.service.js";
import { createQuotaService } from "./src/services/rate-limit.service.js";
import {
  createAuthFailureGuard,
  createRateLimitMiddleware,
} from "./src/middleware/rate-limit.middleware.js";
import { createLockService } from "./src/services/lock.service.js";
import { createAiUsageService } from "./src/services/ai-usage.service.js";
import {
  classifyProviderResponse,
  computeBackoffMs,
  isRetryableStatus,
} from "./src/utils/retry.js";
import {
  AiClientError,
  extractUsage,
  postJson,
} from "./src/services/ai-client.service.js";

const silentLogger = { warn() {}, info() {}, error() {} };

const startServer = async (app) => {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}`,
  };
};

const stopServer = (server) =>
  new Promise((resolve) => server.close(() => resolve()));

const fakeResponse = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get: (name) => headers[String(name).toLowerCase()] ?? null,
  },
  text: async () => body,
});

// ------------------------------------------------------------------
// Store
// ------------------------------------------------------------------

test("memory store enforces a fixed window and resets after TTL", async () => {
  let now = 1000;
  const store = createMemoryStore({ now: () => now });

  const first = await store.consume("k", 2, 60_000);
  const second = await store.consume("k", 2, 60_000);
  const third = await store.consume("k", 2, 60_000);

  assert.equal(first.allowed, true);
  assert.equal(first.count, 1);
  assert.equal(second.allowed, true);
  assert.equal(second.count, 2);
  assert.equal(third.allowed, false);
  assert.equal(third.count, 2);
  assert.ok(third.ttlMs > 0);

  now += 60_001;
  const afterReset = await store.consume("k", 2, 60_000);
  assert.equal(afterReset.allowed, true);
  assert.equal(afterReset.count, 1);

  await store.close();
});

test("Redis-unavailable configuration falls back to memory", async () => {
  const failingFactory = function failingRedis() {
    throw new Error("connect ECONNREFUSED 127.0.0.1:6399");
  };

  const store = await createRateStore({
    redisUrl: "redis://127.0.0.1:6399",
    redisFactory: failingFactory,
    connectTimeoutMs: 200,
    logger: silentLogger,
  });

  assert.equal(store.kind, "memory");
  const result = await store.consume("fallback", 1, 1000);
  assert.equal(result.allowed, true);
  await store.close();
});

test("runtime Redis command failures degrade to local memory", async () => {
  const failingClient = {
    on() {
      return this;
    },
    async connect() {},
    async ping() {
      return "PONG";
    },
    async eval() {
      throw new Error("redis connection lost");
    },
    async get() {
      throw new Error("redis connection lost");
    },
    async pttl() {
      throw new Error("redis connection lost");
    },
    async set() {
      throw new Error("redis connection lost");
    },
    async del() {
      throw new Error("redis connection lost");
    },
    async quit() {},
    disconnect() {},
  };

  const store = await createRateStore({
    redisUrl: "redis://fake:6379",
    redisFactory: function fakeFactory() {
      return failingClient;
    },
    connectTimeoutMs: 200,
    logger: silentLogger,
  });

  assert.equal(store.kind, "redis");
  const result = await store.consume("degraded", 1, 1000);
  assert.equal(result.allowed, true);
  assert.equal(store.degraded, true);
  await store.close();
});

// ------------------------------------------------------------------
// HTTP middleware
// ------------------------------------------------------------------

test("HTTP limiter allows normal traffic then returns a clear 429", async () => {
  const store = createMemoryStore();
  const app = express();
  app.set("trust proxy", true);
  app.use(
    createRateLimitMiddleware({
      store,
      scope: "test-http",
      limit: 2,
      windowMs: 60_000,
      keyGenerator: (req) => `ip:${req.ip}`,
    }),
  );
  app.get("/limited", (req, res) => res.json({ ok: true }));

  const { server, url } = await startServer(app);
  try {
    const first = await fetch(`${url}/limited`, {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("ratelimit-limit"), "2");
    assert.equal(first.headers.get("ratelimit-remaining"), "1");

    const second = await fetch(`${url}/limited`, {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });
    assert.equal(second.status, 200);
    assert.equal(second.headers.get("ratelimit-remaining"), "0");

    const third = await fetch(`${url}/limited`, {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });
    assert.equal(third.status, 429);
    assert.ok(Number(third.headers.get("retry-after")) >= 1);

    const body = await third.json();
    assert.equal(body.success, false);
    assert.equal(body.status, 429);
    assert.equal(body.code, "RATE_LIMITED");
    assert.ok(body.retryAfter >= 1);
    assert.equal(body.limit.scope, "test-http");
  } finally {
    await stopServer(server);
    await store.close();
  }
});

test("per-user limits are isolated and ignore client-supplied user ids", async () => {
  const store = createMemoryStore();
  const app = express();
  app.set("trust proxy", true);
  app.use((req, res, next) => {
    const token = req.headers.authorization || "";
    if (token === "Bearer token-a") req.user = { id: "user-a" };
    if (token === "Bearer token-b") req.user = { id: "user-b" };
    next();
  });
  app.use(
    createRateLimitMiddleware({
      store,
      scope: "test-user",
      limit: 2,
      windowMs: 60_000,
      keyGenerator: (req) =>
        req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`,
    }),
  );
  app.get("/user-limited", (req, res) => res.json({ ok: true }));

  const { server, url } = await startServer(app);
  try {
    const call = (token, spoofedUserId) =>
      fetch(`${url}/user-limited`, {
        headers: {
          authorization: `Bearer ${token}`,
          "x-forwarded-for": "203.0.113.20",
          ...(spoofedUserId ? { "x-user-id": spoofedUserId } : {}),
        },
      });

    assert.equal((await call("token-a", "user-b")).status, 200);
    assert.equal((await call("token-a", "user-b")).status, 200);

    // Spoofing a different user id must NOT grant a fresh bucket.
    const blocked = await call("token-a", "user-b");
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).limit.scope, "test-user");

    // A different verified user still has their own budget.
    assert.equal((await call("token-b")).status, 200);
    assert.equal((await call("token-b")).status, 200);
  } finally {
    await stopServer(server);
    await store.close();
  }
});

test("failed authentication attempts are IP-limited", async () => {
  const store = createMemoryStore();
  const guard = createAuthFailureGuard({
    store,
    limit: 2,
    windowMs: 60_000,
  });

  const app = express();
  app.set("trust proxy", true);
  app.post("/auth", async (req, res) => {
    const allowed = await guard(req, res);
    if (!allowed) return;
    res.status(401).json({ success: false, message: "Invalid token" });
  });

  const { server, url } = await startServer(app);
  try {
    const request = () =>
      fetch(`${url}/auth`, {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.30" },
      });

    assert.equal((await request()).status, 401);
    assert.equal((await request()).status, 401);

    const blocked = await request();
    assert.equal(blocked.status, 429);
    const body = await blocked.json();
    assert.equal(body.code, "AUTH_RATE_LIMITED");
    assert.ok(body.retryAfter >= 1);
  } finally {
    await stopServer(server);
    await store.close();
  }
});

test("unauthenticated requests do not consume another user's bucket", async () => {
  const store = createMemoryStore();

  const userLimit = createRateLimitMiddleware({
    store,
    scope: "test-mixed",
    limit: 1,
    windowMs: 60_000,
    keyGenerator: (req) =>
      req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`,
  });

  const app = express();
  app.set("trust proxy", true);
  app.use((req, res, next) => {
    if (req.headers.authorization === "Bearer token-a") {
      req.user = { id: "user-a" };
    }
    next();
  });
  app.get("/mixed", userLimit, (req, res) => res.json({ ok: true }));

  const { server, url } = await startServer(app);
  try {
    const authed = await fetch(`${url}/mixed`, {
      headers: {
        authorization: "Bearer token-a",
        "x-forwarded-for": "203.0.113.40",
      },
    });
    assert.equal(authed.status, 200);

    const unauthenticated = await fetch(`${url}/mixed`, {
      headers: { "x-forwarded-for": "203.0.113.40" },
    });
    assert.equal(unauthenticated.status, 200);

    const userBlocked = await fetch(`${url}/mixed`, {
      headers: {
        authorization: "Bearer token-a",
        "x-forwarded-for": "203.0.113.40",
      },
    });
    assert.equal(userBlocked.status, 429);
  } finally {
    await stopServer(server);
    await store.close();
  }
});

// ------------------------------------------------------------------
// Daily quota
// ------------------------------------------------------------------

test("daily AI quota is per user, enforced, and resets by UTC date", async () => {
  let now = Date.UTC(2026, 0, 1, 12, 0, 0);
  const store = createMemoryStore({ now: () => now });
  const quota = createQuotaService({
    store,
    limit: 2,
    now: () => now,
  });

  const first = await quota.consume("user-a");
  const second = await quota.consume("user-a");
  const third = await quota.consume("user-a");

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfter >= 1);

  const peeked = await quota.peek("user-a");
  assert.equal(peeked.used, 2);
  assert.equal(peeked.remaining, 0);

  const otherUser = await quota.consume("user-b");
  assert.equal(otherUser.allowed, true);
  assert.equal(otherUser.remaining, 1);

  // Next UTC day starts a fresh counter.
  now = Date.UTC(2026, 0, 2, 0, 0, 1);
  const nextDay = await quota.consume("user-a");
  assert.equal(nextDay.allowed, true);
  assert.equal(nextDay.used, 1);

  await store.close();
});

test("quota 0 means unlimited and is reported explicitly", async () => {
  const store = createMemoryStore();
  const quota = createQuotaService({ store, limit: 0 });

  for (let i = 0; i < 5; i += 1) {
    const result = await quota.consume("user-a");
    assert.equal(result.allowed, true);
    assert.equal(result.unlimited, true);
  }

  await store.close();
});

// ------------------------------------------------------------------
// Duplicate analysis lock
// ------------------------------------------------------------------

test("analysis lock prevents duplicate work and releases safely", async () => {
  const store = createMemoryStore();
  const locks = createLockService({ store, keyPrefix: "test-lock" });

  const first = await locks.acquire("risk:doc-1", { ttlMs: 60_000 });
  assert.equal(first.acquired, true);

  const duplicate = await locks.acquire("risk:doc-1", { ttlMs: 60_000 });
  assert.equal(duplicate.acquired, false);
  assert.ok(duplicate.retryAfter >= 1);

  // A different owner cannot release someone else's lock.
  assert.equal(await store.release("test-lock:risk:doc-1", "wrong-token"), false);
  assert.equal(first.acquired, true);

  assert.equal(await first.release(), true);
  assert.equal(await first.release(), false);

  const afterRelease = await locks.acquire("risk:doc-1", { ttlMs: 60_000 });
  assert.equal(afterRelease.acquired, true);
  await afterRelease.release();

  await store.close();
});

test("withLock reports a conflict instead of running duplicate work", async () => {
  const store = createMemoryStore();
  const locks = createLockService({ store, keyPrefix: "test-with-lock" });

  let releaseGate;
  const gate = new Promise((resolve) => {
    releaseGate = resolve;
  });

  const firstRun = locks.withLock("risk:doc-2", async () => {
    await gate;
    return "first";
  });

  await new Promise((resolve) => setImmediate(resolve));

  const duplicate = await locks.withLock("risk:doc-2", async () => "second");
  assert.equal(duplicate.acquired, false);
  assert.equal(duplicate.result, null);

  releaseGate();
  const finished = await firstRun;
  assert.equal(finished.acquired, true);
  assert.equal(finished.result, "first");

  const next = await locks.withLock("risk:doc-2", async () => "next");
  assert.equal(next.acquired, true);
  assert.equal(next.result, "next");

  await store.close();
});

// ------------------------------------------------------------------
// Retry behaviour
// ------------------------------------------------------------------

test("retry classification never retries quota or non-retryable 4xx", () => {
  assert.equal(isRetryableStatus(408), true);
  assert.equal(isRetryableStatus(429), true);
  assert.equal(isRetryableStatus(500), true);
  assert.equal(isRetryableStatus(503), true);
  assert.equal(isRetryableStatus(400), false);
  assert.equal(isRetryableStatus(401), false);
  assert.equal(isRetryableStatus(404), false);

  assert.equal(classifyProviderResponse(200, ""), "success");
  assert.equal(
    classifyProviderResponse(429, "free-models-per-day quota exceeded"),
    "fatal",
  );
  assert.equal(classifyProviderResponse(429, "temporary rate limit"), "retry");
  assert.equal(classifyProviderResponse(503, "down"), "retry");
  assert.equal(classifyProviderResponse(400, "bad request"), "fatal");
  assert.equal(classifyProviderResponse(402, "credits"), "fatal");
});

test("backoff grows exponentially and is jittered", () => {
  const delays = [1, 2, 3, 4].map((attempt) =>
    computeBackoffMs(attempt, {
      baseMs: 100,
      maxMs: 1000,
      jitter: 0,
      random: () => 0.5,
    }),
  );
  assert.deepEqual(delays, [100, 200, 400, 800]);

  const capped = computeBackoffMs(10, {
    baseMs: 100,
    maxMs: 1000,
    jitter: 0,
  });
  assert.equal(capped, 1000);
});

test("AI client retries transient 5xx and returns the successful response", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return fakeResponse(503, "temporarily unavailable");
    return fakeResponse(
      200,
      JSON.stringify({ usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 } }),
    );
  };

  const result = await postJson({
    url: "https://provider.invalid/chat",
    apiKey: "test-key",
    body: { hello: "world" },
    fetchImpl,
    sleepImpl: async () => {},
    maxRetries: 2,
    timeoutMs: 1000,
    deadlineMs: 10_000,
    retryBaseMs: 10,
    random: () => 0.5,
    logger: silentLogger,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.attempts, 2);
  assert.equal(calls, 2);
  assert.deepEqual(extractUsage(result.raw), {
    promptTokens: 4,
    completionTokens: 6,
    totalTokens: 10,
  });
});

test("AI client does not retry provider quota 429 responses", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return fakeResponse(
      429,
      JSON.stringify({
        error: { message: "free-models-per-day limit reached", code: 429 },
      }),
    );
  };

  const result = await postJson({
    url: "https://provider.invalid/chat",
    apiKey: "test-key",
    body: {},
    fetchImpl,
    sleepImpl: async () => {},
    maxRetries: 3,
    timeoutMs: 1000,
    deadlineMs: 10_000,
    logger: silentLogger,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 429);
  assert.equal(result.attempts, 1);
  assert.equal(result.quotaExhausted, true);
  assert.equal(calls, 1);
});

test("AI client does not retry a non-retryable 400", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return fakeResponse(400, "invalid request");
  };

  const result = await postJson({
    url: "https://provider.invalid/chat",
    apiKey: "test-key",
    body: {},
    fetchImpl,
    sleepImpl: async () => {},
    maxRetries: 3,
    timeoutMs: 1000,
    deadlineMs: 10_000,
    logger: silentLogger,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(calls, 1);
});

test("AI client retries network errors and stops at the attempt cap", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error("ECONNRESET");
  };

  await assert.rejects(
    postJson({
      url: "https://provider.invalid/chat",
      apiKey: "test-key",
      body: {},
      fetchImpl,
      sleepImpl: async () => {},
      maxRetries: 2,
      timeoutMs: 1000,
      deadlineMs: 10_000,
      retryBaseMs: 10,
      random: () => 0.5,
      logger: silentLogger,
    }),
    (error) => {
      assert.ok(error instanceof AiClientError);
      assert.equal(error.code, "AI_UNREACHABLE");
      assert.equal(error.attempts, 3);
      return true;
    },
  );

  assert.equal(calls, 3);
});

test("AI client rejects missing provider configuration", async () => {
  await assert.rejects(
    postJson({
      url: "https://provider.invalid/chat",
      apiKey: "",
      body: {},
      fetchImpl: async () => fakeResponse(200, "{}"),
      sleepImpl: async () => {},
      logger: silentLogger,
    }),
    (error) => {
      assert.ok(error instanceof AiClientError);
      assert.equal(error.code, "PROVIDER_NOT_CONFIGURED");
      assert.equal(error.status, 503);
      return true;
    },
  );
});

// ------------------------------------------------------------------
// Usage audit
// ------------------------------------------------------------------

test("usage audit falls back to memory when the table is missing", async () => {
  const missingTable = {
    code: "PGRST205",
    message: "Could not find the table 'public.ai_usage_events' in the schema cache",
  };

  const chain = {
    insert: async () => ({ error: missingTable }),
    select() {
      return this;
    },
    eq() {
      return this;
    },
    gte() {
      return this;
    },
    order() {
      return this;
    },
    limit: async () => ({ data: null, error: missingTable }),
  };

  const service = createAiUsageService({
    client: { from: () => chain },
    logger: silentLogger,
    now: () => Date.UTC(2026, 0, 1, 12, 0, 0),
  });

  const recorded = await service.record({
    userId: "usage-user-a",
    kind: "chat",
    model: "test-model",
    status: "success",
    promptTokens: 4,
    completionTokens: 6,
    durationMs: 120,
  });
  assert.equal(recorded.persisted, false);
  assert.equal(recorded.fallback, true);

  await service.record({
    userId: "usage-user-b",
    kind: "risk",
    model: "test-model",
    status: "error",
    errorCode: "PROVIDER_ERROR",
  });

  const summary = await service.getSummary("usage-user-a", {
    quota: { limit: 50, used: 1, remaining: 49 },
  });

  assert.equal(summary.source, "memory");
  assert.equal(summary.totals.requests, 1);
  assert.equal(summary.totals.promptTokens, 4);
  assert.equal(summary.totals.completionTokens, 6);
  assert.equal(summary.totals.totalTokens, 10);
  assert.equal(summary.byKind.chat.requests, 1);
  assert.equal(summary.recent.length, 1);
  assert.equal(summary.recent[0].model, "test-model");
  assert.equal(summary.recent[0].user_id, undefined);
  assert.equal(summary.quota.limit, 50);

  // Another user's event never leaks into this summary.
  assert.equal(summary.byKind.risk, undefined);
});

test("usage audit persists metadata when the table exists", async () => {
  const inserted = [];
  const rows = [];

  const chain = {
    insert: async (event) => {
      inserted.push(event);
      rows.push(event);
      return { error: null };
    },
    select() {
      return this;
    },
    eq() {
      return this;
    },
    gte() {
      return this;
    },
    order() {
      return this;
    },
    limit: async () => ({ data: rows, error: null }),
  };

  const service = createAiUsageService({
    client: { from: () => chain },
    logger: silentLogger,
    now: () => Date.UTC(2026, 0, 1, 12, 0, 0),
  });

  const recorded = await service.record({
    userId: "usage-user-c",
    kind: "embedding",
    model: "embed-model",
    status: "success",
    requestCount: 3,
    totalTokens: 30,
  });

  assert.equal(recorded.persisted, true);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].request_count, 3);
  assert.equal(inserted[0].user_id, "usage-user-c");

  const summary = await service.getSummary("usage-user-c");
  assert.equal(summary.source, "database");
  assert.equal(summary.totals.requests, 3);
  assert.equal(summary.totals.totalTokens, 30);
  assert.equal(summary.byKind.embedding.requests, 3);
});
