import fetch from "node-fetch";
import { supabase } from "../config/db.js";

/**
 * Real, evidence-grounded document risk analysis.
 *
 * - Runs once per document and stores the result in `document_analysis`
 *   (migration: supabase_risk_analysis_migration.sql).
 * - Every finding's evidence must be verifiably present in the document text;
 *   unverifiable model suggestions are discarded.
 * - Never marks a document as analysed/high-risk on failure.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const PROVIDER_TIMEOUT_MS = 60000;
const MAX_SOURCE_CHARS = 14000;
const MIN_SOURCE_CHARS = 200;
const MAX_FINDINGS = 6;
const PROCESSING_STALE_MS = 2 * 60 * 1000;

export const DEFAULT_RISK_MODEL = "nvidia/nemotron-3.5-super-vl:free";

export const getRiskModel = () => {
  return process.env.RISK_MODEL || DEFAULT_RISK_MODEL;
};

export const RISK_DISCLAIMER =
  "AI risk analysis is advisory and may require human review. It is not legal or financial advice.";

export const RISK_CATEGORIES = [
  "Suspicious clause",
  "Financial anomaly",
  "Deadline or penalty",
  "Unusual obligation",
  "Missing information",
  "Compliance concern",
  "Other",
];

export const RISK_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    risk_level: {
      type: "string",
      enum: ["Low", "Medium", "High", "Unable to determine"],
    },
    risk_score: {
      type: ["integer", "null"],
    },
    summary: {
      type: "string",
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: RISK_CATEGORIES,
          },
          severity: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
          evidence: {
            type: "string",
          },
          explanation: {
            type: "string",
          },
          recommendation: {
            type: ["string", "null"],
          },
          page: {
            type: ["integer", "null"],
          },
        },
        required: [
          "category",
          "severity",
          "evidence",
          "explanation",
          "recommendation",
          "page",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["risk_level", "risk_score", "summary", "findings"],
  additionalProperties: false,
};

// Defined scoring method used for the optional 0-100 score.
// It is derived only from grounded findings, not from the model's own number.
const SEVERITY_WEIGHTS = { high: 30, medium: 15, low: 5 };
const LEVEL_RANK = { Low: 1, Medium: 2, High: 3 };

export class RiskError extends Error {
  constructor(message, status = 500, code = "RISK_ERROR", analysis = null) {
    super(message);
    this.name = "RiskError";
    this.status = status;
    this.code = code;
    this.analysis = analysis;
  }
}

const isMissingAnalysisTable = (error) => {
  const message = String(error?.message || "");
  return (
    error?.code === "PGRST205" ||
    /could not find the table .*document_analysis/i.test(message) ||
    /relation .*document_analysis.* does not exist/i.test(message)
  );
};

const missingTableError = () =>
  new RiskError(
    "Risk analysis storage is not initialized. Apply supabase_risk_analysis_migration.sql in Supabase, then retry.",
    503,
    "ANALYSIS_TABLE_MISSING"
  );

const requireOwnedDocument = (doc, userId) => {
  if (!doc) throw new RiskError("Document not found", 404, "NOT_FOUND");
  if (!doc.user_id || doc.user_id !== userId) {
    throw new RiskError("Forbidden: not your document", 403, "FORBIDDEN");
  }
};

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[“”‘’"']/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Evidence is grounded only when at least one meaningful fragment of the quote
 * (split on ellipses) appears verbatim in the document text.
 */
export const isEvidenceGrounded = (evidence, sourceText) => {
  const source = normalize(sourceText);
  const fragments = normalize(evidence)
    .split(/\.\.\.|…/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 20);

  if (!source || fragments.length === 0) return false;
  return fragments.every((fragment) => source.includes(fragment));
};

const computeScore = (findings) => {
  const raw = findings.reduce(
    (total, finding) => total + (SEVERITY_WEIGHTS[finding.severity] || 0),
    0
  );
  return Math.min(100, raw);
};

