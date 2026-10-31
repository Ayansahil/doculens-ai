import { limits } from '../config/limits.js';
import { getRateStore } from '../services/rate-store.service.js';
import {
  sendRateLimited,
  setRateLimitHeaders,
} from '../utils/rate-limit-response.js';

/**
 * Normalizes IPv4-mapped IPv6 addresses so ::ffff:127.0.0.1 and 127.0.0.1
 * share a bucket. `req.ip` is only trustworthy when Express `trust proxy`
 * matches the deployment; see TRUST_PROXY in RATE_LIMITING.md.
 */
export const normalizeIp = (req) => {
  const raw = String(req.ip || req.socket?.remoteAddress || 'unknown');
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
};

const resolveStore = async (store) => {
  const candidate = typeof store === 'function' ? store() : store;
  return candidate;
};

const consume = async ({ store, key, limit, windowMs }) => {
  const rateStore = await resolveStore(store);
  return rateStore.consume(key, limit, windowMs);
};

export const createRateLimitMiddleware = ({
  store = getRateStore,
  scope,
  limit,
  windowMs,
  keyGenerator,
  message = 'Too many requests. Please try again later.',
  code = 'RATE_LIMITED',
  enabled = true,
  skip = null,
}) => {
  if (!scope) throw new Error('createRateLimitMiddleware requires a scope');
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error('createRateLimitMiddleware requires a positive limit');
  }

  return async (req, res, next) => {
    if (!enabled || (skip && skip(req))) return next();

    const identity = keyGenerator(req);
    if (!identity) return next();

    const key = `rl:${scope}:${identity}`;

    try {
      const info = await consume({ store, key, limit, windowMs });
      setRateLimitHeaders(res, { limit, info, scope, windowMs });

      if (!info.allowed) {
        return sendRateLimited(res, {
          code,
          message,
          info,
          limit,
          scope,
          windowMs,
        });
      }

      req.rateLimit = { scope, limit, remaining: limit - info.count };
      return next();
    } catch (error) {
      // Never fail a request because the limiter itself broke; the store
      // already falls back to memory for Redis outages.
      console.error('[rate-limit] middleware error:', error?.message || error);
      return next();
    }
  };
};

const enabled = () => limits.rateLimitEnabled;

export const apiIpRateLimit = createRateLimitMiddleware({
  scope: 'ip-api',
  limit: limits.ipRateLimitMax,
  windowMs: limits.ipRateLimitWindowMs,
  enabled: enabled(),
  keyGenerator: (req) => `ip:${normalizeIp(req)}`,
  message: 'Too many requests from this network. Please try again shortly.',
});

export const publicIpRateLimit = createRateLimitMiddleware({
  scope: 'ip-public',
  limit: limits.publicRateLimitMax,
  windowMs: limits.publicRateLimitWindowMs,
  enabled: enabled(),
  keyGenerator: (req) => `ip:${normalizeIp(req)}`,
  message: 'Too many requests from this network. Please try again shortly.',
});

export const uploadUserRateLimit = createRateLimitMiddleware({
  scope: 'user-upload',
  limit: limits.uploadRateLimitMax,
  windowMs: limits.uploadRateLimitWindowMs,
  enabled: enabled(),
  keyGenerator: (req) =>
    req.user?.id ? `user:${req.user.id}` : `ip:${normalizeIp(req)}`,
  message:
    'Upload limit reached for your account. Please wait before uploading more files.',
});

export const chatUserRateLimit = createRateLimitMiddleware({
  scope: 'user-chat',
  limit: limits.chatRateLimitMax,
  windowMs: limits.chatRateLimitWindowMs,
  enabled: enabled(),
  keyGenerator: (req) =>
    req.user?.id ? `user:${req.user.id}` : `ip:${normalizeIp(req)}`,
  message: 'Chat limit reached. Please wait a moment before sending another message.',
});

export const riskUserRateLimit = createRateLimitMiddleware({
  scope: 'user-risk',
  limit: limits.riskRateLimitMax,
  windowMs: limits.riskRateLimitWindowMs,
  enabled: enabled(),
  keyGenerator: (req) =>
    req.user?.id ? `user:${req.user.id}` : `ip:${normalizeIp(req)}`,
  message:
    'Risk-analysis limit reached for your account. Please wait before running more analyses.',
});

/**
 * Strict limiter for failed/missing token attempts. Login itself is handled by
 * Supabase; this protects the backend API from token guessing and abusive
 * unauthenticated traffic.
 */
export const createAuthFailureGuard = ({
  store = getRateStore,
  limit = limits.authFailureMax,
  windowMs = limits.authFailureWindowMs,
  scope = 'ip-auth-failure',
  enabled: guardEnabled = limits.rateLimitEnabled,
  now = Date.now,
} = {}) => {
  return async (req, res) => {
    if (!guardEnabled) return true;

    const key = `rl:${scope}:ip:${normalizeIp(req)}`;
    try {
      const info = await consume({ store, key, limit, windowMs });
      if (info.allowed) return true;

      sendRateLimited(res, {
        code: 'AUTH_RATE_LIMITED',
        message:
          'Too many failed authentication attempts. Please wait before trying again.',
        info,
        limit,
        scope,
        windowMs,
      });
      return false;
    } catch (error) {
      console.error('[rate-limit] auth guard error:', error?.message || error);
      return true;
    }
  };
};

export const authFailureGuard = createAuthFailureGuard({ now: Date.now });
