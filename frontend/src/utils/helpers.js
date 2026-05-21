export const formatFileSize = (bytes) => {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(value) / Math.log(k)));

  return parseFloat((value / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Document workflow status → Badge variant
export const getStatusBadgeVariant = (status) => {
  const key = String(status || '').toLowerCase().replace(/\s+/g, '-');

  switch (key) {
    case 'analysed':
    case 'completed':
      return 'analysed';
    case 'high-risk':
      return 'high-risk';
    case 'pending-ocr':
      return 'pending-ocr';
    case 'pending':
      return 'pending';
    case 'processing':
      return 'processing';
    case 'failed':
    case 'error':
      return 'error';
    default:
      return 'default';
  }
};

// Real risk-analysis state → Badge label/variant
export const getRiskBadge = (risk) => {
  const status = risk?.status || 'not_analyzed';

  if (status === 'unavailable') return { label: 'Analysis unavailable', variant: 'default' };
  if (status === 'not_analyzed') return { label: 'Not analyzed', variant: 'default' };
  if (status === 'pending') return { label: 'Analysis queued', variant: 'info' };
  if (status === 'processing') return { label: 'Analyzing…', variant: 'info' };
  if (status === 'failed') return { label: 'Analysis failed', variant: 'error' };
  if (status === 'insufficient_evidence') {
    return { label: 'Unable to determine', variant: 'secondary' };
  }

  switch (risk?.level) {
    case 'High':
      return { label: 'High risk', variant: 'high-risk' };
    case 'Medium':
      return { label: 'Medium risk', variant: 'warning' };
    case 'Low':
      return { label: 'Low risk', variant: 'success' };
    default:
      return { label: 'Unable to determine', variant: 'secondary' };
  }
};

export const RISK_DISCLAIMER_TEXT =
  'AI risk analysis is advisory and may require human review. It is not legal or financial advice.';

// DB timestamps are stored in UTC without a timezone suffix — parse them as
// UTC (append 'Z') so display never drifts by the local timezone offset.
const parseDbDate = (dateString) => {
  const s = String(dateString);
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`);
};

export const formatDate = (dateString) => {
  const date = parseDbDate(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export const formatDateTime = (dateString) => {
  const date = parseDbDate(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const getFileExtension = (filename) => {
  return filename.split('.').pop().toUpperCase();
};

export const generateId = () => {
  return Math.random().toString(36).substr(2, 9);
};

export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export const truncateText = (text, maxLength = 100) => {
  if (text.length <= maxLength) return text;
  return text.substr(0, maxLength) + '...';
};

export const validateFile = (file) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ];
  
  const maxSize = 50 * 1024 * 1024; // 50MB
  
  if (!allowedTypes.includes(file.type)) {
    return { isValid: false, error: 'File type not supported' };
  }
  
  if (file.size > maxSize) {
    return { isValid: false, error: 'File size too large. Maximum 50MB allowed.' };
  }
  
  return { isValid: true };
};