const deriveLevel = (score) => {
  if (score >= 60) return "High";
  if (score >= 25) return "Medium";
  return "Low";
};

const extractJson = (raw) => {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  const cleaned = String(raw)
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
};

const unpackAnalysisPayload = (raw) => {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object") return null;

  // If this is an OpenRouter completion envelope, unwrap choices[0].message.content
  if (Array.isArray(parsed.choices) && parsed.choices.length > 0) {
    const choice = parsed.choices[0];
    const messageContent = choice?.message?.content ?? choice?.text;
    if (typeof messageContent === "string") {
      const inner = extractJson(messageContent);
      if (inner && typeof inner === "object") {
        return inner;
      }
    } else if (messageContent && typeof messageContent === "object") {
      return messageContent;
    }
  }

  return parsed;
};

/**
 * Validates + grounds the model response. Pure function (no network / DB) so it
 * can be unit-tested. Returns { ok, status, riskLevel, riskScore, summary, findings }.
 */
export const buildAnalysisResult = (rawResponse, sourceText) => {
  const parsed = unpackAnalysisPayload(rawResponse);

  if (!parsed || typeof parsed !== "object") {
    return {
      ok: false,
      code: "INVALID_JSON",
      reason: "The AI returned an unreadable analysis. Please retry.",
    };
  }

  const rawLevel = String(parsed.risk_level || "").trim().toLowerCase();
  const modelLevel =
    rawLevel === "low"
      ? "Low"
      : rawLevel === "medium"
        ? "Medium"
        : rawLevel === "high"
          ? "High"
          : null;

  const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const findings = [];
  let discarded = 0;

  for (const item of rawFindings) {
    if (findings.length >= MAX_FINDINGS) break;

    const evidence = String(item?.evidence || "")
      .replace(/^[\s"'“”]+|[\s"'“”]+$/g, "")
      .trim()
      .slice(0, 400);
    const severity = String(item?.severity || "").toLowerCase();
    const category = RISK_CATEGORIES.find(
      (name) => name.toLowerCase() === String(item?.category || "").trim().toLowerCase()
    );
    const explanation = String(item?.explanation || "").trim().slice(0, 600);
    const recommendation = String(item?.recommendation || "").trim().slice(0, 300);
    const page =
      Number.isInteger(item?.page) && item.page > 0 ? item.page : null;

    const valid =
      evidence.length >= 20 &&
      isEvidenceGrounded(evidence, sourceText) &&
      ["low", "medium", "high"].includes(severity) &&
      Boolean(category) &&
      explanation.length >= 15;

    if (!valid) {
      discarded += 1;
      continue;
    }

    const finding = {
      category,
      severity,
      evidence,
      explanation,
      recommendation: recommendation || null,
    };
    if (page !== null) {
      finding.page = page;
    }

    findings.push(finding);
  }

  const discardedNote = discarded
    ? ` (${discarded} AI-suggested finding${discarded === 1 ? "" : "s"} discarded because the quoted evidence could not be verified in the document.)`
    : "";

  // No verifiable evidence for a non-low claim → do not invent a risk level.
  if (!modelLevel && findings.length === 0) {
    return {
      ok: true,
      status: "insufficient_evidence",
      riskLevel: null,
      riskScore: null,
      summary:
        (String(parsed.summary || "").trim().slice(0, 1200) ||
          "Unable to determine: the available document text does not contain enough verifiable risk evidence.") +
        discardedNote,
      findings: [],
      discarded,
    };
  }

  if (modelLevel && modelLevel !== "Low" && findings.length === 0) {
    return {
      ok: true,
      status: "insufficient_evidence",
      riskLevel: null,
      riskScore: null,
      summary:
        "Unable to determine: the AI suggested a risk but no quoted evidence could be verified in the document text. Review the document manually." +
        discardedNote,
      findings: [],
      discarded,
    };
  }

  const score = computeScore(findings);
  const derived = deriveLevel(score);
  const riskLevel =
    modelLevel && LEVEL_RANK[modelLevel] >= LEVEL_RANK[derived]
      ? modelLevel
      : findings.length > 0
        ? derived
        : "Low";

  const summary =
    String(parsed.summary || "").trim().slice(0, 1200) ||
    (findings.length
      ? `${findings.length} risk indicator${findings.length === 1 ? "" : "s"} found in the analyzed text.`
      : "No material risk indicators were found in the analyzed text.");

  return {
    ok: true,
    status: "completed",
    riskLevel,
    riskScore: score,
    summary: summary + discardedNote,
    findings,
    discarded,
  };
};

export const mapProviderError = (status, rawBody = "") => {
  const body = String(rawBody || "");
  const quotaLike =
    status === 429 ||
    /rate limit|quota|free-models-per-day/i.test(body);

  if (quotaLike) {
    return new RiskError(
      "The free AI request limit has been reached. Please try again after the quota resets.",
      429,
      "QUOTA"
    );
  }
  if (status === 402) {
    return new RiskError(
      "The AI service has run out of free credits. Please try again later.",
      402,
      "CREDITS"
    );
  }
  if (
    status === 404 ||
    /no endpoints found|unsupported parameters|not supported/i.test(body)
  ) {
    return new RiskError(
      "The configured AI model is currently unavailable. Please try again later.",
      503,
      "MODEL_UNAVAILABLE"
    );
  }
  if (status >= 500) {
    return new RiskError(
      "The AI provider had a temporary problem. Please try again in a moment.",
      502,
      "PROVIDER_ERROR"
    );
  }
  return new RiskError(
    "The AI provider rejected the analysis request. Please try again.",
    502,
    "PROVIDER_REJECTED"
  );
};

const callModel = async (sourceText, doc) => {
  const apiKey = process.env.HF_API_KEY;
  if (!apiKey) {
    throw new RiskError(
      "AI analysis is not configured (missing HF_API_KEY).",
      503,
      "PROVIDER_NOT_CONFIGURED"
    );
  }

  const model = getRiskModel();

  const systemPrompt = [
    "You are a careful document risk analyst.",
    "Analyze ONLY the document text provided. Ground every finding in a verbatim quote.",
    "Do NOT classify a document as risky merely because it contains words like risk, loss, or penalty.",
    `Allowed categories: ${RISK_CATEGORIES.join(", ")}.`,
    "Only use categories appropriate for this document type.",
    "If the text does not contain enough evidence, use risk_level \"Unable to determine\" and no findings.",
    "Do not claim legal or financial certainty.",
    "Return ONLY valid JSON matching the schema.",
  ].join("\n");

  const userPrompt = [
    `Document title: ${doc.title || "Untitled"}`,
    `Document type: ${doc.type || "Unknown"}`,
    `Document category: ${doc.category || "Other"}`,
    "",
    "Document text:",
    sourceText,
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  console.log(`[risk] Requesting analysis via model "${model}" (${sourceText.length} chars)`);

  let response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3001",
        "X-Title": "DocuLens AI",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "risk_analysis",
            strict: true,
            schema: RISK_ANALYSIS_SCHEMA,
          },
        },
        provider: {
          require_parameters: true,
        },
        temperature: 0.1,
        max_tokens: 3000,
      }),
      signal: controller.signal,
    });
  } catch (fetchError) {
    clearTimeout(timer);
    if (fetchError.name === "AbortError" || controller.signal.aborted) {
      console.error(`[risk] Timeout (${PROVIDER_TIMEOUT_MS}ms) waiting for model "${model}"`);
      throw new RiskError(
        "The AI provider is responding slowly right now. Please try again in a moment.",
        504,
        "TIMEOUT"
      );
    }
    console.error(`[risk] Network error reaching OpenRouter: ${fetchError.message}`);
    throw new RiskError(
      "Could not reach the AI provider. Please try again.",
      502,
      "PROVIDER_UNREACHABLE"
    );
  } finally {
    clearTimeout(timer);
  }

  try {
    const raw = await response.text();
    if (!response.ok) {
      console.error(`[risk] Provider returned HTTP ${response.status} for model "${model}"`);
    } else {
      console.log(`[risk] Received HTTP ${response.status} from model "${model}"`);
    }
    return { response, raw };
  } catch (readError) {
    console.error(`[risk] Failed reading provider response: ${readError.message}`);
    throw new RiskError(
      "The AI response could not be read. Please try again.",
      502,
      "PROVIDER_UNREACHABLE"
    );
  }
};

