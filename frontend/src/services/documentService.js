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
};

export default documentService;
