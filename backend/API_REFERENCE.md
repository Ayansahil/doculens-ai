# API Reference - DocuLens AI Backend

Quick reference for all API endpoints.

## Base URL
```
http://localhost:3001
```

---

## Authentication

All `/documents`, `/analytics`, and `/chat` routes are protected and require a valid Supabase auth token.

**Header (required on every request):**
```http
Authorization: Bearer <supabase-access-token>
```

- The token is the Supabase session `access_token` (from login/magic-link).
- Missing/invalid/expired token → `401`:
```json
{
  "success": false,
  "message": "Missing access token"
}
```
```json
{
  "success": false,
  "message": "Invalid or expired token"
}
```
- Accessing another user's document → `403`:
```json
{
  "message": "Forbidden: not your document"
}
```
- Data is always scoped to the authenticated user (`user_id`) — lists only return your own documents.

**Public (no auth):** `GET /` (health check), static files under `/uploads/:filename`.

---

## Health Check

```http
GET /
```

**Response:**
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

---

## Documents API

### Get All Documents
```http
GET /documents
```

**Query Parameters:**
- `page` (number) - Page number (default: 1)
- `limit` (number) - Items per page (default: 10)
- `status` (string) - Filter by status
- `type` (string) - Filter by file type
- `category` (string) - Filter by category
- `query` (string) - Search in title/description

Documents are always scoped to the authenticated user and ordered by `created_at` (newest first).

**Response:**
```json
{
  "documents": [...],
  "total": 156,
  "page": 1,
  "limit": 10,
  "totalPages": 16
}
```

---

### Get Single Document
```http
GET /documents/:id
```

**Response:**
```json
{
  "id": "uuid",
  "title": "Financial Report.pdf",
  "type": "PDF",
  "category": "Financial",
  "status": "analysed",
  "description": "Q4 2024 report",
  "file_url": "/uploads/...",
  "file_size": 2453678,
  "project": "Finance Review",
  "extracted_text": null,
  "user_id": "uuid",
  "created_at": "2026-10-15T10:30:00.000000",
  "updated_at": "2026-10-15T10:30:00.000000"
}
```

**Errors:** `404` Document not found · `403` Forbidden: not your document

---

### Upload Document
```http
POST /documents/upload
Content-Type: multipart/form-data
```

**Body:**
- `file` (file) - Required. The file to upload
- `metadata` (JSON string) - Optional metadata

**Metadata Structure:**
```json
{
  "title": "Custom Title",
  "category": "Financial",
  "description": "Document description",
  "project": "Project Name"
}
```

Text is extracted automatically (PDF/DOCX/TXT), chunked, and embedded for RAG. On success the document status moves `pending` → `analysed`; if extraction/embedding fails it becomes `failed`.

**Example:**
```bash
curl -X POST http://localhost:3001/documents/upload \
  -H "Authorization: Bearer <access-token>" \
  -F "file=@document.pdf" \
  -F 'metadata={"category":"Financial","description":"Test doc"}'
```

**Response:** `201` - Same as Get Single Document (includes `user_id`, final `status`)

**Errors:** `400` No file uploaded · `401` Unauthorized · `500` Failed to upload document

---

### Download Document
```http
GET /documents/:id/download
```

**Response:** File stream (`Content-Disposition` uses the document title)

**Errors:** `404` Document not found · `403` Forbidden: not your document

---

### Summarize Document
```http
POST /documents/:id/summarize
```

Extracts the first sentences of the document text (rule-based, no AI call).

**Response:**
```json
{
  "documentId": "uuid",
  "title": "Financial Report.pdf",
  "summary": "First sentence. Second sentence. Third sentence. Fourth sentence.",
  "sentenceCount": 4
}
```

**Errors:** `404` Document not found · `403` Forbidden · `400` Document text not available for summarization

---

### Update Document
```http
PUT /documents/:id
Content-Type: application/json
```

**Body:**
```json
{
  "title": "New Title",
  "category": "Legal",
  "description": "Updated description",
  "status": "analysed"
}
```

