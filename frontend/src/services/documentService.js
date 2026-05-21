import { api } from "./api";
import { validateFile } from "../utils/helpers";

export const documentService = {
  async uploadDocument(file, onProgress) {
    const validation = validateFile(file);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const formData = new FormData();
    formData.append("file", file);

    const res = await api.uploadDocument(formData, onProgress);
    return res.data;
  },

  async getDocuments(params = {}) {
    const res = await api.getDocuments(params);
    return res.data;
  },

  async getDocument(id) {
    const res = await api.getDocument(id);
    return res.data;
  },

  async updateDocument(id, data) {
    const res = await api.updateDocument(id, data);
    return res.data;
  },

  async deleteDocument(id) {
    const res = await api.deleteDocument(id);
    return res.data;
  },

  async summarizeDocument(id) {
  const res = await api.summarizeDocument(id);
  return res.data;
},

  async analyzeDocumentRisk(id, force = false) {
    const res = await api.analyzeDocumentRisk(id, force);
    return res.data;
  },

  async getDocumentAnalysis(id) {
    try {
      const res = await api.getDocumentAnalysis(id);
      return res.data.analysis;
    } catch (error) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  },

  async downloadDocument(id, title) {
    const res = await api.downloadDocument(id);
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", title || `document-${id}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

};

export default documentService;