const getOwnedDocument = async (documentId, userId) => {
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, type, category, status, extracted_text, user_id")
    .eq("id", documentId)
    .single();

  if (error) {
    if (error.code === "PGRST116") throw new RiskError("Document not found", 404, "NOT_FOUND");
    throw error;
  }

  requireOwnedDocument(data, userId);
  return data;
};

const buildSourceText = async (doc) => {
  const { data: chunks, error } = await supabase
    .from("document_chunks")
    .select("id, content")
    .eq("document_id", doc.id)
    .order("id", { ascending: true });

  const chunkTexts =
    !error && Array.isArray(chunks)
      ? chunks.map((chunk) => String(chunk.content || "").trim()).filter(Boolean)
      : [];

  const fullText = chunkTexts.length
    ? chunkTexts.join("\n\n---\n\n")
    : String(doc.extracted_text || "").trim();

  return {
    text: fullText.slice(0, MAX_SOURCE_CHARS),
    truncated: fullText.length > MAX_SOURCE_CHARS,
    chunkCount: chunkTexts.length,
    totalCharacters: fullText.length,
  };
};

const saveAnalysis = async (documentId, userId, patch) => {
  const { data, error } = await supabase
    .from("document_analysis")
    .upsert(
      {
        document_id: documentId,
        user_id: userId,
        updated_at: new Date().toISOString(),
        ...patch,
      },
      { onConflict: "document_id" }
    )
    .select()
    .single();

  if (error) {
    if (isMissingAnalysisTable(error)) throw missingTableError();
    throw error;
  }
  return data;
};

