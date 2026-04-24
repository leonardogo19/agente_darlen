-- Tabela de memória do chat
-- Execute no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS chat_memory (
  id          BIGSERIAL PRIMARY KEY,
  session_id  TEXT        NOT NULL,
  role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para busca por sessão (necessário para performance)
CREATE INDEX IF NOT EXISTS idx_chat_memory_session_id
  ON chat_memory (session_id, created_at DESC);

-- Limpeza automática: remove mensagens com mais de 30 dias
-- (opcional — ative se quiser controlar o tamanho da tabela)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('cleanup-chat-memory', '0 3 * * *',
--   $$DELETE FROM chat_memory WHERE created_at < NOW() - INTERVAL '30 days'$$
-- );
