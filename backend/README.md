# DocuLens AI Backend

Production-ready Node.js backend API for DocuLens AI document management system.

## Tech Stack

- **Node.js** with ES Modules
- **Express.js** - Web framework
- **Supabase** - Database (PostgreSQL) + Auth
- **OpenRouter** - Real AI chat responses (`openrouter/free`)
- **RAG** - Text chunking + 2048-dim embeddings (`nvidia/nemotron-3-embed-1b:free`)
- **Multer** - File upload handling
- **pdfjs-dist / mammoth** - Text extraction (PDF / DOCX / TXT)
- **ioredis** - Optional shared rate-limit/quota/lock store
- **CORS** - Cross-origin resource sharing

## Project Structure

```
backend/
├── src/
│   ├── app.js                    # Express app configuration
│   ├── server.js                 # Server entry point (EADDRINUSE handler)
│   ├── config/
│   │   ├── db.js                 # Supabase database configuration
│   │   └── limits.js             # Env-driven rate limits, quotas, input caps
│   ├── controllers/
│   │   ├── document.controller.js    # Document CRUD + download + summarize
│   │   ├── analytics.controller.js   # Dashboard, storage & AI usage
│   │   └── chat.controller.js        # Chat (OpenRouter + RAG)
│   ├── routes/
│   │   ├── document.routes.js
│   │   ├── analytics.routes.js
│   │   └── chat.routes.js
│   ├── middleware/
│   │   ├── auth.middleware.js        # requireAuth (Supabase JWT)
│   │   ├── rate-limit.middleware.js  # IP / per-user / failed-auth limits
│   │   └── upload.middleware.js      # Multer file upload config
│   └── services/
│       ├── rag.service.js            # Chunking, embeddings, retrieval
│       ├── risk.service.js           # Evidence-grounded risk analysis
│       ├── ai-client.service.js      # Bounded retries + deadlines
│       ├── ai-usage.service.js       # Metadata-only usage audit
│       ├── rate-limit.service.js     # Daily AI quota
│       ├── rate-store.service.js     # Memory / optional Redis store
│       └── lock.service.js           # Duplicate-analysis locks
├── supabase_auth_migration.sql       # Auth: user_id backfill
├── supabase_migration_2048.sql       # 2048-dim embedding columns
├── uploads/                      # Uploaded files directory
├── package.json
├── .env                          # Environment variables (never commit)
└── README.md
```

## Installation

1. Install dependencies:
```bash
cd backend
npm install
```

2. Configure environment variables in `.env`:
```env
PORT=3001
NODE_ENV=development

SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

HF_API_KEY=your_openrouter_api_key
HF_MODEL=openrouter/free
EMBEDDING_MODEL=nvidia/nemotron-3-embed-1b:free

MAX_FILE_SIZE=52428800
```

> The service-role key must stay on the server only — never expose it in the frontend.

3. Database is set up with Supabase migrations:
   - `documents` table (with `user_id` owner)
   - `chat_history` table (with `user_id` owner)
   - `document_chunks` table (RAG chunks + embeddings)
   - `supabase_auth_migration.sql` / `supabase_migration_2048.sql`

## Running the Server

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

Server runs on **http://localhost:3001** (from `PORT` in `.env`)

## Authentication

All `/documents`, `/analytics`, and `/chat` routes require a valid Supabase token:

```http
Authorization: Bearer <supabase-access-token>
```

- Missing/invalid token → `401`
- Accessing another user's document → `403`
- Every query is scoped to `req.user.id` (no cross-user data)
- Public routes: `GET /` (health) and static `/uploads/:filename`

## API Endpoints

### Health
- `GET /` - Health check (no auth)

### Documents
- `GET /documents` - Get all documents (with pagination, filtering)
- `GET /documents/:id` - Get document by ID
- `POST /documents/upload` - Upload new document
- `GET /documents/:id/download` - Download the file
- `POST /documents/:id/summarize` - Quick rule-based summary
- `PUT /documents/:id` - Update document
- `DELETE /documents/:id` - Delete document (also removes chunks + chat history)

### Analytics
- `GET /analytics/dashboard` - Get dashboard statistics
- `GET /analytics/storage` - Get storage information

### Chat
- `POST /chat` - Send chat message (real AI via OpenRouter + document RAG)
- `GET /chat/history` - Get chat history
- `GET /chat` - Chat API health

## API Response Formats

### Dashboard Stats Response
```json
{
  "totalDocuments": 156,
  "analysedDocuments": 134,
  "highRiskDocuments": 8,
  "pendingDocuments": 14,
  "storageUsed": 1.2,
  "totalStorage": 10,
  "monthlyGrowth": {
    "thisMonth": 12,
    "lastMonth": 10,
    "percent": 20
  },
  "recentActivity": [
    {
      "id": "activity-uuid",
      "user": "user@example.com",
      "type": "upload",
      "document": "Financial Report.pdf",
      "status": "analysed",
      "timestamp": "2026-10-20T17:32:53.632221",
      "time": "2 hours ago"
    }
  ],
  "recentDocuments": [...]
}
```

