import fetch from "node-fetch";
import { supabase } from "../config/db.js";

const EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";

/**
 * Generate embeddings for a given text using OpenRouter
 * @param {string} text - Text to embed
 * @param {string|null} inputType - Optional 'passage' or 'query' for asymmetric retrieval models
 * @returns {Promise<number[]>} - Array of numeric embedding vector values
 */
export const generateEmbedding = async (text, inputType = null) => {
  const apiKey = process.env.HF_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OpenRouter API key. Please check HF_API_KEY in .env");
  }

  const model = process.env.EMBEDDING_MODEL || "nvidia/nemotron-3-embed-1b:free";

  const requestBody = {
    model,
    input: text.replace(/\n+/g, " ").trim(),
  };

  if (inputType) {
    requestBody.input_type = inputType;
  }

  try {
    const response = await fetch(EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let safeError = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        safeError = errorJson.error?.message || errorText;
      } catch {
        // keep text if not JSON
      }
      console.error(`❌ Embedding API failed (${response.status} ${response.statusText}): ${safeError}`);
      throw new Error(`Embedding API failed with status ${response.status}: ${safeError}`);
    }

    const data = await response.json();
    const embedding = data?.data?.[0]?.embedding;

    if (!Array.isArray(embedding) || embedding.length === 0 || typeof embedding[0] !== "number") {
      throw new Error(
        `Invalid embedding response structure: expected non-empty array of numbers, received ${typeof embedding}`
      );
    }

    return embedding;
  } catch (error) {
    console.error("Error generating embedding:", error.message);
    throw error;
  }
};

/**
 * Split text into chunks of 500-1000 characters
 */
export const chunkText = (text, minSize = 500, maxSize = 1000) => {
  const chunks = [];
  let currentPos = 0;

  while (currentPos < text.length) {
    let endPos = currentPos + maxSize;
    
    // If not at the end, try to find a sentence break or space
    if (endPos < text.length) {
      // Look for last period, exclamation, or question mark within the range
      const searchRange = text.substring(currentPos + minSize, endPos);
      const lastSentenceBreak = Math.max(
        searchRange.lastIndexOf(". "),
        searchRange.lastIndexOf("! "),
        searchRange.lastIndexOf("? ")
      );

      if (lastSentenceBreak !== -1) {
        endPos = currentPos + minSize + lastSentenceBreak + 1;
      } else {
        // Fallback to last space
        const lastSpace = searchRange.lastIndexOf(" ");
        if (lastSpace !== -1) {
          endPos = currentPos + minSize + lastSpace;
        }
      }
    }

    chunks.push(text.substring(currentPos, endPos).trim());
    currentPos = endPos;
  }

  return chunks.filter(c => c.length > 0);
};

/**
 * Chunk text, generate embeddings, and store in database
 */
export const chunkAndStore = async (documentId, text) => {
  try {
    console.log(`📦 Chunking and storing document: ${documentId}`);
    const chunks = chunkText(text);
    console.log(`📄 Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      console.warn(`⚠️ No text chunks extracted for document: ${documentId}`);
      return;
    }

    // 1️⃣ Delete existing chunks for this document to avoid duplicate chunks on retry
    const { error: deleteError } = await supabase
      .from("document_chunks")
      .delete()
      .eq("document_id", documentId);

    if (deleteError) {
      console.error(`Error cleaning up existing chunks for document ${documentId}:`, deleteError.message);
      throw deleteError;
    }

    // 2️⃣ Generate embeddings for each chunk with input_type: 'passage'
    const records = [];
    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i];
      const embedding = await generateEmbedding(content, "passage");
      records.push({
        document_id: documentId,
        content,
        embedding,
      });
    }

    // 3️⃣ Batch insert all chunks into database
    const { error: insertError } = await supabase
      .from("document_chunks")
      .insert(records);

    if (insertError) {
      console.error("Error storing chunk records:", insertError.message);
      throw insertError;
    }
    
    console.log(`✅ All ${records.length} chunks and embeddings stored successfully`);
  } catch (error) {
    console.error("Fatal error in chunkAndStore:", error.message);
    throw error;
  }
};

/**
 * Retrieve relevant chunks using semantic search
 */
export const getRelevantChunks = async (documentId, query, topK = 3, matchThreshold = 0.0) => {
  try {
    const queryEmbedding = await generateEmbedding(query, "query");

    const { data, error } = await supabase.rpc("match_document_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: topK,
      filter_document_id: documentId,
    });

    if (error) {
      console.error("Error in vector search:", error.message);
      throw error;
    }

    if (data && data.length > 0) {
      return data;
    }
  } catch (error) {
    console.error("Vector search retrieval unavailable:", error.message);
  }

  // Fallback: When vector retrieval is unavailable (e.g., rate limit / quota exhausted on embeddings API),
  // retrieve chunks directly for documentId from document_chunks and rank by keyword overlap
  try {
    const { data: chunks, error } = await supabase
      .from("document_chunks")
      .select("id, content")
      .eq("document_id", documentId);

    if (error || !chunks || chunks.length === 0) {
      return [];
    }

    const queryWords = query
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2);

    const scored = chunks.map((chunk) => {
      const text = chunk.content.toLowerCase();
      let score = 0;
      for (const word of queryWords) {
        if (text.includes(word)) score += 1;
      }
      return { ...chunk, similarity: score };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  } catch (fallbackErr) {
    console.error("Error in fallback chunk retrieval:", fallbackErr.message);
    return [];
  }
};