export const getDocumentAnalysis = async (documentId, userId) => {
  const { data, error } = await supabase
    .from("document_analysis")
    .select("*")
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingAnalysisTable(error)) throw missingTableError();
    throw error;
  }
  return data || null;
};

/**
 * Returns { available, map } where map is keyed by document id.
 * `available: false` means the migration has not been applied yet.
 */
export const getAnalysesForDocuments = async (documentIds, userId) => {
  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return { available: true, map: {} };
  }

  const { data, error } = await supabase
    .from("document_analysis")
    .select(
      "document_id, status, risk_level, risk_score, summary, findings, coverage, error, analyzed_at, updated_at"
    )
    .in("document_id", documentIds)
    .eq("user_id", userId);

  if (error) {
    if (isMissingAnalysisTable(error)) {
      return { available: false, map: {}, error: missingTableError().message };
    }
    throw error;
  }

  const map = {};
  for (const row of data || []) map[row.document_id] = row;
  return { available: true, map };
};

/**
 * Runs the model + grounding without persistence. Useful for tests.
 */
export const runRiskAnalysis = async ({ title, type, category, text }) => {
  const source = String(text || "").trim().slice(0, MAX_SOURCE_CHARS);
  if (source.length < MIN_SOURCE_CHARS) {
    return {
      ok: true,
      status: "insufficient_evidence",
      riskLevel: null,
      riskScore: null,
      summary:
        "Unable to determine: this document has little or no extractable text. It may be a scanned PDF or an unsupported format.",
      findings: [],
      discarded: 0,
    };
  }

  const { response, raw } = await callModel(source, { title, type, category });
  if (!response.ok) throw mapProviderError(response.status, raw);

  if (process.env.RISK_DEBUG === "true") {
    console.log("[risk] raw model response:", String(raw).slice(0, 3000));
  }

  return {
    ...buildAnalysisResult(raw, source),
    model: getRiskModel(),
    coverage: {
      truncated: false,
      chunkCount: 0,
      analyzedCharacters: source.length,
      totalCharacters: source.length,
    },
  };
};