### Document Upload Response
```json
{
  "id": "uuid",
  "title": "Q4 Financial Report.pdf",
  "type": "PDF",
  "category": "Financial",
  "status": "analysed",
  "description": "...",
  "file_url": "/uploads/...",
  "file_size": 2453678,
  "user_id": "uuid",
  "created_at": "2026-10-15T10:30:00.000000"
}
```

Uploads start as `pending`, then move to `analysed` on successful extraction + embedding (or `failed` on error).

### Chat Response
```json
{
  "success": true,
  "userMessage": {...},
  "botMessage": {...},
  "message": "AI response text...",
  "content": "AI response text...",
  "response": {
    "content": "AI response text..."
  }
}
```

## File Upload

- **Supported formats**: PDF, DOC, DOCX, TXT, XLS, XLSX, PPT, PPTX, JPG, PNG
- **Max file size**: 50MB (`MAX_FILE_SIZE` env)
- **Storage**: Local filesystem (`/uploads` directory)
- **Text extraction**: PDF, DOCX, TXT (others are stored but not indexed for RAG)
- Files are accessible via `/uploads/:filename` route

## Database Schema

### documents
- `id` (uuid) - Primary key
- `user_id` (uuid) - Owner (Supabase Auth)
- `title` (text) - Document name
- `type` (text) - File extension
- `category` (text) - Document category
- `status` (text) - pending | analysed | failed | high-risk
- `description` (text) - Document description
- `file_url` (text) - File path
- `file_size` (bigint) - Size in bytes
- `project` (text) - Associated project
- `extracted_text` (text) - Extracted text (PDF/DOCX/TXT)
- `created_at`, `updated_at` (timestamp, stored in UTC)

### chat_history
- `id` (uuid) - Primary key
- `document_id` (uuid) - Foreign key to documents (nullable)
- `user_id` (uuid) - Owner (Supabase Auth)
- `role` (text) - user | bot
- `content` (text) - Message content
- `metadata` (jsonb) - Additional data
- `timestamp` (timestamptz)

### document_chunks
- `id` (uuid) - Primary key
- `document_id` (uuid) - Foreign key to documents
- `content` (text) - Chunk text
- embedding vector (2048 dimensions) - for similarity search

## Error Handling

All endpoints return consistent error responses:
```json
{
  "message": "Error description",
  "error": "Detailed error message"
}
```

Chat/auth endpoints add a `success` field:
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad request
- `401` - Unauthorized (missing/invalid/expired token)
- `402` - AI service out of free credits (chat)
- `403` - Forbidden (not your document)
- `404` - Not found
- `429` - AI free-quota/rate limit reached (chat)
- `500` - Server error
- `502` - AI provider temporary problem (chat)
- `503` - AI model unavailable (chat)
- `504` - AI provider timeout, 50s (chat)

## Future Enhancements

This backend is AI-ready and can be extended with:
- OCR integration for scanned documents
- AI-powered document analysis / risk scoring
- Advanced search and filtering
- Cloud storage integration (AWS S3)
- Real-time notifications (webhooks)

## Rate limiting and AI usage control

API traffic, AI spend and input sizes are controlled server-side. See
[`RATE_LIMITING.md`](./RATE_LIMITING.md) for architecture, defaults, response
formats and the Redis requirement for multi-instance deployments.

- IP limits protect all API traffic, public `/uploads` and failed JWT attempts.
- Per-user limits cover uploads, chat and risk analysis.
- Daily AI quota (`AI_DAILY_REQUEST_QUOTA`, default 50) applies to chat + risk.
- Duplicate risk analyses are deduplicated with a short-lived lock.
- `GET /analytics/ai-usage` returns the caller's own quota and usage metadata.
- Apply `supabase_ai_usage_migration.sql` to persist usage; without it the
  audit falls back to bounded memory.
- Redis is optional (`REDIS_URL`) and required only to share limits/locks
  across multiple backend instances.

## Testing

```bash
# Test server is running (no auth)
curl http://localhost:3001

# Test document upload
curl -X POST http://localhost:3001/documents/upload \
  -H "Authorization: Bearer <access-token>" \
  -F "file=@document.pdf" \
  -F "metadata={\"category\":\"Financial\"}"

# Test dashboard stats
curl http://localhost:3001/analytics/dashboard \
  -H "Authorization: Bearer <access-token>"

# Test chat
curl -X POST http://localhost:3001/chat \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello","documentId":null}'
```

See `API_REFERENCE.md` for the full endpoint reference.

## Notes

- The chat API returns **real AI responses** via OpenRouter; if no relevant document chunks are found it returns a clear diagnostic message instead of a generic answer
- Retrieval is conversation-aware — the last user turns are included so follow-up questions work
- All data is protected by Supabase Auth + per-user ownership checks
- Timestamps from the DB are UTC (no timezone suffix) — backend and frontend both parse them as UTC
- Files are stored locally (consider cloud storage for production)
- The frontend expects exact response structures - do not modify keys
