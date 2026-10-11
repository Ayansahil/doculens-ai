-- ============================================================
-- DocuLens AI - Supabase Migration for 2048-dim Embeddings
-- Target Model: nvidia/nemotron-3-embed-1b:free (2048 dimensions)
-- ============================================================

-- 1. Clean existing chunks (old 1536-dim vectors are incompatible with 2048-dim vectors)
TRUNCATE TABLE document_chunks;

-- 2. Alter column type to vector(2048)
ALTER TABLE document_chunks 
  ALTER COLUMN embedding TYPE vector(2048);

-- 3. Recreate match_document_chunks RPC function with 2048 dimensions
CREATE OR REPLACE FUNCTION match_document_chunks (
  query_embedding vector(2048),
  match_threshold float DEFAULT 0.1,
  match_count int DEFAULT 3,
  filter_document_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  document_id uuid,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.content,
    1 - (document_chunks.embedding <=> query_embedding) AS similarity
  FROM document_chunks
  WHERE
    (filter_document_id IS NULL OR document_chunks.document_id = filter_document_id)
    AND 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY document_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
