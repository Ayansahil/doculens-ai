-- ============================================================
-- DocuLens AI: User Document Ownership & RLS Migration
-- ============================================================

-- Step 1: Add user_id column to documents table
ALTER TABLE public.documents 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 2: Add user_id column to chat_history table (for standalone & document chats)
ALTER TABLE public.chat_history 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 3: Create performance indexes
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON public.chat_history(user_id);

-- Step 4: Safely assign existing unowned documents to the designated user
-- Designated user UUID (owner of all pre-auth data) — value in backend/.env TEST_USER1_ID
UPDATE public.documents
SET user_id = 'eb849768-f949-46e7-aa70-3aedc5e69edc'
WHERE user_id IS NULL;

-- Step 5: Safely assign existing chat history to the designated user
UPDATE public.chat_history
SET user_id = 'eb849768-f949-46e7-aa70-3aedc5e69edc'
WHERE user_id IS NULL;

-- Step 6: Enable Row Level Security (RLS) on documents and chat_history
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;

-- Step 7: RLS policies for documents table
DROP POLICY IF EXISTS "Users can only access own documents" ON public.documents;
CREATE POLICY "Users can only access own documents"
  ON public.documents
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Step 8: RLS policies for chat_history table
DROP POLICY IF EXISTS "Users can only access own chat history" ON public.chat_history;
CREATE POLICY "Users can only access own chat history"
  ON public.chat_history
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Step 9: Enable RLS on document_chunks (inherits ownership via document_id)
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only access chunks of own documents" ON public.document_chunks;
CREATE POLICY "Users can only access chunks of own documents"
  ON public.document_chunks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_chunks.document_id
      AND documents.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_chunks.document_id
      AND documents.user_id = auth.uid()
    )
  );
