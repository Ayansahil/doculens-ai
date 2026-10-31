import { supabase } from "../config/db.js";
import * as ragService from "../services/rag.service.js";
import * as aiClient from "../services/ai-client.service.js";
import { getQuotaService } from "../services/rate-limit.service.js";
import { getAiUsageService } from "../services/ai-usage.service.js";
import { limits } from "../config/limits.js";
import {
  sendRateLimited,
  setQuotaHeaders,
} from "../utils/rate-limit-response.js";

const HF_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DAY_MS = 24 * 60 * 60 * 1000;

const consumeQuotaSafely = async (userId) => {
  try {
    const quotaService = await getQuotaService();
    return await quotaService.consume(userId);
  } catch (error) {
    // Fail open only if the rate-limit store itself is broken; the request
    // limiter middleware already protects throughput.
    console.error("[chat] quota check failed:", error?.message || error);
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
};

export const sendChatMessage = async (req, res) => {
  const startedAt = Date.now();
  const model = process.env.HF_MODEL || "unknown";
  let usageRecorded = false;

  const recordUsage = async (status, { usage = null, errorCode = null } = {}) => {
    if (usageRecorded) return;
    usageRecorded = true;
    try {
      const usageService = await getAiUsageService();
      await usageService.record({
        userId: req.user.id,
        kind: "chat",
        model,
        status,
        requestCount: 1,
        promptTokens: usage?.promptTokens,
        completionTokens: usage?.completionTokens,
        totalTokens: usage?.totalTokens,
        durationMs: Date.now() - startedAt,
        errorCode,
      });
    } catch (error) {
      console.warn("[chat] usage tracking skipped:", error?.message || error);
    }
  };

  try {
    // Accept multiple variations of documentId and sanitize null/empty strings
    const message = typeof req.body?.message === "string" ? req.body.message : "";
    const rawDocId = req.body?.documentId || req.body?.document_id || req.body?.documentID;
    const documentId = (rawDocId && rawDocId !== "null" && rawDocId !== "undefined" && String(rawDocId).trim() !== "")
      ? String(rawDocId).trim()
      : null;

    if (!message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    if (message.length > limits.maxChatMessageChars) {
      return res.status(400).json({
        success: false,
        code: "MESSAGE_TOO_LONG",
        message: `Message is too long. Maximum ${limits.maxChatMessageChars.toLocaleString()} characters.`,
      });
    }

    // 🔒 If chatting on a document, verify ownership
    if (documentId) {
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .select("id, user_id")
        .eq("id", documentId)
        .single();
      if (docError || !doc) {
        return res.status(404).json({ success: false, message: "Document not found" });
      }
      if (!doc.user_id || doc.user_id !== req.user.id) {
        return res.status(403).json({ success: false, message: "Forbidden: not your document" });
      }
    }

    // 🎟️ Daily AI quota. Identity comes only from the verified JWT.
    const quota = await consumeQuotaSafely(req.user.id);
    setQuotaHeaders(res, quota);

    if (!quota.allowed) {
      return sendRateLimited(res, {
        code: "AI_DAILY_QUOTA_EXCEEDED",
        message:
          "Your daily AI request limit has been reached. Please try again after the quota resets.",
        info: { ttlMs: quota.retryAfter * 1000, count: quota.used },
        limit: quota.limit,
        scope: "ai-daily",
        windowMs: DAY_MS,
        quota,
      });
    }

    // 1️⃣ Save USER message
    const { data: userMsg, error: userError } = await supabase
      .from("chat_history")
      .insert({
        document_id: documentId || null,
        user_id: req.user.id,
        role: "user",
        content: message,
      })
      .select()
      .single();

    if (userError) throw userError;

    // 1.5 Retrieve Context (RAG)
    let context = "";
    let historyText = "";
    if (documentId) {
      // 🔁 Conversation-aware retrieval: follow-up questions like "is it free?"
      // have no meaning alone — include this user's recent turns so the right
      // chunks are retrieved.
      const { data: recentTurns } = await supabase
        .from("chat_history")
        .select("role, content")
        .eq("document_id", documentId)
        .eq("user_id", req.user.id)
        .neq("content", message)
        .order("timestamp", { ascending: false })
        .limit(4);

      historyText = (recentTurns || [])
        .reverse()
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join(" | ");
      const retrievalQuery = historyText ? `${historyText} ${message}` : message;

      const relevantChunks = await ragService.getRelevantChunks(
        documentId,
        retrievalQuery,
        3,
        0.0,
        { userId: req.user.id },
      );

      // If retrieval returns zero chunks, do not generate a generic LLM answer; return a clear diagnostic response instead
      if (relevantChunks.length === 0) {
        const { count: totalChunks } = await supabase
          .from("document_chunks")
          .select("id", { count: "exact", head: true })
          .eq("document_id", documentId);

        let diagnosticMessage = "";
        if (!totalChunks || totalChunks === 0) {
          diagnosticMessage = `No indexed chunks found in database for document ID: ${documentId}. Please verify that text extraction and embedding generation completed.`;
        } else {
          diagnosticMessage = `No relevant content matched your query for document ID: ${documentId} (${totalChunks} chunks indexed). Please try asking a more specific question about the document content.`;
        }

        const { data: botMsg, error: botError } = await supabase
          .from("chat_history")
          .insert({
            document_id: documentId,
            user_id: req.user.id,
            role: "bot",
            content: diagnosticMessage,
          })
          .select()
          .single();

        if (botError) throw botError;

        await recordUsage("success", { errorCode: "DIAGNOSTIC_NO_MODEL" });

        return res.json({
          success: true,
          userMessage: userMsg,
          botMessage: botMsg,
          diagnostic: true,
          chunksFound: 0,
        });
      }

      context = relevantChunks.map((c, i) => `[Chunk ${i + 1}]:\n${c.content}`).join("\n\n");
      if (context.length > limits.maxChatContextChars) {
        context = context.slice(0, limits.maxChatContextChars);
      }
    }

    // 2️⃣ Call OpenRouter (with RAG context if document selected, or general assistant if no document)
    const systemPrompt = documentId
      ? "You are DocuLens AI, an expert document assistant. Answer the user's question directly, clearly, and concisely using ONLY the provided document context below.\n\nRULES:\n1. Provide ONLY the final direct answer for the user.\n2. Do NOT include any internal thoughts, reasoning steps, or thinking process (do NOT write \"Here's a thinking process:\").\n3. If the answer cannot be found in the context, reply starting with 'Not found in document' and then add one short sentence suggesting the user rephrase the question or ask about a different part of the document."
      : "You are DocuLens AI, a helpful AI assistant. Provide a direct, concise answer to the user's question without any internal reasoning or thinking process.";

    const userPrompt = documentId
      ? `Selected Document ID: ${documentId}\n${historyText ? `Recent questions in this chat: ${historyText}\n` : ""}Document Context:\n${context}\n\nUser Question: ${message}`
      : message;

    let result;
    try {
      result = await aiClient.postJson({
        url: HF_API_URL,
        apiKey: process.env.HF_API_KEY,
        body: {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: documentId ? 0.1 : 0.3,
          max_tokens: limits.maxChatOutputTokens,
        },
        headers: {
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Doculens AI",
        },
        timeoutMs: limits.chatProviderTimeoutMs,
        deadlineMs: limits.chatAiDeadlineMs,
        maxRetries: limits.aiMaxRetries,
        label: `Chat model "${model}"`,
      });
    } catch (error) {
      await recordUsage("error", { errorCode: error.code || "AI_UNREACHABLE" });
      const status = error.status || 502;
      const friendly =
        error.message || "The AI provider is temporarily unavailable. Please try again.";
      return res.status(status).json({
        success: false,
        status,
        code: error.code || null,
        message: friendly,
        error: friendly,
        retryAfter: error.retryAfter || null,
      });
    }

    if (!result.ok) {
      let errorMessage = `OpenRouter API failed (${result.status})`;
      let isQuotaExhausted = Boolean(result.quotaExhausted);
      try {
        const errorData = JSON.parse(result.raw);
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        }
        if (
          errorData.error?.code === "insufficient_quota" ||
          /quota|free-models-per-day|credits/i.test(errorMessage)
        ) {
          isQuotaExhausted = true;
        }
      } catch {
        // Keep the initial error message if JSON parse fails
        if (/quota|free-models-per-day|credits/i.test(result.raw || "")) {
          isQuotaExhausted = true;
        }
      }

      if (isQuotaExhausted) {
        await recordUsage("error", { errorCode: "PROVIDER_QUOTA" });
        const quotaMessage =
          "The free AI request limit has been reached. Please try again after the quota resets.";
        const retryAfter = Math.max(
          1,
          Math.ceil((result.retryAfterMs || 60_000) / 1000),
        );
        res.set("Retry-After", String(retryAfter));
        return res.status(429).json({
          success: false,
          status: 429,
          code: "PROVIDER_QUOTA_EXHAUSTED",
          message: quotaMessage,
          error: quotaMessage,
          retryAfter,
        });
      }

      if (result.status === 429) {
        await recordUsage("error", { errorCode: "PROVIDER_RATE_LIMITED" });
        const rateMessage =
          "The AI provider is rate limiting requests. Please try again shortly.";
        const retryAfter = Math.max(
          1,
          Math.ceil((result.retryAfterMs || 5_000) / 1000),
        );
        res.set("Retry-After", String(retryAfter));
        return res.status(429).json({
          success: false,
          status: 429,
          code: "PROVIDER_RATE_LIMITED",
          message: rateMessage,
          error: rateMessage,
          retryAfter,
        });
      }

      // Friendly, non-technical messages for other provider failures
      // (never expose raw provider details or API keys)
      if (result.status === 402) {
        await recordUsage("error", { errorCode: "PROVIDER_CREDITS" });
        const creditMessage =
          "The AI service has run out of free credits. Please try again later or contact support.";
        return res.status(402).json({
          success: false,
          status: 402,
          message: creditMessage,
          error: creditMessage,
        });
      }
      if (result.status === 404) {
        await recordUsage("error", { errorCode: "MODEL_UNAVAILABLE" });
        const modelMessage =
          "The configured AI model is currently unavailable. Please try again later.";
        return res.status(503).json({
          success: false,
          status: 503,
          message: modelMessage,
          error: modelMessage,
        });
      }
      if (result.status >= 500) {
        await recordUsage("error", { errorCode: "PROVIDER_ERROR" });
        const providerMessage =
          "The AI provider had a temporary problem. Please try again in a moment.";
        return res.status(502).json({
          success: false,
          status: 502,
          message: providerMessage,
          error: providerMessage,
        });
      }

      await recordUsage("error", {
        errorCode: `PROVIDER_HTTP_${result.status}`,
      });
      const rejectedMessage =
        "The AI provider rejected the request. Please try again.";
      return res.status(result.status >= 400 && result.status < 500 ? result.status : 502).json({
        success: false,
        status: result.status,
        message: rejectedMessage,
        error: rejectedMessage,
      });
    }

    let hfData;
    try {
      hfData = JSON.parse(result.raw);
    } catch {
      await recordUsage("error", { errorCode: "INVALID_PROVIDER_JSON" });
      const invalidMessage =
        "The AI provider returned an unreadable response. Please try again.";
      return res.status(502).json({
        success: false,
        status: 502,
        message: invalidMessage,
        error: invalidMessage,
      });
    }

    let botText = "I couldn't generate a response.";

    if (hfData?.choices?.[0]?.message?.content) {
      botText = hfData.choices[0].message.content.trim();
    } else if (hfData?.choices?.[0]?.finish_reason === "length") {
      botText = "The response was too long to be generated. Please try a more specific question.";
    } else if (hfData?.error) {
      botText = "The AI provider returned an error. Please try again.";
    }

    // Strip internal reasoning traces if present in content
    if (botText.includes("<think>")) {
      botText = botText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    }
    if (/^(?:Here's a thinking process|Thinking Process:?|Thought process:?)/i.test(botText)) {
      const finalAnswerMatch = botText.match(/(?:Final Answer|Answer|Response):\s*([\s\S]+)/i);
      if (finalAnswerMatch) {
        botText = finalAnswerMatch[1].trim();
      } else {
        const paragraphs = botText.split(/\n\s*\n/);
        const nonThinking = paragraphs.filter(
          p => !/^(?:Here's a thinking process|Thinking|1\.|2\.|3\.|4\.|5\.|Step \d|Let's analyze|Let's check)/i.test(p.trim())
        );
        if (nonThinking.length > 0) {
          botText = nonThinking.join("\n\n").trim();
        }
      }
    }

    await recordUsage("success", { usage: aiClient.extractUsage(result.raw) });

    // 3️⃣ Save BOT message
    const { data: botMsg, error: botError } = await supabase
      .from("chat_history")
      .insert({
        document_id: documentId || null,
        user_id: req.user.id,
        role: "bot",
        content: botText,
      })
      .select()
      .single();

    if (botError) throw botError;

    // 4️⃣ Send response (with consistent fields for all frontend expectations)
    res.json({
      success: true,
      userMessage: userMsg,
      botMessage: botMsg,
      message: botText,
      content: botText,
      response: {
        content: botText,
      },
    });

  } catch (error) {
    console.error("💥 Chat Error:", error.message || error);
    await recordUsage("error", { errorCode: "CHAT_FAILED" });
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Failed to process message",
      error: error.message,
    });
  }
};

export const getChatHistory = async (req, res) => {
  try {
    const rawDocId = req.query.documentId;
    const documentId = (rawDocId && rawDocId !== "null" && rawDocId !== "undefined" && String(rawDocId).trim() !== "")
      ? String(rawDocId).trim()
      : null;

    if (documentId) {
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .select("id, user_id")
        .eq("id", documentId)
        .single();
      if (docError || !doc) {
        return res.status(404).json({ success: false, message: "Document not found", history: [], count: 0 });
      }
      if (!doc.user_id || doc.user_id !== req.user.id) {
        return res.status(403).json({ success: false, message: "Forbidden: not your document", history: [], count: 0 });
      }
    }

    let query = supabase
      .from("chat_history")
      .select("*")
      .eq("user_id", req.user.id)
      .order("timestamp", { ascending: true });

    if (documentId) {
      query = query.eq("document_id", documentId);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({
      success: true,
      history: data || [],
      count: data?.length || 0,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch history",
      history: [],
      count: 0,
    });
  }
};
