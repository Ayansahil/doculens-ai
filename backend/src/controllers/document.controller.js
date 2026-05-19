import { supabase } from "../config/db.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as ragService from "../services/rag.service.js";

// For ES modules __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/* ================================
   🧠 TEXT EXTRACTION HELPER
================================ */
const extractTextFromFile = async (filePath, extension) => {
  try {
    console.log(`🔍 Attempting to extract from: ${extension} file`);
    console.log(`📂 File path: ${filePath}`);
    console.log(`✅ File exists: ${fs.existsSync(filePath)}`);

    if (!fs.existsSync(filePath)) {
      console.error("❌ File does not exist!");
      return null;
    }

    if (extension === "PDF") {
      console.log("📄 Processing PDF...");
      const dataBuffer = fs.readFileSync(filePath);
      console.log(`📊 Buffer size: ${dataBuffer.length} bytes`);
      
      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(dataBuffer),
        useSystemFonts: true,
      });
      
      const pdfDocument = await loadingTask.promise;
      console.log(`📄 Number of pages: ${pdfDocument.numPages}`);
      
      let fullText = '';
      
      // Extract text from each page
      for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
      }
      
      console.log(`✅ PDF parsed successfully`);
      console.log(`📝 Text length: ${fullText.length}`);
      console.log(`📋 Preview: ${fullText.substring(0, 200)}`);
      
      return fullText.trim() || null;
    }

    if (extension === "DOCX") {
      console.log("📄 Processing DOCX...");
      const result = await mammoth.extractRawText({ path: filePath });
      console.log(`✅ DOCX parsed successfully`);
      console.log(`📝 Text length: ${result.value?.length || 0}`);
      console.log(`📋 Preview: ${result.value?.substring(0, 200)}`);
      return result.value || null;
    }

    if (extension === "TXT") {
      console.log("📄 Processing TXT...");
      const text = fs.readFileSync(filePath, "utf-8");
      console.log(`✅ TXT read successfully`);
      console.log(`📝 Text length: ${text?.length || 0}`);
      return text || null;
    }

    console.log(`⚠️ Unsupported file type: ${extension}`);
    return null;
  } catch (err) {
    console.error("❌ Text extraction ERROR:", err);
    console.error("❌ Error stack:", err.stack);
    return null;
  }
};

/* ================================
   🔒 OWNERSHIP HELPER (allows legacy rows with NULL user_id)
================================ */
const isForbidden = (row, userId) =>
  row?.user_id != null && row.user_id !== userId;

/* ================================
   📄 GET ALL DOCUMENTS
================================ */
export const getAllDocuments = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type, category, query } = req.query;

    let dbQuery = supabase
      .from("documents")
      .select("*", { count: "exact" })
      .or(`user_id.eq.${req.user.id},user_id.is.null`)
      .order("created_at", { ascending: false });

    if (status) dbQuery = dbQuery.eq("status", status);
    if (type) dbQuery = dbQuery.eq("type", type);
    if (category) dbQuery = dbQuery.eq("category", category);
    if (query) {
      dbQuery = dbQuery.or(
        `title.ilike.%${query}%,description.ilike.%${query}%`
      );
    }

    const from = (page - 1) * limit;
    const to = from + parseInt(limit) - 1;

    const { data, error, count } = await dbQuery.range(from, to);

    if (error) throw error;

    res.json({
      documents: data || [],
      total: count || 0,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch documents",
      error: error.message,
    });
  }
};

/* ================================
   📄 GET DOCUMENT BY ID
================================ */
export const getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ message: "Document not found" });
      }
      throw error;
    }

    if (isForbidden(data, req.user.id)) {
      return res.status(403).json({ message: "Forbidden: not your document" });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch document",
      error: error.message,
    });
  }
};