`id` and `user_id` in the body are ignored (ownership cannot be changed).

**Response:** Updated document object

**Errors:** `404` Document not found · `403` Forbidden: not your document

---

### Delete Document
```http
DELETE /documents/:id
```

Also deletes the document's chunks and chat history (no orphans).

**Response:**
```json
{
  "message": "Document deleted successfully"
}
```

**Errors:** `404` Document not found · `403` Forbidden: not your document

---

## Analytics API

### Get Dashboard Statistics
```http
GET /analytics/dashboard
```

Scoped to the authenticated user, ordered by `created_at` (newest first).

**Response:**
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
  "recentDocuments": [
    {
      "id": "uuid",
      "title": "Document.pdf",
      "type": "PDF",
      "category": "Financial",
      "status": "analysed",
      "date": "2026-10-20T17:32:53.632221",
      "description": "Document description"
    }
  ]
}
```

- `monthlyGrowth` is computed from real `created_at` values (this month vs. last month uploads) — no hardcoded numbers.
- `recentActivity[].time` is a server-computed relative string: `Just now`, `5 mins ago`, `3 hours ago`, `2 days ago`, `1 week ago`, `2 months ago`.
- `recentActivity[].timestamp` is the raw DB `created_at` (single source of truth).

---

### Get Storage Information
```http
GET /analytics/storage
```

**Response:**
```json
{
  "used": 1.2,
  "total": 10,
  "percentage": 12,
  "available": 8.8
}
```

---

## Chat API

Powered by OpenRouter (`HF_MODEL`, default `openrouter/free`) with RAG over the selected document's chunks (2048-dim embeddings). Retrieval is conversation-aware: the last user turns are included in the retrieval query so follow-up questions ("ok so its free?") work.

### Send Chat Message
```http
POST /chat
Content-Type: application/json
```

**Body:**
```json
{
  "message": "Summarize this document",
  "documentId": "uuid-or-null"
}
```

- `message` - Required
- `documentId` - Optional. `null`/empty = general assistant (no document context). Ownership is verified when set. (`document_id` / `documentID` aliases also accepted.)
- Provider timeout: **50s** → friendly `504` (frontend waits up to 60s).

**Response:**
```json
{
  "success": true,
  "userMessage": {
    "id": "uuid",
    "document_id": null,
    "role": "user",
    "content": "Summarize this document",
    "timestamp": "2026-10-20T17:30:00.000000+00:00"
  },
  "botMessage": {
    "id": "uuid",
    "document_id": null,
    "role": "bot",
    "content": "Here's a summary...",
    "metadata": null,
    "timestamp": "2026-10-20T17:30:10.000000+00:00"
  },
  "message": "Here's a summary...",
  "content": "Here's a summary...",
  "response": {
    "content": "Here's a summary..."
  }
}
```

**RAG diagnostic response** (0 relevant chunks found):
```json
{
  "success": true,
  "userMessage": {...},
  "botMessage": {...},
  "diagnostic": true,
  "chunksFound": 0
}
```

**Errors:**
- `400` - Message is required
- `404` - Document not found
- `403` - Forbidden: not your document
- `402` - The AI service has run out of free credits. Please try again later or contact support.
- `429` - The free AI request limit has been reached. Please try again after the quota resets.
- `502` - The AI provider had a temporary problem. Please try again in a moment.
- `503` - The configured AI model is currently unavailable. Please try again later.
- `504` - The AI provider is responding slowly right now. Please try again in a moment.

Provider errors are mapped to friendly messages — raw provider details/keys are never exposed:
```json
{
  "success": false,
  "status": 504,
  "message": "Friendly human-readable message",
  "error": "Friendly human-readable message"
}
```

---

### Get Chat History
```http
GET /chat/history?documentId=uuid
```

**Query Parameters:**
- `documentId` (string, optional) - Filter by document (ownership verified). Omit for all of the user's messages.

**Response:**
```json
{
  "success": true,
  "history": [
    {
      "id": "uuid",
      "document_id": "uuid",
      "role": "user",
      "content": "Message text",
      "metadata": null,
      "timestamp": "2026-10-20T17:30:00.000000+00:00"
    }
  ],
  "count": 10
}
```

**Errors:** `404` Document not found · `403` Forbidden: not your document (both with `history: []`, `count: 0`)

---

### Chat Health
```http
GET /chat
```

**Response:**
```json
{
  "message": "Chat API is working",
  "status": "ok"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "message": "Human-readable error message",
  "error": "Detailed error information"
}
```

Chat/auth errors add a `success` field (and sometimes `status`):

```json
{
  "success": false,
  "message": "Human-readable error message",
  "error": "Detailed error information"
}
```

Unknown routes:
```json
{
  "success": false,
  "message": "Route not found",
  "path": "/unknown",
  "method": "GET",
  "availableRoutes": ["/documents", "/analytics", "/chat", "/chat/history"]
}
```

**Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized (missing/invalid/expired token)
- `402` - AI service out of free credits (chat)
- `403` - Forbidden (not your document)
- `404` - Not Found
- `429` - AI free-quota/rate limit reached (chat)
- `500` - Internal Server Error
- `502` - AI provider temporary problem (chat)
- `503` - AI model unavailable (chat)
- `504` - AI provider timeout, 50s (chat)

---

## File Upload Constraints

- **Max Size**: 50MB (52,428,800 bytes, overridable via `MAX_FILE_SIZE` env)
- **Allowed Types**:
  - PDF (application/pdf)
  - DOC (application/msword)
  - DOCX (application/vnd.openxmlformats-officedocument.wordprocessingml.document)
  - TXT (text/plain)
  - XLS (application/vnd.ms-excel)
  - XLSX (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
  - PPT (application/vnd.ms-powerpoint)
  - PPTX (application/vnd.openxmlformats-officedocument.presentationml.presentation)
  - JPG/JPEG (image/jpeg, image/jpg)
  - PNG (image/png)
- Text extraction currently runs for **PDF, DOCX, and TXT**; other types are stored but may not be indexed for RAG.

---

## Document Status Values

- `pending` - Uploaded, awaiting processing
- `analysed` - Processing complete (chunks + embeddings stored)
- `failed` - Extraction/embedding failed (see server logs)
- `high-risk` - High-risk content detected

---

## Testing Examples

### JavaScript/Fetch
```javascript
// Upload document
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('metadata', JSON.stringify({
  category: 'Financial',
  description: 'Test document'
}));

