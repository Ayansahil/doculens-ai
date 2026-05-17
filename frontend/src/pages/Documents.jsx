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
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const Documents = () => {
  // 📄 currently selected document (for view / chatbot)
  const [selectedDocument, setSelectedDocument] = useState(null);

  // 🗑️ document pending delete (used by ConfirmModal)
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [editTarget, setEditTarget] = useState(null);
  const [newStatus, setNewStatus] = useState("");

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const { documents, loading, error, fetchDocuments, updateFilters } =
    useDocuments();

  const { searchQuery } = useApp();

  // 🔍 Search filter (NO fetch loop)
  useEffect(() => {
    if (searchQuery !== undefined) {
      updateFilters({ query: searchQuery });
    }
  }, [searchQuery, updateFilters]);

  // 🎯 Handle actions coming from DocumentList (select / view / delete / edit / download)
  const handleDocumentAction = async (action, document) => {
    // 🎯 Select document (for chatbot analysis & summary)
    if (action === "select") {
      setSelectedDocument(document);
      setSummary(null);
      setSummaryLoading(true);

      try {
        const res = await documentService.summarizeDocument(document.id);
        setSummary(res.summary);
      } catch (err) {
        console.error("Summary failed", err);
        setSummary("Failed to generate summary.");
      } finally {
        setSummaryLoading(false);
      }

      return;
    }

    // 👁️ View document
    if (action === "view") {
      if (document?.file_url) {
        window.open(`${API_BASE_URL}${document.file_url}`, "_blank");
      } else {
        alert("File URL not found");
      }
      setSelectedDocument(document);
      setSummary(null);
      setSummaryLoading(true);

      try {
        const res = await documentService.summarizeDocument(document.id);
        setSummary(res.summary);
      } catch (err) {
        console.error("Summary failed", err);
        setSummary("Failed to generate summary.");
      } finally {
        setSummaryLoading(false);
      }

      return;
    }

    // 🗑️ Delete document → open confirm modal
    if (action === "delete") {
      setDeleteTarget(document);
    }

    // ✏️ Edit status
    if (action === "edit") {
      setEditTarget(document);
      setNewStatus(document.status); // current status prefill
    }

    // ⬇️ Download document
    if (action === "download") {
      try {
        const fileUrl = `${import.meta.env.VITE_API_BASE_URL}/documents/${document.id}/download`;

        // 🔽 force download (IMPORTANT FIX)
        const link = window.document.createElement("a");
        link.href = fileUrl;
        link.download = document.title || "document";
        window.document.body.appendChild(link);
        link.click();
        window.document.body.removeChild(link);
      } catch (err) {
        console.error("Download failed:", err);
        alert("Failed to download document");
      }
      return;
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DocumentList
            documents={documents}
            loading={loading}
            selectedDocumentId={selectedDocument?.id || null}
            onDocumentAction={handleDocumentAction}
          />
        </div>

        <div className="lg:col-span-1 max-h-[485px]">
          <ChatBot
            documentId={selectedDocument?.id || null}
            selectedDocument={selectedDocument}
            summary={summary}
            summaryLoading={summaryLoading}
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
