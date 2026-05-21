export const DOCUMENT_TYPES = {
  PDF: 'PDF',
  DOC: 'DOC',
  DOCX: 'DOCX',
  TXT: 'TXT',
  XLSX: 'XLSX',
  PPTX: 'PPTX'
};

export const DOCUMENT_CATEGORIES = {
  FINANCIAL: 'Financial',
  LEGAL: 'Legal',
  ACADEMIC: 'Academic',
  BUSINESS: 'Business',
  PERSONAL: 'Personal',
  OTHER: 'Other'
};

// Values match the statuses actually stored by the upload pipeline.
export const DOCUMENT_STATUSES = {
  PENDING: 'pending',
  ANALYSED: 'analysed',
  HIGH_RISK: 'high-risk',
  PENDING_OCR: 'pending-ocr',
  PROCESSING: 'processing',
  FAILED: 'failed'
};

export const STATUS_COLORS = {
  [DOCUMENT_STATUSES.PENDING]: 'bg-yellow-100 text-yellow-800',
  [DOCUMENT_STATUSES.ANALYSED]: 'bg-green-100 text-green-800',
  [DOCUMENT_STATUSES.HIGH_RISK]: 'bg-orange-100 text-orange-800',
  [DOCUMENT_STATUSES.PENDING_OCR]: 'bg-orange-100 text-orange-800',
  [DOCUMENT_STATUSES.PROCESSING]: 'bg-blue-100 text-blue-800',
  [DOCUMENT_STATUSES.FAILED]: 'bg-red-100 text-red-800'
};

export const API_ENDPOINTS = {
  DOCUMENTS: '/api/documents',
  UPLOAD: '/api/upload',
  CHAT: '/api/chat',
  SEARCH: '/api/search',
  AUTH: '/api/auth'
};

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  USER_DATA: 'user_data',
  THEME: 'theme_preference'
};

export const ROUTES = {
  HOME: '/',
  DOCUMENTS: '/documents',
  UPLOAD: '/upload',
  SETTINGS: '/settings'
};