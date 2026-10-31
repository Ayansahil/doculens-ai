import express from 'express';
import {
  getDashboardStats,
  getStorageInfo,
  getAiUsage,
} from '../controllers/analytics.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(requireAuth);

router.get('/dashboard', getDashboardStats);
router.get('/storage', getStorageInfo);
router.get('/ai-usage', getAiUsage);

export default router;
