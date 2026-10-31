import express from 'express';
import {
  getAllDocuments,
  getDocumentById,
  uploadDocument,
  updateDocument,
  deleteDocument,
  downloadDocumentLogic,
  summarizeDocument,
  analyzeDocument,
  getDocumentAnalysis
} from '../controllers/document.controller.js';
import { upload } from '../middleware/upload.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  uploadUserRateLimit,
  riskUserRateLimit,
} from '../middleware/rate-limit.middleware.js';

const router = express.Router();

// All document routes require authentication
router.use(requireAuth);

// ✅ UPLOAD ROUTE MUST BE ABOVE :id
// Per-user upload limit runs before multer so rejected requests never write a file.
router.post('/upload', uploadUserRateLimit, upload.single('file'), uploadDocument);

// ✅ GET ALL DOCUMENTS
router.get('/', getAllDocuments);

// ✅ DOWNLOAD DOCUMENT
router.get('/:id/download', downloadDocumentLogic);

// ✅ SUMMARIZE DOCUMENT
router.post("/:id/summarize", summarizeDocument);

// ✅ RISK ANALYSIS (must be above /:id for GET)
router.get('/:id/analysis', getDocumentAnalysis);
router.post('/:id/analyze', riskUserRateLimit, analyzeDocument);

// ✅ GET DOCUMENT BY ID (LAST AMONG GETs)
router.get('/:id', getDocumentById);

// ✅ UPDATE DOCUMENT
router.put('/:id', updateDocument);

// ✅ DELETE DOCUMENT
router.delete('/:id', deleteDocument);



export default router;
