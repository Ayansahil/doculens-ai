import express from 'express';
import {
  getAllDocuments,
  getDocumentById,
  uploadDocument,
  updateDocument,
  deleteDocument,
  downloadDocumentLogic
} from '../controllers/document.controller.js';
import { upload } from '../middleware/upload.middleware.js';

const router = express.Router();

// ✅ UPLOAD ROUTE MUST BE ABOVE :id
router.post('/upload', upload.single('file'), uploadDocument);

// ✅ GET ALL DOCUMENTS
router.get('/', getAllDocuments);

// ✅ DOWNLOAD DOCUMENT
router.get('/:id/download', downloadDocumentLogic);

// ✅ GET DOCUMENT BY ID (LAST AMONG GETs)
router.get('/:id', getDocumentById);

// ✅ UPDATE DOCUMENT
router.put('/:id', updateDocument);

// ✅ DELETE DOCUMENT
router.delete('/:id', deleteDocument);

export default router;
