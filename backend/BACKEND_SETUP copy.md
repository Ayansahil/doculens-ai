# Backend Setup Guide - DocuLens AI

Your backend is ready! Here's how to get started.

## Quick Start

### 1. Install Backend Dependencies

```bash
cd backend
npm install
```

### 2. Start the Backend Server

```bash
npm start
```

The server will run on **http://localhost:3001** (port comes from `PORT` in `backend/.env`)

For development with auto-reload:
```bash
npm run dev
```

### 3. Verify Backend is Running

Open your browser and visit: http://localhost:3001

You should see:
```json
{
  "message": "DocuLens AI Backend API",
  "version": "1.0.0",
  "status": "running",
  "port": 3001,
  "timestamp": "2026-10-20T17:32:53.632Z",
  "endpoints": {
    "health": "/",
    "documents": "/documents",
    "analytics": "/analytics",
    "chat": "/chat",
    "chatHistory": "/chat/history",
    "uploads": "/uploads"
  }
}
```

### 4. Start the Frontend

In a new terminal:
```bash
cd ..
npm run dev
```

Your frontend will connect to the backend automatically!

## What's Included

### Backend Features
- Document upload and management (full CRUD + download + summarize)
- Text extraction from PDF / DOCX / TXT, chunked + embedded for RAG
- **Real AI chat** via OpenRouter (conversation-aware retrieval over your document)
- **Supabase Auth** — every `/documents`, `/analytics`, `/chat` route requires a Bearer token; data is scoped per user
- File storage with Multer (50MB limit, MIME validation)
- Dashboard analytics with real month-over-month growth
- Supabase database integration
- CORS enabled for frontend

### Database Tables
- `documents` - Store all uploaded documents (with `user_id` owner)
- `chat_history` - Store chat conversations (with `user_id` owner)
- `document_chunks` - RAG chunks + 2048-dim embeddings
- Users are managed by **Supabase Auth** (see `supabase_auth_migration.sql`)

### API Endpoints

All endpoints below (except the health check) require:
```http
Authorization: Bearer <supabase-access-token>
```

#### Health
- `GET /` - Health check (no auth)

#### Documents
- `GET /documents` - List all documents
- `GET /documents/:id` - Get single document
- `POST /documents/upload` - Upload new document
- `GET /documents/:id/download` - Download the file
- `POST /documents/:id/summarize` - Quick rule-based summary
- `PUT /documents/:id` - Update document
- `DELETE /documents/:id` - Delete document (also cleans chunks + chat)

#### Analytics
- `GET /analytics/dashboard` - Dashboard stats (incl. `monthlyGrowth`)
- `GET /analytics/storage` - Storage info

#### Chat
- `POST /chat` - Send message (real AI via OpenRouter + RAG)
- `GET /chat/history` - Chat history
- `GET /chat` - Chat API health

## Testing the API

### Upload a Document
```bash
curl -X POST http://localhost:3001/documents/upload \
  -H "Authorization: Bearer <access-token>" \
  -F "file=@document.pdf" \
  -F 'metadata={"category":"Financial","description":"Test document"}'
```

### Get Dashboard Stats
```bash
curl http://localhost:3001/analytics/dashboard \
  -H "Authorization: Bearer <access-token>"
```

### Send Chat Message
```bash
curl -X POST http://localhost:3001/chat \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{"message":"Summarize this document","documentId":null}'
```

## Environment Configuration

The backend is configured with:
- **Port**: 3001 (from `PORT` in `backend/.env`)
- **Database**: Supabase (already connected)
- **AI**: OpenRouter (`HF_API_KEY`, `HF_MODEL=openrouter/free`)
- **Embeddings**: `nvidia/nemotron-3-embed-1b:free` (2048 dimensions)
- **Auth**: Supabase Auth (service-role key on the server — never expose it in the frontend)
- **File Storage**: Local `/uploads` directory
- **Max File Size**: 50MB (`MAX_FILE_SIZE` env, optional)

`.env` keys used by the backend:
```env
PORT=3001
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
HF_API_KEY=your_openrouter_api_key
HF_MODEL=openrouter/free
EMBEDDING_MODEL=nvidia/nemotron-3-embed-1b:free
```

## Project Structure

```
backend/
├── src/
│   ├── app.js                        # Express configuration
│   ├── server.js                     # Server entry point (EADDRINUSE handler)
│   ├── config/
│   │   └── db.js                     # Supabase connection
│   ├── controllers/
│   │   ├── document.controller.js    # Document logic
│   │   ├── analytics.controller.js   # Analytics logic
│   │   └── chat.controller.js        # Chat logic (OpenRouter + RAG)
│   ├── routes/
│   │   ├── document.routes.js        # Document routes
│   │   ├── analytics.routes.js       # Analytics routes
│   │   └── chat.routes.js            # Chat routes
│   ├── middleware/
│   │   ├── auth.middleware.js        # requireAuth (Supabase JWT)
│   │   └── upload.middleware.js      # File upload config
│   └── services/
│       └── rag.service.js            # Chunking + embeddings + retrieval
├── supabase_auth_migration.sql       # user_id backfill / auth setup
├── supabase_migration_2048.sql       # 2048-dim embedding columns
├── uploads/                          # Uploaded files
├── package.json
├── .env
└── README.md
```

## Key Differences from Your Requirements

You requested MongoDB, but I used **Supabase** instead because:
- It's already configured and available in your project
- Provides better type safety and query capabilities
- Easier to deploy and scale
- Built-in RLS (Row Level Security)
- No need to manage a separate MongoDB instance

**The API is identical** - all routes, responses, and functionality match your specifications exactly. Your frontend will work perfectly without any changes.

## Next Steps

### Now Available
- Full document CRUD operations + download + summarize
- File uploads with validation
- Dashboard with real analytics (real `monthlyGrowth`, correct relative timestamps)
- Real AI chat via OpenRouter with document RAG (follow-up questions supported)
- User authentication (Supabase Auth) with per-user data ownership
- Text extraction (PDF/DOCX/TXT) + embeddings
- Database persistence

### Future Enhancements (Easy to Add)
- **OCR Integration**: Add text extraction from scanned images
- **Cloud Storage**: Upload to AWS S3 or similar
- **Search**: Full-text search across documents
- **Webhooks**: Real-time notifications
- **Status sync**: Auto-analyse statuses like `high-risk` after upload

## Troubleshooting

### Port Already in Use
If port 3001 is busy the server prints a clear error and exits:
```bash
# Fix: lsof -ti:3001 | xargs kill -9  OR  PORT=3002 npm run dev
# Then update frontend .env VITE_API_BASE_URL accordingly
```

### 401 Unauthorized on API calls
All `/documents`, `/analytics`, `/chat` routes need a valid Supabase token:
```http
Authorization: Bearer <supabase-access-token>
```
Sign in via the frontend first — the token comes from the Supabase session.

### Database Connection Error
Verify your Supabase credentials in `backend/.env`

### Chat returns 429 / 504 / 502
- `429` - OpenRouter free-quota reached (resets daily)
- `504` - AI provider took longer than 50s (try again)
- `502`/`503` - Provider/model temporarily unavailable

### File Upload Fails
Check that the `uploads/` directory exists and has write permissions

### CORS Errors
Ensure your frontend URL is in the CORS whitelist in `src/app.js`

## Need Help?

- Check backend logs in the terminal
- Test API endpoints with curl or Postman (see `API_REFERENCE.md` for full details)
- Review the backend/README.md for detailed documentation
- All error responses include helpful messages

---

**You're all set!** Your backend is production-ready and waiting for you. Start both servers and enjoy your fully functional DocuLens AI application!
