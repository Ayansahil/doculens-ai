import { useState, useEffect, useRef } from 'react';
import { Search, X, ListFilter as Filter, Clock, FileText } from 'lucide-react';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import PropTypes from 'prop-types';
import { useApp } from '../../context/AppContext';
import { debounce } from '../../utils/helpers';

const SearchBar = ({ onSearch, onFilterChange, placeholder = "Search documents..." }) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    type: '',
    category: '',
    status: '',
    dateRange: ''
  });
  
  const searchRef = useRef();
  const { searchQuery, setSearchQuery } = useApp();

  // Initialize with global search query
  useEffect(() => {
    if (searchQuery) {
      setQuery(searchQuery);
      performSearch(searchQuery);
    }
  }, [searchQuery]);

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('recent_searches');
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to parse recent searches:', error);
      }
    }
  }, []);

  // Save recent searches to localStorage
  const saveRecentSearch = (searchTerm) => {
    if (!searchTerm.trim()) return;
    
    const updated = [
      searchTerm,
      ...recentSearches.filter(s => s !== searchTerm)
    ].slice(0, 5); // Keep only 5 recent searches
    
    setRecentSearches(updated);
    localStorage.setItem('recent_searches', JSON.stringify(updated));
  };

  // Debounced search function
  const debouncedSearch = debounce((searchTerm) => {
    performSearch(searchTerm);
  }, 300);

  const performSearch = async (searchTerm) => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    setShowResults(true);

    try {
      // Mock search results - replace with actual API call
      const mockResults = [
        {
          id: 1,
          title: 'Q4 2024 Financial Report',
          type: 'PDF',
          category: 'Financial',
          status: 'High Risk',
          excerpt: 'Financial report showing 3 inconsistencies flagged. Net profit variance: 12%...',
          matchedTerms: [searchTerm],
          date: '2025-01-25'
        },
        {
          id: 2,
          title: 'Smith v. Jones Contract',
          type: 'PDF',
          category: 'Legal',
          status: 'Analysed',
          excerpt: 'Contract containing termination clause on page 7. Parties: John Smith, Jane Jones...',
          matchedTerms: [searchTerm],
          date: '2025-01-20'
        }
      ].filter(item => 
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.excerpt.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase())
      );

      setTimeout(() => {
        setSearchResults(mockResults);
        setIsSearching(false);
      }, 500);

    } catch (error) {
      console.error('Search error:', error);
      setIsSearching(false);
      setSearchResults([]);
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    setSearchQuery(value);
    
    if (onSearch) {
      debouncedSearch(value);
    } else {
      // For global search, just update the query
      debouncedSearch(value);
    }
  };

  const handleSearch = () => {
    if (query.trim()) {
      saveRecentSearch(query);
      performSearch(query);
      
      if (onSearch) {
        onSearch(query, filters);
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearSearch = () => {
    setQuery('');
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
    
    if (onSearch) {
      onSearch('', filters);
    }
  };

  const selectRecentSearch = (searchTerm) => {
    setQuery(searchTerm);
    setSearchQuery(searchTerm);
    performSearch(searchTerm);
    setShowResults(false);
  };

  const handleFilterChange = (filterKey, value) => {
    const newFilters = { ...filters, [filterKey]: value };
    setFilters(newFilters);
    
    if (onFilterChange) {
      onFilterChange(newFilters);
    }
  };

  const getStatusBadgeVariant = (status) => {
    switch (status.toLowerCase().replace(' ', '-')) {
      case 'high-risk':
        return 'error';
      case 'analysed':
        return 'success';
      case 'pending-ocr':
        return 'warning';
      default:
        return 'default';
    }
  };

  // Click outside to close results
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={searchRef} className="relative w-full max-w-2xl">
      {/* Search Input */}
      <div className="relative">
        <Input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          onFocus={() => {
            if (query || recentSearches.length > 0) {
              setShowResults(true);
            }
          }}
          leftIcon={<Search size={16} />}
          rightIcon={
            <div className="flex shrink-0 items-center gap-1">
              {query && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSearch}
                  className="h-7 w-7 p-0 hover:bg-gray-200 rounded"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className={`h-7 w-7 p-0 rounded ${showFilters ? 'bg-primary-100 text-primary-600' : 'hover:bg-gray-100'}`}
                aria-label="Search filters"
                aria-expanded={showFilters}
              >
                <Filter size={14} />
              </Button>
            </div>
          }
          className="pr-20"
        />
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <Card className="absolute top-full mt-2 w-full z-50 p-4">
          <h3 className="font-medium text-gray-900 mb-3">Search Filters</h3>
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 md:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
              <select
                value={filters.type}
                onChange={(e) => handleFilterChange('type', e.target.value)}
                className="w-full text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">All Types</option>
                <option value="PDF">PDF</option>
                <option value="DOC">DOC</option>
                <option value="DOCX">DOCX</option>
                <option value="TXT">TXT</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <select
                value={filters.category}
                onChange={(e) => handleFilterChange('category', e.target.value)}
                className="w-full text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">All Categories</option>
                <option value="Financial">Financial</option>
                <option value="Legal">Legal</option>
                <option value="Academic">Academic</option>
                <option value="Business">Business</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">All Statuses</option>
                <option value="Analysed">Analysed</option>
                <option value="High Risk">High Risk</option>
                <option value="Pending OCR">Pending OCR</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
              <select
                value={filters.dateRange}
                onChange={(e) => handleFilterChange('dateRange', e.target.value)}
                className="w-full text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">Any Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
              </select>
            </div>
          </div>
        </Card>
      )}

      {/* Search Results */}
      {showResults && (
        
        <Card className="absolute top-full mt-2 w-full z-40 max-h-96 overflow-y-auto">
          {isSearching ? (
            <div className="p-4 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary-500 border-t-transparent mx-auto mb-2" />
              <p className="text-sm text-gray-600">Searching...</p>
            </div>
          ) : searchResults.length > 0 ? (
            <div>
              <div className="p-3 border-b border-gray-200">
                <h3 className="text-sm font-medium text-gray-900">
                  Search Results ({searchResults.length})
                </h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {searchResults.map((result) => (
                  <div
                    key={result.id}
                    className="p-4 hover:bg-gray-50 border-b border-gray-100 cursor-pointer"
                    onClick={() => {
                      // Handle result selection
                      setShowResults(false);
                      console.log('Selected result:', result);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText size={16} className="text-gray-400 flex-shrink-0" />
                        <h4 className="min-w-0 font-medium text-gray-900 text-sm break-words [overflow-wrap:anywhere]">{result.title}</h4>
                      </div>
                      <Badge variant={getStatusBadgeVariant(result.status)} size="sm" className="flex-shrink-0">
                        {result.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-600 mb-2 break-words [overflow-wrap:anywhere]">{result.excerpt}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                      <span>{result.type} / {result.category}</span>
                      <span>{result.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : query ? (
            <div className="p-4 text-center">
              <Search size={24} className="mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-600">No results found for &quot;{query}&quot;</p>
              <p className="text-xs text-gray-500 mt-1">Try adjusting your search terms or filters</p>
            </div>
          ) : recentSearches.length > 0 ? (
            <div>
              <div className="p-3 border-b border-gray-200">
                <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <Clock size={14} />
                  Recent Searches
                </h3>
              </div>
              <div>
                {recentSearches.map((searchTerm, index) => (
                  <button
                    key={index}
                    onClick={() => selectRecentSearch(searchTerm)}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Clock size={12} className="text-gray-400" />
                    {searchTerm}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
};

export default SearchBar;

SearchBar.propTypes = {
  onSearch: PropTypes.func,
  onFilterChange: PropTypes.func,
  placeholder: PropTypes.string,
};