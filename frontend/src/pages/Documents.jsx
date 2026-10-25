import { useState, useEffect } from "react";
import DocumentList from "../components/features/DocumentList";
import DocumentUpload from "../components/features/DocumentUpload";
import ChatBot from "../components/features/ChatBot";
import { useDocuments } from "../hooks/useDocuments";
import { useApp } from "../context/AppContext";
import { documentService } from "../services/documentService";
import ConfirmModal from "../components/ui/ConfirmModal";
import StatusModal from "../components/ui/StatusModal";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

const Documents = () => {
  // 📄 currently selected document (for view / chatbot)
  const [selectedDocument, setSelectedDocument] = useState(null);

  // 🗑️ document pending delete (used by ConfirmModal)
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [editTarget, setEditTarget] = useState(null);
  const [newStatus, setNewStatus] = useState("");

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // 🧠 Stored, evidence-grounded risk analysis for the selected document
  const [riskAnalysis, setRiskAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);

  const { documents, loading, error, fetchDocuments, updateFilters } =
    useDocuments();

  const { searchQuery, addNotification } = useApp();

  // 🔍 Search filter (NO fetch loop)
  useEffect(() => {
    if (searchQuery !== undefined) {
      updateFilters({ query: searchQuery });
    }
  }, [searchQuery, updateFilters]);

  const loadSummary = async (document) => {
    setSummary(null);
    setSummaryLoading(true);
    try {
      const res = await documentService.summarizeDocument(document.id);
      setSummary(res.summary);
    } catch (err) {
      console.error("Summary failed", err);
      setSummary(
        err.response?.data?.message ||
          "Summary is unavailable for this document."
      );
    } finally {
      setSummaryLoading(false);
    }
  };

  const loadAnalysis = async (documentId) => {
    setAnalysisError(null);
    setAnalysisLoading(true);
    try {
      const analysis = await documentService.getDocumentAnalysis(documentId);
      setRiskAnalysis(analysis);
    } catch (err) {
      console.error("Risk analysis load failed", err);
      setRiskAnalysis(null);
      setAnalysisError(
        err.response?.data?.message ||
          err.message ||
          "Failed to load the stored risk analysis."
      );
    } finally {
      setAnalysisLoading(false);
    }
  };

  const selectDocument = (document, { openFile = false } = {}) => {
    setSelectedDocument(document);
    if (openFile && document?.file_url) {
      window.open(`${API_BASE_URL}${document.file_url}`, "_blank");
    }
    loadSummary(document);
    loadAnalysis(document.id);
  };

  // 🎯 Handle actions coming from DocumentList (select / view / delete / edit / download)
  const handleDocumentAction = async (action, document) => {
    // 🎯 Select document (for chatbot analysis & summary)
    if (action === "select") {
      selectDocument(document);
      return;
    }

    // 👁️ View document
    if (action === "view") {
      selectDocument(document, { openFile: true });
      return;
    }

    // 🗑️ Delete document → open confirm modal
    if (action === "delete") {
      setDeleteTarget(document);
      return;
    }

    // ✏️ Edit status
    if (action === "edit") {
      setEditTarget(document);
      setNewStatus(document.status); // current status prefill
      return;
    }

    // ⬇️ Download document (authenticated blob request)
    if (action === "download") {
      try {
        await documentService.downloadDocument(document.id, document.title);
      } catch (err) {
        console.error("Download failed:", err);
        addNotification({
          type: "error",
          message:
            err.response?.data?.message || "Failed to download document",
        });
      }
      return;
    }

    // 🧠 Run/retry the real risk analysis
    if (action === "analyze") {
      setAnalysisLoading(true);
      setAnalysisError(null);
      try {
        const res = await documentService.analyzeDocumentRisk(document.id, true);
        setSelectedDocument(document);
        setRiskAnalysis(res.analysis);
        addNotification({
          type: "success",
          message: res.cached
            ? "Showing the stored risk analysis"
            : "Risk analysis completed",
        });
        fetchDocuments();
      } catch (err) {
        console.error("Risk analysis failed:", err);
        setRiskAnalysis(err.response?.data?.analysis || null);
        setAnalysisError(
          err.response?.data?.message ||
            err.message ||
            "Risk analysis failed. Please try again."
        );
        addNotification({
          type: "error",
          message:
            err.response?.data?.message || "Risk analysis failed",
        });
      } finally {
        setAnalysisLoading(false);
      }
    }
  };

  // ❌ Error state
  if (error) {
    return (
      <div className="text-center text-red-500">Failed to load documents</div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Documents</h1>

      {/* ⬆️ Upload */}
      <DocumentUpload onUploadComplete={fetchDocuments} />

      {/* 📄 Documents + 🤖 Chat */}
      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <DocumentList
            documents={documents}
            loading={loading}
            selectedDocumentId={selectedDocument?.id || null}
            onDocumentAction={handleDocumentAction}
          />
        </div>

        <div className="min-w-0 h-[min(70vh,30rem)] min-h-[20rem] xl:col-span-1 xl:h-[30rem] xl:min-h-[30rem]">
          <ChatBot
            documentId={selectedDocument?.id || null}
            selectedDocument={selectedDocument}
            summary={summary}
            summaryLoading={summaryLoading}
            riskAnalysis={riskAnalysis}
            analysisLoading={analysisLoading}
            analysisError={analysisError}
            onAnalyzeRisk={() =>
              selectedDocument &&
              handleDocumentAction("analyze", selectedDocument)
            }
          />
        </div>
      </div>

      {/* 🗑️ Reusable Confirm Delete Modal */}
      <ConfirmModal
        open={!!deleteTarget} // modal opens when deleteTarget exists
        title="Delete Document"
        message={`Are you sure you want to delete "${deleteTarget?.title}"?`}
        confirmText="Delete"
        cancelText="Cancel"
        onCancel={() => setDeleteTarget(null)} // close modal
        onConfirm={async () => {
          try {
            // 🗑️ API call to delete document
            await documentService.deleteDocument(deleteTarget.id);

            // 🧹 If deleted document was selected, reset it
            if (selectedDocument?.id === deleteTarget.id) {
              setSelectedDocument(null);
              setSummary(null);
              setRiskAnalysis(null);
              setAnalysisError(null);
            }

            // 🔄 refresh list after delete
            fetchDocuments();

            // ❌ close modal
            setDeleteTarget(null);
          } catch (err) {
            console.error("Delete failed:", err);
            alert("Failed to delete document");
          }
        }}
      />

      {/* ✏️ Edit Status Modal */}
      <StatusModal
        open={!!editTarget}
        title={`Update Status`}
        status={newStatus}
        onChange={setNewStatus}
        onCancel={() => setEditTarget(null)}
        onSave={async () => {
          try {
            await documentService.updateDocument(editTarget.id, {
              status: newStatus,
            });

            fetchDocuments(); // 🔄 refresh list
            setEditTarget(null); // ❌ close modal
          } catch (err) {
            console.error("Status update failed:", err);
            alert("Failed to update status");
          }
        }}
      />
    </div>
  );
};

export default Documents;
