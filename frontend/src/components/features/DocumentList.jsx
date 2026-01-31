import { useState, useMemo } from 'react';
import { FileText, MoveHorizontal as MoreHorizontal, Download, CreditCard as Edit, Trash2, Eye, ListFilter as Filter, Calendar, Tag } from 'lucide-react';
import PropTypes from 'prop-types';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { formatDate } from '../../utils/helpers';
import { DOCUMENT_STATUSES } from '../../utils/constants';

const DocumentList = ({ documents = [], loading = false, onDocumentAction }) => {
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');


const filteredAndSortedDocuments = useMemo(() => {
  let filtered = [...documents];

 // Apply search filter
  if (searchTerm) {
    filtered = filtered.filter(doc =>
      doc.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.category?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

// Apply status filter
  if (filterStatus !== 'all') {
    filtered = filtered.filter(doc => doc.status === filterStatus);
  }

  // Apply type filter
  if (filterType !== 'all') {
    filtered = filtered.filter(doc => doc.type === filterType);
  }

  // Apply sorting
  filtered.sort((a, b) => {
    let aValue, bValue;

    switch (sortBy) {
      case 'title':
        aValue = a.title?.toLowerCase();
        bValue = b.title?.toLowerCase();
        break;

      case 'date':
        aValue = new Date(a.created_at);
        bValue = new Date(b.created_at);
        break;

      case 'type':
        aValue = a.type;
        bValue = b.type;
        break;

      case 'status':
        aValue = a.status;
        bValue = b.status;
        break;

      default:
        return 0;
    }

    if (sortOrder === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  return filtered;
}, [documents, searchTerm, filterStatus, filterType, sortBy, sortOrder]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const handleDocumentAction = (action, document) => {
    if (onDocumentAction) {
      onDocumentAction(action, document);
    } else {
      console.log(`${action} document:`, document);
    }
  };

  const getStatusBadgeVariant = (status) => {
    switch (status.toLowerCase().replace(' ', '-')) {
      case 'high-risk':
        return 'high-risk';
      case 'analysed':
        return 'analysed';
      case 'pending-ocr':
        return 'pending-ocr';
      case 'pending':
        return 'pending';
      default:
        return 'default';
    }
  };

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
          <div className="flex-1">
            <Input
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              leftIcon={<Filter size={16} />}
            />
          </div>
          
          <div className="flex gap-3">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Statuses</option>
              {Object.values(DOCUMENT_STATUSES).map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
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
        <div className="overflow-x-auto h-[320px] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left">
                  <button
                    onClick={() => handleSort('type')}
                    className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700"
                  >
                    Type
                    {sortBy === 'type' && (
                      <span className="text-primary-500">
                        {sortOrder === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left">
                  <button
                    onClick={() => handleSort('date')}
                    className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700"
                  >
                    Date
                    {sortBy === 'date' && (
                      <span className="text-primary-500">
                        {sortOrder === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left">
                  <button
                    onClick={() => handleSort('status')}
                    className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700"
                  >
                    Status
                    {sortBy === 'status' && (
                      <span className="text-primary-500">
                        {sortOrder === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
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
              {filteredAndSortedDocuments.map((document) => (
                <tr key={document.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-red-100 rounded flex items-center justify-center">
                        <FileText size={20} className="text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 truncate">
                          {document.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-500">
                            {document.type} / {document.category}
                          </span>
                          {document.size && (
                            <span className="text-xs text-gray-400">• {document.size}</span>
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
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(document.created_at)}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={getStatusBadgeVariant(document.status)}>
                      {document.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {document.project || '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDocumentAction('view', document)}
                        className="p-1 hover:bg-gray-100"
                      >
                        <Eye size={16} />
                      </Button>
                      
                      <div className="relative group">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-1 hover:bg-gray-100"
                        >
                          <MoreHorizontal size={16} />
                        </Button>
                        
                        <div className="absolute right-0 top-8 w-48 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                          <div className="py-1">
                            <button
                              onClick={() => handleDocumentAction('download', document)}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              <Download size={16} />
                              Download
                            </button>
                            <button
                              onClick={() => handleDocumentAction('edit', document)}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              <Edit size={16} />
                              Edit
                            </button>
                            <button
                              onClick={() => handleDocumentAction('delete', document)}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={16} />
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredAndSortedDocuments.length === 0 && (
          <div className="text-center py-12">
            <FileText size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No documents found</h3>
            <p className="text-gray-500">
              {searchTerm || filterStatus !== 'all' || filterType !== 'all'
                ? 'Try adjusting your filters'
                : 'Upload your first document to get started'
              }
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
    })
  ),
  loading: PropTypes.bool,
  onDocumentAction: PropTypes.func,
};

export default DocumentList;