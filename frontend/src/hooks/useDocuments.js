import { useState, useEffect, useCallback } from "react";
import documentService from "../services/documentService";

export const useDocuments = (initialFilters = {}) => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState(initialFilters);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  // ✅ FETCH (NO pagination dependency inside callback)
  const fetchDocuments = useCallback(
    async (page = pagination.page) => {
      try {
        setLoading(true);
        setError(null);

        const params = {
          ...filters,
          page,
          limit: pagination.limit,
        };

        const res = await documentService.getDocuments(params);

        setDocuments(res.documents || []);

        // ✅ pagination updated ONCE, not triggering loop
        setPagination((prev) => ({
          ...prev,
          page: res.page ?? prev.page,
          total: res.total ?? 0,
          totalPages: res.totalPages ?? 0,
        }));
      } catch (err) {
        console.error(err);
        setError("Failed to load documents");
      } finally {
        setLoading(false);
      }
    },
    [filters, pagination.limit] // ❗ page removed from dependency
  );

  // ✅ runs only when filters OR page changes
  useEffect(() => {
    fetchDocuments(pagination.page);
  }, [filters, pagination.page, fetchDocuments]);

  // ✅ safe filter update
  const updateFilters = useCallback((newFilters) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  // ✅ page change handler (future use)
  const changePage = (page) => {
    setPagination((prev) => ({ ...prev, page }));
  };

  return {
    documents,
    loading,
    error,
    pagination,
    updateFilters,
    fetchDocuments,
    changePage,
  };
};