const response = await fetch('http://localhost:3001/documents/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  body: formData
});

const data = await response.json();
```

### cURL
```bash
# Health check (no auth)
curl http://localhost:3001/

# Get dashboard stats
curl http://localhost:3001/analytics/dashboard \
  -H "Authorization: Bearer <access-token>"

# Upload document
curl -X POST http://localhost:3001/documents/upload \
  -H "Authorization: Bearer <access-token>" \
  -F "file=@document.pdf" \
  -F 'metadata={"category":"Financial"}'

# Send chat message
curl -X POST http://localhost:3001/chat \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{"message":"Summarize document","documentId":null}'

# Get documents with filters
curl "http://localhost:3001/documents?status=analysed&category=Financial&page=1&limit=10" \
  -H "Authorization: Bearer <access-token>"
```

---

## Notes

- All timestamps are in ISO 8601 format. `created_at`/`updated_at` from the DB are **UTC without a timezone suffix** — both backend and frontend parse them as UTC (`+Z`) so relative times never drift with local timezone
- UUIDs are used for all IDs
- The chat API calls OpenRouter (real AI responses); if no relevant document chunks are found it returns a clear diagnostic message instead of a generic answer
- Embeddings use `nvidia/nemotron-3-embed-1b:free` (2048 dimensions, see `supabase_migration_2048.sql`)
- Files are served from `/uploads/:filename`
- CORS is enabled for `http://localhost:5173`, `http://localhost:3000`, `http://localhost:5174`
- Server port comes from `PORT` in `backend/.env` (currently `3001`); `EADDRINUSE` is handled with a clear error message
