import { useState, useEffect } from "react";
import DocumentList from "../components/features/DocumentList";
import DocumentUpload from "../components/features/DocumentUpload";
import ChatBot from "../components/features/ChatBot";
import { useDocuments } from "../hooks/useDocuments";
import { useApp } from "../context/AppContext";
import { documentService } from "../services/documentService";
import ConfirmModal from "../components/ui/ConfirmModal";
import StatusModal from "../components/ui/StatusModal";

const Documents = () => {
  // 📄 currently selected document (for view / chatbot)
  const [selectedDocument, setSelectedDocument] = useState(null);

  // 🗑️ document pending delete (used by ConfirmModal)
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [editTarget, setEditTarget] = useState(null);
  const [newStatus, setNewStatus] = useState("");

  const { documents, loading, error, fetchDocuments, updateFilters } =
    useDocuments();

  const { searchQuery } = useApp();

  // 🔍 Search filter (NO fetch loop)
  useEffect(() => {
    if (searchQuery !== undefined) {
      updateFilters({ query: searchQuery });
    }
  }, [searchQuery, updateFilters]);

  // 🎯 Handle actions coming from DocumentList (view / delete)
  const handleDocumentAction = (action, document) => {
    // 👁️ View document
    if (action === "view") {
      setSelectedDocument(document);
      return;
    }

    // 🗑️ Delete document → open confirm modal
    if (action === "delete") {
      setDeleteTarget(document);
    }

    if (action === "edit") {
      setEditTarget(document);
      setNewStatus(document.status); // current status prefill
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
            onDocumentAction={handleDocumentAction}
          />
        </div>

        <div className="lg:col-span-1 max-h-[485px]">
          <ChatBot documentId={selectedDocument?.id || null} />
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