/* ================================
   ⬆️ UPLOAD + EXTRACT
================================ */
export const uploadDocument = async (req, res) => {
  try {
    console.log("\n========================================");
    console.log("📤 NEW UPLOAD REQUEST");
    console.log("========================================");
    
    if (!req.file) {
      console.error("❌ No file in request");
      return res.status(400).json({ message: "No file uploaded" });
    }

    console.log("📁 File details:");
    console.log("  - Original name:", req.file.originalname);
    console.log("  - Filename:", req.file.filename);
    console.log("  - Size:", req.file.size, "bytes");
    console.log("  - Mimetype:", req.file.mimetype);

    const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
    console.log("📋 Metadata:", metadata);

    const fileExtension = path
      .extname(req.file.originalname)
      .substring(1)
      .toUpperCase();

    console.log("🔍 Detected extension:", fileExtension);

    const filePath = path.join(process.cwd(), "uploads", req.file.filename);
    console.log("📂 Full file path:", filePath);

    // ✅ EXTRACT TEXT
    console.log("\n🔄 Starting text extraction...");
    const extractedText = await extractTextFromFile(filePath, fileExtension);

    if (!extractedText) {
      console.warn("⚠️ WARNING: No text extracted from file!");
    } else {
      console.log("✅ Text extracted successfully!");
      console.log(`📊 Total characters: ${extractedText.length}`);
    }

    const documentData = {
      title: metadata.title || req.file.originalname,
      type: fileExtension,
      category: metadata.category || "Other",
      status: "pending",
      description: metadata.description || "",
      file_url: `/uploads/${req.file.filename}`,
      file_size: req.file.size,
      project: metadata.project || null,
      extracted_text: extractedText,
      user_id: req.user.id,
    };

    console.log("\n💾 Saving to database...");
    console.log("Document data:", {
      ...documentData,
      extracted_text: extractedText ? `${extractedText.substring(0, 100)}...` : null
    });

    const { data, error } = await supabase
      .from("documents")
      .insert([documentData])
      .select()
      .single();

    if (error) {
      console.error("❌ Database insertion error:", error);
      throw error;
    }

    console.log("✅ Document saved to database!");
    console.log("📌 Document ID:", data.id);

    // 🚀 ASYNC CHUNKING & EMBEDDINGS (RAG)
    if (extractedText) {
      console.log("🤖 Starting RAG processing...");
      try {
        await ragService.chunkAndStore(data.id, extractedText);
        // Mark document as analysed on successful chunking & embedding storage
        const { data: updatedDoc, error: updateError } = await supabase
          .from("documents")
          .update({ status: "analysed" })
          .eq("id", data.id)
          .select()
          .single();

        if (!updateError && updatedDoc) {
          data.status = updatedDoc.status;
        } else {
          data.status = "analysed";
        }
        console.log("✅ Document RAG processing succeeded and status marked as analysed");
      } catch (ragError) {
        console.error("❌ RAG Processing failed:", ragError.message);
        // Mark document status as failed and report the error clearly
        await supabase
          .from("documents")
          .update({ status: "failed" })
          .eq("id", data.id);

        data.status = "failed";
        data.rag_error = ragError.message;
      }
    }

    console.log("========================================\n");

    res.status(201).json(data);
  } catch (error) {
    console.error("\n❌❌❌ UPLOAD ERROR ❌❌❌");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("========================================\n");
    
    res.status(500).json({
      message: "Failed to upload document",
      error: error.message,
    });
  }
};

/* ================================
   ✏️ UPDATE DOCUMENT
================================ */
export const updateDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: fetchError } = await supabase
      .from("documents")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return res.status(404).json({ message: "Document not found" });
      }
      throw fetchError;
    }

    if (isForbidden(existing, req.user.id)) {
      return res.status(403).json({ message: "Forbidden: not your document" });
    }

    const { data, error } = await supabase
      .from("documents")
      .update(req.body)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(500).json({
      message: "Failed to update document",
      error: error.message,
    });
  }
};

/* ================================
   🗑 DELETE DOCUMENT
=============================== */
export const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: fetchError } = await supabase
      .from("documents")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return res.status(404).json({ message: "Document not found" });
      }
      throw fetchError;
    }

    if (isForbidden(existing, req.user.id)) {
      return res.status(403).json({ message: "Forbidden: not your document" });
    }

    // Clean up associated chunks and chat history to prevent orphans
    await supabase.from("document_chunks").delete().eq("document_id", id);
    await supabase.from("chat_history").delete().eq("document_id", id);

    const { error } = await supabase.from("documents").delete().eq("id", id);

    if (error) throw error;

    res.json({ message: "Document deleted successfully" });
  } catch (error) {
    res.status(500).json({
      message: "Failed to delete document",
      error: error.message,
    });
  }
};

/* ================================
   ⬇️ DOWNLOAD DOCUMENT
================================ */
export const downloadDocumentLogic = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("documents")
      .select("file_url, title, user_id")
      .eq("id", id)
      .single();

    if (error || !data) {
      return res.status(404).json({ message: "Document not found" });
    }

    if (isForbidden(data, req.user.id)) {
      return res.status(403).json({ message: "Forbidden: not your document" });
    }

    const absolutePath = path.join(process.cwd(), data.file_url);
    res.download(absolutePath, data.title);
  } catch (error) {
    res.status(500).json({ message: "Failed to download document" });
  }
};

/* ================================
   💡SUMMARIZE DOCUMENT
================================ */

export const summarizeDocument = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Fetch document
    const { data: document, error } = await supabase
      .from("documents")
      .select("id, title, extracted_text, user_id")
      .eq("id", id)
      .single();

    if (error || !document) {
      return res.status(404).json({ message: "Document not found" });
    }

    if (isForbidden(document, req.user.id)) {
      return res.status(403).json({ message: "Forbidden: not your document" });
    }

    if (!document.extracted_text || document.extracted_text.length < 50) {
      return res.status(400).json({
        message: "Document text not available for summarization",
      });
    }

    // 2️⃣ SIMPLE SUMMARY LOGIC (NO AI)
    const sentences = document.extracted_text
      .replace(/\n+/g, " ")
      .split(".")
      .map(s => s.trim())
      .filter(Boolean);

    const summarySentences = sentences.slice(0, 4);
    const summary = summarySentences.join(". ") + ".";

    // 3️⃣ Response
    res.json({
      documentId: document.id,
      title: document.title,
      summary,
      sentenceCount: summarySentences.length,
    });

  } catch (error) {
    console.error("Summarize error:", error);
    res.status(500).json({
      message: "Failed to summarize document",
      error: error.message,
    });
  }
};
