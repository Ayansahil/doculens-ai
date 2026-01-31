import { useState, useEffect } from "react";
import DocumentList from "../components/features/DocumentList";
import DocumentUpload from "../components/features/DocumentUpload";
import ChatBot from "../components/features/ChatBot";
import { useDocuments } from "../hooks/useDocuments";
import { useApp } from "../context/AppContext";

const Documents = () => {
  const [selectedDocument, setSelectedDocument] = useState(null);

  const {
    documents,
    loading,
    error,
    fetchDocuments,
    updateFilters,
  } = useDocuments();

  const { searchQuery } = useApp();

  // 🔍 Search filter (NO fetch loop)
  useEffect(() => {
    if (searchQuery !== undefined) {
      updateFilters({ query: searchQuery });
    }
  }, [searchQuery, updateFilters]);

  const handleDocumentAction = (action, document) => {
    if (action === "view") {
      setSelectedDocument(document);
    }
  };

  if (error) {
    return (
      <div className="text-center text-red-500">
        Failed to load documents
      </div>
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

        <div className="lg:col-span-1">
          <ChatBot documentId={selectedDocument?.id || null} />
        </div>
      </div>
    </div>
  );
};

export default Documents;