/**
 * Analyzes and persists a document's risk result.
 * Cached unless `force` is true. Failures never overwrite a successful result.
 */
export const analyzeDocumentRisk = async (documentId, userId, { force = false } = {}) => {
  const doc = await getOwnedDocument(documentId, userId);

  let existing = null;
  try {
    existing = await getDocumentAnalysis(documentId, userId);
  } catch (error) {
    if (error.code === "ANALYSIS_TABLE_MISSING") throw error;
    throw error;
  }

  if (!force && existing && ["completed", "insufficient_evidence"].includes(existing.status)) {
    return { analysis: existing, cached: true };
  }

  if (!force && existing?.status === "processing") {
    const age = Date.now() - new Date(existing.updated_at || 0).getTime();
    if (Number.isFinite(age) && age < PROCESSING_STALE_MS) {
      return { analysis: existing, cached: true };
    }
  }

  // Mark as processing without destroying a previous successful result.
  await saveAnalysis(documentId, userId, { status: "processing", error: null });

  try {
    const source = await buildSourceText(doc);
    const coverage = {
      truncated: source.truncated,
      chunkCount: source.chunkCount,
      analyzedCharacters: source.text.length,
      totalCharacters: source.totalCharacters,
    };

    if (source.text.length < MIN_SOURCE_CHARS) {
      const analysis = await saveAnalysis(documentId, userId, {
        status: "insufficient_evidence",
        risk_level: null,
        risk_score: null,
        summary:
          "Unable to determine: this document has little or no extractable text. It may be a scanned PDF or an unsupported format.",
        findings: [],
        coverage,
        error: null,
        model: getRiskModel(),
        analyzed_at: new Date().toISOString(),
      });
      return { analysis, cached: false };
    }

    const { response, raw } = await callModel(source.text, doc);
    if (!response.ok) throw mapProviderError(response.status, raw);

    const result = buildAnalysisResult(raw, source.text);
    if (!result.ok) {
      throw new RiskError(result.reason, 502, result.code || "INVALID_JSON");
    }

    const analysis = await saveAnalysis(documentId, userId, {
      status: result.status,
      risk_level: result.riskLevel,
      risk_score: result.riskScore,
      summary: result.summary,
      findings: result.findings,
      coverage,
      error: null,
      model: getRiskModel(),
      analyzed_at: new Date().toISOString(),
    });

    return { analysis, cached: false };
  } catch (error) {
    const mapped =
      error instanceof RiskError
        ? error
        : new RiskError(error.message || "Risk analysis failed", 500, "ANALYSIS_FAILED");

    // Preserve a previous successful result; only record the latest error.
    if (existing && ["completed", "insufficient_evidence"].includes(existing.status)) {
      try {
        await saveAnalysis(documentId, userId, {
          status: existing.status,
          error: mapped.message,
        });
      } catch (saveError) {
        console.error("Failed to record analysis warning:", saveError.message);
      }
      return { analysis: { ...existing, error: mapped.message }, cached: true, warning: mapped.message };
    }

    try {
      const failed = await saveAnalysis(documentId, userId, {
        status: "failed",
        risk_level: null,
        risk_score: null,
        summary: null,
        findings: [],
        error: mapped.message,
        analyzed_at: null,
      });
      mapped.analysis = failed;
    } catch (saveError) {
      console.error("Failed to persist analysis failure:", saveError.message);
    }

    throw mapped;
  }
};
