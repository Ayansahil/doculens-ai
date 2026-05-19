import express from 'express';
import { sendChatMessage, getChatHistory } from '../controllers/chat.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(requireAuth);

// ✅ GET /chat - Health check (SPECIFIC ROUTES PEHLE)
router.get('/history', getChatHistory);

// ✅ GET /chat - Health
router.get('/', (req, res) => {
  res.json({
    message: 'Chat API is working',
    status: 'ok',
});
});

// ✅ POST /chat - Send message
router.post('/', sendChatMessage);

export default router;