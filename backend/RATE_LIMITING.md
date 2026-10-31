# Rate Limiting, AI Quotas and Input Caps

DocuLens AI limits API traffic, AI spend and input sizes at the backend. All
values are environment-driven (`src/config/limits.js`) and every default below
is a conservative starting point — tune per deployment. Nothing is hardcoded
into the request handlers.

## What is protected

| Layer | Scope | Applies to | Default |
| --- | --- | --- | --- |
| `ip-api` | IP | Every API request (global) | 300 / 60s |
| `ip-public` | IP | `/uploads/*` static files | 120 / 60s |
| `ip-auth-failure` | IP | Missing/invalid JWT attempts | 20 / 15 min |
| `user-upload` | Verified user | `POST /documents/upload` | 30 / hour |
| `user-chat` | Verified user | `POST /chat` | 20 / minute |
| `user-risk` | Verified user | `POST /documents/:id/analyze` | 10 / hour |
| `ai-daily` | Verified user | Chat + risk model calls | 50 / UTC day |

Identity for authenticated limits comes only from the Supabase JWT verified in
`requireAuth` (`req.user.id`). A `user_id` in the body, query or a custom header
is ignored.

Embeddings are tracked in the usage audit but are **not** charged against the
daily chat/risk quota. They are bounded by `MAX_FILE_SIZE`,
`MAX_EXTRACTED_TEXT_CHARS` and `MAX_DOCUMENT_CHUNKS`.

## Responses

Limited requests never return a generic 500. HTTP limiters return:

```json
{
  "success": false,
  "status": 429,
  "code": "RATE_LIMITED",
  "message": "Chat limit reached. Please wait a moment before sending another message.",
  "retryAfter": 37,
  "resetAt": "2026-10-31T12:01:00.000Z",
  "limit": { "scope": "user-chat", "max": 20, "windowSeconds": 60, "remaining": 0, "resetAt": "..." }
}
```

Headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`,
`RateLimit-Policy`, and `Retry-After` on 429.

Daily quota rejections use code `AI_DAILY_QUOTA_EXCEEDED` and add a `quota`
object (`limit`, `used`, `remaining`, `resetAt`). Successful AI responses carry
`X-AI-Quota-Limit`, `X-AI-Quota-Remaining` and `X-AI-Quota-Reset`.

Duplicate risk analysis:

- If the same document is already being analyzed and a recent `processing`
  row exists, the stored state is returned with `cached: true`.
- Otherwise the API returns **409** with `code: "ANALYSIS_IN_PROGRESS"` and
  `retryAfter` (plus `Retry-After`).

## Redis

Redis is **optional**.

- No `REDIS_URL`: limits, daily quotas and locks use a bounded in-process
  memory store. This is correct for local development and a **single** backend
  process.
- `REDIS_URL` set: `ioredis` provides atomic counters (`INCR` + TTL via Lua) and
  compare-and-delete locks. This is **required for multiple Node instances**
  to share rate windows, daily quotas and duplicate-analysis locks.

If Redis is configured but unreachable, the backend logs a warning and falls
back to local memory. Limits keep working per instance (availability over
strict global enforcement). Monitor the `[rate-limit]` warnings in production.

## Bounded retries

`src/services/ai-client.service.js` retries only:

- network errors and request timeouts
- HTTP `408`, `425`, `5xx`
- transient `429`s

It never retries provider quota/credit exhaustion `429`s or other `4xx`
responses. Attempts are capped by `AI_MAX_RETRIES` (embedding:
`EMBEDDING_MAX_RETRIES`) with exponential backoff + jitter, and each operation
has a hard wall-clock deadline:

| Operation | Attempt timeout | Overall deadline |
| --- | --- | --- |
| Chat | `CHAT_PROVIDER_TIMEOUT_MS` (50s) | `CHAT_AI_DEADLINE_MS` (55s) |
| Risk analysis | `RISK_PROVIDER_TIMEOUT_MS` (60s) | `RISK_AI_DEADLINE_MS` (75s) |
| Embedding | `EMBEDDING_PROVIDER_TIMEOUT_MS` (20s) | `EMBEDDING_AI_DEADLINE_MS` (25s) |

The deadlines stay below the frontend Axios timeouts (chat 60s, risk 80s), so
users receive a clean JSON error instead of a client-side abort.

## Usage audit

Apply `supabase_ai_usage_migration.sql` once to enable persistent tracking in
`ai_usage_events`. Events store metadata only:

- `kind` (`chat` / `risk` / `embedding`), `model`, `status`
- request count, prompt/completion/total tokens (when the provider returns
  `usage`), duration and an error code

No prompts, document text, API keys or provider secrets are stored. If the
migration is absent, recording degrades to a bounded in-memory buffer (latest
1000 events) and `GET /analytics/ai-usage` reports `source: "memory"`.

`GET /analytics/ai-usage` is authenticated and self-only. It returns today's
totals, per-kind breakdown, recent metadata, and the caller's quota. It never
accepts a user id from the client.

## Configuration

See `backend/.env.example` for every variable and its default. Examples:

```bash
AI_DAILY_REQUEST_QUOTA=50        # 0 = unlimited (not recommended publicly)
CHAT_RATE_LIMIT_MAX=20
CHAT_RATE_LIMIT_WINDOW_SECONDS=60
MAX_FILE_SIZE=52428800           # bytes (50 MB)
MAX_EXTRACTED_TEXT_CHARS=2000000
RISK_ANALYSIS_LOCK_TTL_SECONDS=120
REDIS_URL=redis://127.0.0.1:6379
TRUST_PROXY=true                 # only behind a trusted proxy
```

`TRUST_PROXY` matters: if it is `false` behind a reverse proxy, every request
appears to come from the proxy IP and shares one bucket. If it is enabled
without a trusted proxy, clients can spoof `X-Forwarded-For` and bypass IP
limits.

## Tests

```bash
cd backend
node --test test_rate_limiting.mjs
```

The suite covers normal traffic, limit exceeded, multi-user isolation, spoofed
user ids, unauthenticated/auth-failure limits, daily quota, duplicate analysis
locking, Redis-unavailable fallback, retry classification/backoff, and the
usage-audit memory fallback. It does not call live AI providers or require
Redis.
