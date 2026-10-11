import axios from "axios";
import { STORAGE_KEYS } from "../utils/constants";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER_DATA);
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export const api = {
  // Authentication
  login: (credentials) => apiClient.post("/auth/login", credentials),
  register: (userData) => apiClient.post("/auth/register", userData),
  logout: () => apiClient.post("/auth/logout"),

  // Documents
  getDocuments: (params = {}) => apiClient.get("/documents", { params }),
  getDocument: (id) => apiClient.get(`/documents/${id}`),
  uploadDocument: (formData, onUploadProgress) =>
    apiClient.post("/documents/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress,
    }),
  updateDocument: (id, data) => apiClient.put(`/documents/${id}`, data),
  deleteDocument: (id) => apiClient.delete(`/documents/${id}`),

  // Search
  searchDocuments: (query) =>
    apiClient.get("/search", { params: { q: query } }),

  // Chat
  sendChatMessage: (message, documentId = null) =>
    apiClient.post("/chat", { message, documentId }),
  getChatHistory: (documentId = null) =>
    apiClient.get("/chat/history", { params: { documentId } }),

  // Analytics
  getDashboardStats: () => apiClient.get("/analytics/dashboard"),
  getStorageInfo: () => apiClient.get("/analytics/storage"),

  // Documents – AI Summary
  summarizeDocument: (id) => apiClient.post(`/documents/${id}/summarize`),
};

export default apiClient;
