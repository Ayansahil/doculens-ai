import fetch from "node-fetch";
import { supabase } from "../config/db.js";
import * as ragService from "../services/rag.service.js";

const HF_API_URL = "https://openrouter.ai/api/v1/chat/completions";
// ✅ NOTE: OpenRouter URL is ALWAYS 'const' because it's a fixed endpoint.
// Using 'let' doesn't help with 429 errors.

export const sendChatMessage = async (req, res) => {
  try {
    console.log("📩 Request Body:", req.body);

    // Accept multiple variations of documentId and sanitize null/empty strings
    const message = req.body.message;
    const rawDocId = req.body.documentId || req.body.document_id || req.body.documentID;
    const documentId = (rawDocId && rawDocId !== "null" && rawDocId !== "undefined" && String(rawDocId).trim() !== "")
      ? String(rawDocId).trim()
      : null;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
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
    console.log("✅ User message saved");

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

      console.log(`🔍 RAG: Fetching context for doc ${documentId}`);
      const relevantChunks = await ragService.getRelevantChunks(documentId, retrievalQuery, 3, 0.0);
      console.log(`📄 RAG: Found ${relevantChunks.length} chunks`);

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

        console.log(`⚠️ RAG diagnostic response: ${diagnosticMessage}`);

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

        return res.json({
          success: true,
          userMessage: userMsg,
          botMessage: botMsg,
          diagnostic: true,
          chunksFound: 0,
        });
      }

      context = relevantChunks.map((c, i) => `[Chunk ${i + 1}]:\n${c.content}`).join("\n\n");
    }

    // 2️⃣ Call OpenRouter (with RAG context if document selected, or general assistant if no document)
    const systemPrompt = documentId
      ? "You are DocuLens AI, an expert document assistant. Answer the user's question directly, clearly, and concisely using ONLY the provided document context below.\n\nRULES:\n1. Provide ONLY the final direct answer for the user.\n2. Do NOT include any internal thoughts, reasoning steps, or thinking process (do NOT write \"Here's a thinking process:\").\n3. If the answer cannot be found in the context, reply starting with 'Not found in document' and then add one short sentence suggesting the user rephrase the question or ask about a different part of the document."
      : "You are DocuLens AI, a helpful AI assistant. Provide a direct, concise answer to the user's question without any internal reasoning or thinking process.";

    const userPrompt = documentId
      ? `Selected Document ID: ${documentId}\n${historyText ? `Recent questions in this chat: ${historyText}\n` : ""}Document Context:\n${context}\n\nUser Question: ${message}`
      : message;

    // ⏱️ Provider timeout: if OpenRouter doesn't answer in 50s, abort and
    // return a friendly 504 (frontend waits up to 60s for chat).
    const PROVIDER_TIMEOUT_MS = 50000;
    const providerController = new AbortController();
    const providerTimer = setTimeout(() => providerController.abort(), PROVIDER_TIMEOUT_MS);

    let hfResponse;
    try {
      hfResponse = await fetch(HF_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Doculens AI",
        },
        body: JSON.stringify({
          model: process.env.HF_MODEL,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
          temperature: documentId ? 0.1 : 0.3,
          max_tokens: 2048,
        }),
        signal: providerController.signal,
      });
    } catch (fetchErr) {
      if (fetchErr.name === "AbortError" || providerController.signal.aborted) {
        console.error("⏱️ OpenRouter timed out after", PROVIDER_TIMEOUT_MS, "ms");
        const timeoutMessage =
          "The AI provider is responding slowly right now. Please try again in a moment.";
        return res.status(504).json({
          success: false,
          status: 504,
          message: timeoutMessage,
          error: timeoutMessage,
        });
      }
      throw fetchErr;
    } finally {
      clearTimeout(providerTimer);
    }

    const raw = await hfResponse.text();
    console.log("📡 OpenRouter RAW:", raw.substring(0, 500));

    if (!hfResponse.ok) {
      let errorMessage = `OpenRouter API failed (${hfResponse.status})`;
      let isQuotaExhausted = hfResponse.status === 429;
      try {
        const errorData = JSON.parse(raw);
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        }
        if (
          errorData.error?.code === 429 ||
          /rate limit|quota|free-models-per-day/i.test(errorMessage) ||
          /rate limit|quota|free-models-per-day/i.test(raw)
        ) {
          isQuotaExhausted = true;
        }
      } catch (e) {
        // Keep initial error message if JSON parse fails
      }

      if (isQuotaExhausted) {
        const quotaMessage =
          "The free AI request limit has been reached. Please try again after the quota resets.";
        return res.status(429).json({
          success: false,
          status: 429,
          message: quotaMessage,
          error: quotaMessage,
        });
      }

      // Friendly, non-technical messages for other provider failures
      // (never expose raw provider details or API keys)
      if (hfResponse.status === 402) {
        const creditMessage =
          "The AI service has run out of free credits. Please try again later or contact support.";
        return res.status(402).json({
          success: false,
          status: 402,
          message: creditMessage,
          error: creditMessage,
        });
      }
      if (hfResponse.status === 404) {
        const modelMessage =
          "The configured AI model is currently unavailable. Please try again later.";
        return res.status(503).json({
          success: false,
          status: 503,
          message: modelMessage,
          error: modelMessage,
        });
      }
      if (hfResponse.status >= 500) {
        const providerMessage =
          "The AI provider had a temporary problem. Please try again in a moment.";
        return res.status(502).json({
          success: false,
          status: 502,
          message: providerMessage,
          error: providerMessage,
        });
      }

      const apiError = new Error(errorMessage);
      apiError.status = hfResponse.status;
      throw apiError;
    }

    const hfData = JSON.parse(raw);

    let botText = "I couldn't generate a response.";

    if (hfData?.choices?.[0]?.message?.content) {
      botText = hfData.choices[0].message.content.trim();
    } else if (hfData?.choices?.[0]?.finish_reason === "length") {
      botText = "The response was too long to be generated. Please try a more specific question.";
    } else if (hfData?.error) {
      botText = `❌ Error: ${hfData.error.message}`;
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

    console.log("💬 Bot reply:", botText.substring(0, 100));

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
    console.log("✅ Bot message saved");

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
    console.error("💥 Chat Error:", error.message);
    const isQuotaExhausted =
      error.status === 429 ||
      /429|rate limit|quota|free-models-per-day/i.test(error.message);

    if (isQuotaExhausted) {
      const quotaMessage =
        "The free AI request limit has been reached. Please try again after the quota resets.";
      return res.status(429).json({
        success: false,
        status: 429,
        message: quotaMessage,
        error: quotaMessage,
      });
    }

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
