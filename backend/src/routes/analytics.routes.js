import express from 'express';
import { getDashboardStats, getStorageInfo } from '../controllers/analytics.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(requireAuth);

router.get('/dashboard', getDashboardStats);
router.get('/storage', getStorageInfo);

export default router;
