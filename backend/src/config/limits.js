import { createRequire } from 'node:module';

/**
 * Central, validated configuration for rate limiting, AI quotas and input
 * caps. Every value can be overridden with an environment variable; the
 * defaults below are conservative development values, not production
 * mandates. See backend/.env.example and RATE_LIMITING.md.
 */

const clampInt = (value, fallback, { min, max }) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const numberEnv = (env, name, fallback, bounds) =>
  clampInt(env[name], fallback, bounds);

const boolEnv = (env, name, fallback) => {
  const raw = String(env[name] ?? '').trim().toLowerCase();
  if (raw === '') return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
};

const trustProxyEnv = (value) => {
  const raw = String(value ?? '').trim();
  if (raw === '' || raw.toLowerCase() === 'false' || raw === '0') return false;
  if (raw.toLowerCase() === 'true') return true;
  if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10);
  return raw; // e.g. a subnet or comma-separated proxy list
};

const DEFAULT_AI_DAILY_QUOTA = 50;

export const loadLimits = (env = process.env) => ({
  env: env.NODE_ENV || 'development',

  // HTTP -------------------------------------------------------------------
  trustProxy: trustProxyEnv(env.TRUST_PROXY),
  maxJsonBody: env.MAX_JSON_BODY || '1mb',
  rateLimitEnabled: boolEnv(env, 'RATE_LIMIT_ENABLED', true),

  // Shared store -----------------------------------------------------------
  redisUrl: env.REDIS_URL || '',
  redisKeyPrefix: env.REDIS_KEY_PREFIX || 'doculens:',
  redisConnectTimeoutMs: numberEnv(env, 'REDIS_CONNECT_TIMEOUT_MS', 1500, {
    min: 100,
    max: 30000,
  }),

  // IP / public limits -----------------------------------------------------
  ipRateLimitMax: numberEnv(env, 'IP_RATE_LIMIT_MAX', 300, { min: 1, max: 1e6 }),
  ipRateLimitWindowMs:
    numberEnv(env, 'IP_RATE_LIMIT_WINDOW_SECONDS', 60, { min: 1, max: 86400 }) * 1000,

  publicRateLimitMax: numberEnv(env, 'PUBLIC_RATE_LIMIT_MAX', 120, {
    min: 1,
    max: 1e6,
  }),
  publicRateLimitWindowMs:
    numberEnv(env, 'PUBLIC_RATE_LIMIT_WINDOW_SECONDS', 60, {
      min: 1,
      max: 86400,
    }) * 1000,

  authFailureMax: numberEnv(env, 'AUTH_FAILURE_MAX', 20, { min: 1, max: 1e6 }),
  authFailureWindowMs:
    numberEnv(env, 'AUTH_FAILURE_WINDOW_SECONDS', 900, {
      min: 1,
      max: 7 * 86400,
    }) * 1000,

  // Per-user operation limits ---------------------------------------------
  uploadRateLimitMax: numberEnv(env, 'UPLOAD_RATE_LIMIT_MAX', 30, {
    min: 1,
    max: 1e6,
  }),
  uploadRateLimitWindowMs:
    numberEnv(env, 'UPLOAD_RATE_LIMIT_WINDOW_SECONDS', 3600, {
      min: 1,
      max: 7 * 86400,
    }) * 1000,

  chatRateLimitMax: numberEnv(env, 'CHAT_RATE_LIMIT_MAX', 20, {
    min: 1,
    max: 1e6,
  }),
  chatRateLimitWindowMs:
    numberEnv(env, 'CHAT_RATE_LIMIT_WINDOW_SECONDS', 60, {
      min: 1,
      max: 86400,
    }) * 1000,

  riskRateLimitMax: numberEnv(env, 'RISK_RATE_LIMIT_MAX', 10, {
    min: 1,
    max: 1e6,
  }),
  riskRateLimitWindowMs:
    numberEnv(env, 'RISK_RATE_LIMIT_WINDOW_SECONDS', 3600, {
      min: 1,
      max: 7 * 86400,
    }) * 1000,

  // Daily AI quota (0 = unlimited; not recommended in production) ---------
  aiDailyRequestQuota: numberEnv(
    env,
    'AI_DAILY_REQUEST_QUOTA',
    DEFAULT_AI_DAILY_QUOTA,
    { min: 0, max: 1e6 },
  ),

  // Duplicate-work locks ---------------------------------------------------
  riskAnalysisLockTtlMs:
    numberEnv(env, 'RISK_ANALYSIS_LOCK_TTL_SECONDS', 120, {
      min: 10,
      max: 3600,
    }) * 1000,
  analysisStaleMs:
    numberEnv(env, 'RISK_ANALYSIS_STALE_SECONDS', 120, {
      min: 10,
      max: 86400,
    }) * 1000,

  // Input caps -------------------------------------------------------------
  maxFileSizeBytes: numberEnv(env, 'MAX_FILE_SIZE', 50 * 1024 * 1024, {
    min: 1024,
    max: 500 * 1024 * 1024,
  }),
  maxExtractedTextChars: numberEnv(env, 'MAX_EXTRACTED_TEXT_CHARS', 2000000, {
    min: 1000,
    max: 50 * 1024 * 1024,
  }),
  maxDocumentChunks: numberEnv(env, 'MAX_DOCUMENT_CHUNKS', 150, {
    min: 1,
    max: 5000,
  }),
  maxChatMessageChars: numberEnv(env, 'MAX_CHAT_MESSAGE_CHARS', 4000, {
    min: 1,
    max: 100000,
  }),
  maxChatContextChars: numberEnv(env, 'MAX_CHAT_CONTEXT_CHARS', 12000, {
    min: 1000,
    max: 500000,
  }),
  maxChatOutputTokens: numberEnv(env, 'MAX_CHAT_OUTPUT_TOKENS', 2048, {
    min: 128,
    max: 32768,
  }),
  riskMaxSourceChars: numberEnv(env, 'RISK_MAX_SOURCE_CHARS', 14000, {
    min: 1000,
    max: 500000,
  }),
  riskMaxOutputTokens: numberEnv(env, 'RISK_MAX_OUTPUT_TOKENS', 3000, {
    min: 256,
    max: 32768,
  }),

  // Provider timeouts / retries -------------------------------------------
  chatProviderTimeoutMs:
    numberEnv(env, 'CHAT_PROVIDER_TIMEOUT_MS', 50000, {
      min: 1000,
      max: 120000,
    }),
  riskProviderTimeoutMs:
    numberEnv(env, 'RISK_PROVIDER_TIMEOUT_MS', 60000, {
      min: 1000,
      max: 120000,
    }),
  embeddingTimeoutMs:
    numberEnv(env, 'EMBEDDING_PROVIDER_TIMEOUT_MS', 20000, {
      min: 1000,
      max: 120000,
    }),
  // Overall wall-clock budget per caller so retries can never outlive the
  // frontend request timeout (chat 60s, risk 80s).
  chatAiDeadlineMs: numberEnv(env, 'CHAT_AI_DEADLINE_MS', 55000, {
    min: 2000,
    max: 120000,
  }),
  riskAiDeadlineMs: numberEnv(env, 'RISK_AI_DEADLINE_MS', 75000, {
    min: 2000,
    max: 180000,
  }),
  embeddingAiDeadlineMs:
    numberEnv(env, 'EMBEDDING_AI_DEADLINE_MS', 25000, {
      min: 1000,
      max: 120000,
    }),
  aiMaxRetries: numberEnv(env, 'AI_MAX_RETRIES', 2, { min: 0, max: 5 }),
  embeddingMaxRetries: numberEnv(env, 'EMBEDDING_MAX_RETRIES', 1, {
    min: 0,
    max: 5,
  }),
  aiRetryBaseMs: numberEnv(env, 'AI_RETRY_BASE_MS', 500, {
    min: 50,
    max: 30000,
  }),
  aiRetryMaxDelayMs: numberEnv(env, 'AI_RETRY_MAX_DELAY_MS', 4000, {
    min: 100,
    max: 60000,
  }),
});

export const limits = loadLimits();

export const describeLimits = () => ({
  rateLimitEnabled: limits.rateLimitEnabled,
  store: limits.redisUrl ? 'redis' : 'memory',
  aiDailyRequestQuota: limits.aiDailyRequestQuota,
  maxFileSizeBytes: limits.maxFileSizeBytes,
  maxExtractedTextChars: limits.maxExtractedTextChars,
  maxChatMessageChars: limits.maxChatMessageChars,
  maxChatContextChars: limits.maxChatContextChars,
  riskMaxSourceChars: limits.riskMaxSourceChars,
  aiMaxRetries: limits.aiMaxRetries,
});

// Kept for callers that want to detect whether the optional Redis driver is
// actually resolvable without importing it eagerly.
export const hasRedisDriver = () => {
  try {
    createRequire(import.meta.url).resolve('ioredis');
    return true;
  } catch {
    return false;
  }
};
