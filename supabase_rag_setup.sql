-- ─────────────────────────────────────────────────────────────────
-- RAG Setup — Execute no SQL Editor do Supabase
-- ─────────────────────────────────────────────────────────────────

-- 1. Habilita a extensão de vetores (se ainda não estiver ativa)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Verifica se a tabela documents já existe (criada pelo n8n)
--    Se não existir, cria do zero
CREATE TABLE IF NOT EXISTS documents (
  id        BIGSERIAL PRIMARY KEY,
  content   TEXT,
  metadata  JSONB,
  embedding VECTOR(1536)  -- dimensão do text-embedding-3-small da OpenAI
);

-- 3. Índice para busca por similaridade (HNSW — mais rápido)
CREATE INDEX IF NOT EXISTS idx_documents_embedding
  ON documents
  USING hnsw (embedding vector_cosine_ops);

-- 4. Função RPC de busca semântica
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1536),
  match_count     INT     DEFAULT 5,
  match_threshold FLOAT   DEFAULT 0.5
)
RETURNS TABLE (
  id         BIGINT,
  content    TEXT,
  metadata   JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE 1 - (documents.embedding <=> query_embedding) > match_threshold
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
