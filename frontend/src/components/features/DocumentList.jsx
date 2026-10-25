import { useState, useMemo } from "react";
import {
  FileText,
  MoveHorizontal as MoreHorizontal,
  Download,
  CreditCard as Edit,
  Trash2,
  Eye,
  ListFilter as Filter,
  Calendar,
  Tag,
  ShieldAlert,
} from "lucide-react";
import PropTypes from "prop-types";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Input from "../ui/Input";
import {
  formatDate,
  formatFileSize,
  getRiskBadge,
  getStatusBadgeVariant,
} from "../../utils/helpers";
import { DOCUMENT_STATUSES } from "../../utils/constants";

const DocumentList = ({
  documents = [],
  loading = false,
  selectedDocumentId = null,
  onDocumentAction,
}) => {
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredAndSortedDocuments = useMemo(() => {
    let filtered = [...documents];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (doc) =>
          doc.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          doc.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          doc.category?.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    // Apply status filter (normalized so legacy values like "Pending OCR" match)
    if (filterStatus !== "all") {
      filtered = filtered.filter(
        (doc) =>
          String(doc.status || "")
            .toLowerCase()
            .replace(/\s+/g, "-") === filterStatus,
      );
    }

    // Apply type filter
    if (filterType !== "all") {
      filtered = filtered.filter((doc) => doc.type === filterType);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case "title":
          aValue = a.title?.toLowerCase();
          bValue = b.title?.toLowerCase();
          break;

        case "date":
          aValue = new Date(a.created_at);
          bValue = new Date(b.created_at);
          break;

        case "type":
          aValue = a.type;
          bValue = b.type;
          break;

        case "status":
          aValue = a.status;
          bValue = b.status;
          break;

        default:
          return 0;
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [documents, searchTerm, filterStatus, filterType, sortBy, sortOrder]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const handleDocumentAction = (action, document) => {
    if (onDocumentAction) {
      onDocumentAction(action, document);
    } else {
      console.log(`${action} document:`, document);
    }
  };

  const formatStatusLabel = (status) =>
    status.charAt(0).toUpperCase() + status.slice(1).replace(/-/g, " ");

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center space-x-4">
              <div className="h-12 w-12 bg-gray-200 rounded"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters and Search */}
      <Card className="p-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="min-w-0 flex-1">
            <Input
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              leftIcon={<Filter size={16} />}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Statuses</option>
              {Object.values(DOCUMENT_STATUSES).map((status) => (
                <option key={status} value={status}>
                  {formatStatusLabel(status)}
                </option>
              ))}
            </select>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Types</option>
              <option value="PDF">PDF</option>
              <option value="DOC">DOC</option>
              <option value="DOCX">DOCX</option>
              <option value="TXT">TXT</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Documents Table */}
      <Card className="overflow-hidden">
        <div
          role="region"
          aria-label="Document table; scroll horizontally to see all columns"
          tabIndex={0}
          className="max-h-[60vh] min-w-0 overflow-auto focus-visible:outline"
        >
          <table className="w-full min-w-[48rem] xl:min-w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left">
                  <button
                    onClick={() => handleSort("type")}
                    className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700"
                  >
                    Type
                    {sortBy === "type" && (
                      <span className="text-primary-500">
                        {sortOrder === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left">
                  <button
                    onClick={() => handleSort("date")}
                    className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700"
                  >
                    Date
                    {sortBy === "date" && (
                      <span className="text-primary-500">
                        {sortOrder === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left">
                  <button
                    onClick={() => handleSort("status")}
                    className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700"
                  >
                    Status
                    {sortBy === "status" && (
                      <span className="text-primary-500">
                        {sortOrder === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Risk
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Project
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredAndSortedDocuments.map((document) => {
                const isSelected = selectedDocumentId === document.id;
                const riskBadge = getRiskBadge(document.risk);
                const analysisLabel =
                  document.risk?.status === "not_analyzed" ||
                  !document.risk?.status
                    ? "Analyze risk"
                    : "Re-run risk analysis";

                return (
                  <tr
                    key={document.id}
                    onClick={() => handleDocumentAction("select", document)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleDocumentAction("select", document);
                      }
                    }}
                    tabIndex={0}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-primary-50/80 hover:bg-primary-100/70 border-l-4 border-primary-500"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-red-100 rounded flex items-center justify-center flex-shrink-0">
                          <FileText size={20} className="text-red-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <h4 className="min-w-0 break-words font-medium text-gray-900 [overflow-wrap:anywhere]">
                              {document.title}
                            </h4>
                            {isSelected && (
                              <Badge variant="success" size="sm" className="shrink-0">
                                Selected
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-gray-500">
                              {document.type} / {document.category}
                            </span>
                            {document.file_size != null && (
                              <span className="text-xs text-gray-400">
                                • {formatFileSize(document.file_size)}
                              </span>
                            )}
                          </div>
                          {document.description && (
                            <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                              {document.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="break-words px-6 py-4 text-sm text-gray-500 [overflow-wrap:anywhere]">
                      {formatDate(document.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={getStatusBadgeVariant(document.status)}>
                        {document.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div
                        className="flex flex-col items-start gap-1"
                        title={document.risk?.summary || undefined}
                      >
                        <Badge variant={riskBadge.variant} size="sm">
                          {riskBadge.label}
                        </Badge>
                        {typeof document.risk?.score === "number" && (
                          <span className="text-xs text-gray-500">
                            Score {document.risk.score}/100
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {document.project || "-"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDocumentAction("view", document);
                          }}
                          className="min-h-11 min-w-11 p-1 hover:bg-gray-100"
                          title="View document"
                          aria-label={`View ${document.title}`}
                        >
                          <Eye size={16} />
                        </Button>

                        <details
                          className="relative"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <summary
                            aria-label={`Actions for ${document.title}`}
                            className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-md p-1 text-gray-600 hover:bg-gray-100 focus-visible:outline"
                          >
                            <MoreHorizontal size={16} />
                          </summary>

                          <div className="mt-1 w-48 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white text-left shadow-lg">
                            <div className="py-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDocumentAction("download", document);
                                }}
                                className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                              >
                                <Download size={16} />
                                Download
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDocumentAction("edit", document);
                                }}
                                className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                              >
                                <Edit size={16} />
                                Edit
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDocumentAction("analyze", document);
                                }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                <ShieldAlert size={16} />
                                {analysisLabel}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDocumentAction("delete", document);
                                }}
                                className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                              >
                                <Trash2 size={16} />
                                Delete
                              </button>
                            </div>
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredAndSortedDocuments.length === 0 && (
          <div className="text-center py-12">
            <FileText size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No documents found
            </h3>
            <p className="text-gray-500">
              {searchTerm || filterStatus !== "all" || filterType !== "all"
                ? "Try adjusting your filters"
                : "Upload your first document to get started"}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};

DocumentList.propTypes = {
  documents: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      title: PropTypes.string.isRequired,
      type: PropTypes.string.isRequired,
      category: PropTypes.string.isRequired,
      status: PropTypes.string.isRequired,
      created_at: PropTypes.string.isRequired,
      project: PropTypes.string,
    }),
  ),
  loading: PropTypes.bool,
  selectedDocumentId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onDocumentAction: PropTypes.func,
};

export default DocumentList;
