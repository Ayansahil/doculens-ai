import { supabase } from "../config/db.js";

/**
 * Best-effort AI usage audit. Only non-sensitive metadata is stored: no
 * prompts, document text, API keys or provider secrets.
 *
 * Persistence target: `ai_usage_events` (see supabase_ai_usage_migration.sql).
 * If the migration has not been applied, recording degrades to a bounded
 * in-memory buffer so the API keeps working. A summary then reports
 * `source: "memory"` and only includes this process's recent events.
 */

const TABLE = "ai_usage_events";
const MAX_MEMORY_EVENTS = 1000;
const SUMMARY_EVENT_LIMIT = 500;
const RECENT_EVENT_LIMIT = 20;
const WARN_INTERVAL_MS = 60_000;

const isMissingUsageTable = (error) => {
  const message = String(error?.message || "");
  return (
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    /could not find the table .*ai_usage_events/i.test(message) ||
    /relation .*ai_usage_events.* does not exist/i.test(message)
  );
};

const toInt = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
};

const cleanString = (value, maxLength = 200) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
};

export const createAiUsageService = ({
  client = supabase,
  logger = console,
  now = Date.now,
  memoryLimit = MAX_MEMORY_EVENTS,
} = {}) => {
  let dbAvailable = Boolean(client);
  let lastWarningAt = 0;
  const memory = [];

  const warn = (message) => {
    const current = now();
    if (current - lastWarningAt < WARN_INTERVAL_MS) return;
    lastWarningAt = current;
    logger?.warn?.(`[ai-usage] ${message}`);
  };

  const remember = (event) => {
    memory.push(event);
    if (memory.length > memoryLimit) {
      memory.splice(0, memory.length - memoryLimit);
    }
  };

  const normalize = (input = {}) => {
    const promptTokens = toInt(input.promptTokens);
    const completionTokens = toInt(input.completionTokens);
    const totalTokens =
      toInt(input.totalTokens) ??
      (promptTokens !== null || completionTokens !== null
        ? (promptTokens || 0) + (completionTokens || 0)
        : null);

    return {
      user_id: input.userId,
      kind: input.kind,
      model: cleanString(input.model, 200),
      status: input.status === "error" ? "error" : "success",
      request_count: Math.max(1, toInt(input.requestCount) ?? 1),
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      duration_ms: toInt(input.durationMs),
      error_code: cleanString(input.errorCode, 100),
      created_at: new Date(input.createdAt ?? now()).toISOString(),
    };
  };

  const service = {
    async record(input = {}) {
      if (!input.userId) {
        logger?.warn?.("[ai-usage] skipped event without an authenticated user id");
        return { persisted: false, recorded: false, fallback: true };
      }
      if (!input.kind) {
        logger?.warn?.("[ai-usage] skipped event without a kind");
        return { persisted: false, recorded: false, fallback: true };
      }

      const event = normalize(input);
      remember(event);

      if (!dbAvailable || !client) {
        return { persisted: false, recorded: true, fallback: true };
      }

      try {
        const { error } = await client.from(TABLE).insert(event);
        if (error) {
          if (isMissingUsageTable(error)) {
            dbAvailable = false;
            warn(
              "ai_usage_events table is missing; using bounded in-memory usage audit. Apply supabase_ai_usage_migration.sql.",
            );
          } else {
            warn(`failed to persist usage event: ${error.message || error}`);
          }
          return { persisted: false, recorded: true, fallback: true };
        }
        return { persisted: true, recorded: true, fallback: false };
      } catch (error) {
        if (isMissingUsageTable(error)) {
          dbAvailable = false;
          warn(
            "ai_usage_events table is missing; using bounded in-memory usage audit. Apply supabase_ai_usage_migration.sql.",
          );
        } else {
          warn(`failed to persist usage event: ${error?.message || error}`);
        }
        return { persisted: false, recorded: true, fallback: true };
      }
    },

    async getSummary(userId, { quota = null } = {}) {
      if (!userId) throw new Error("Usage summary requires an authenticated user id");

      const date = new Date(now()).toISOString().slice(0, 10);
      const dayStart = `${date}T00:00:00.000Z`;
      let events = [];
      let source = "memory";

      if (dbAvailable && client) {
        try {
          const { data, error } = await client
            .from(TABLE)
            .select(
              "kind, model, status, request_count, prompt_tokens, completion_tokens, total_tokens, duration_ms, error_code, created_at",
            )
            .eq("user_id", userId)
            .gte("created_at", dayStart)
            .order("created_at", { ascending: false })
            .limit(SUMMARY_EVENT_LIMIT);

          if (error) throw error;
          events = Array.isArray(data) ? data : [];
          source = "database";
        } catch (error) {
          if (isMissingUsageTable(error)) {
            dbAvailable = false;
            warn(
              "ai_usage_events table is missing; reporting in-memory usage instead. Apply supabase_ai_usage_migration.sql.",
            );
          } else {
            warn(`failed to read usage events: ${error?.message || error}`);
          }
        }
      }

      if (source === "memory") {
        events = memory
          .filter((event) => event.user_id === userId && event.created_at >= dayStart)
          .slice(-SUMMARY_EVENT_LIMIT)
          .reverse();
      }

      const totals = {
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        errors: 0,
      };
      const byKind = {};

      for (const event of events) {
        const count = Math.max(1, toInt(event.request_count) ?? 1);
        const kind = event.kind || "unknown";
        if (!byKind[kind]) {
          byKind[kind] = { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, errors: 0 };
        }

        totals.requests += count;
        totals.promptTokens += toInt(event.prompt_tokens) ?? 0;
        totals.completionTokens += toInt(event.completion_tokens) ?? 0;
        totals.totalTokens += toInt(event.total_tokens) ?? 0;
        if (event.status === "error") totals.errors += 1;

        byKind[kind].requests += count;
        byKind[kind].promptTokens += toInt(event.prompt_tokens) ?? 0;
        byKind[kind].completionTokens += toInt(event.completion_tokens) ?? 0;
        byKind[kind].totalTokens += toInt(event.total_tokens) ?? 0;
        if (event.status === "error") byKind[kind].errors += 1;
      }

      return {
        date,
        source,
        quota,
        totals,
        byKind,
        recent: events.slice(0, RECENT_EVENT_LIMIT).map((event) => ({
          kind: event.kind,
          model: event.model,
          status: event.status,
          requestCount: toInt(event.request_count) ?? 1,
          promptTokens: toInt(event.prompt_tokens),
          completionTokens: toInt(event.completion_tokens),
          totalTokens: toInt(event.total_tokens),
          durationMs: toInt(event.duration_ms),
          errorCode: event.error_code,
          createdAt: event.created_at,
        })),
      };
    },
  };

  return service;
};

let singleton = null;

export const getAiUsageService = () => {
  if (!singleton) singleton = createAiUsageService();
  return singleton;
};

export const resetAiUsageServiceForTests = () => {
  singleton = null;
};
