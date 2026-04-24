const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const config = require('../config');
const { create } = require('../utils/logger');

const log = create('RAG');
const supabase = createClient(config.supabase.url, config.supabase.key);
const openai = new OpenAI({ apiKey: config.openai.apiKey });

// Nome da tabela e função RPC do Vector Store no Supabase
// Ajuste conforme o nome que aparece no seu painel do Supabase
const VECTOR_TABLE    = process.env.RAG_TABLE    || 'documents';
const MATCH_FUNCTION  = process.env.RAG_FUNCTION || 'match_documents';
const MATCH_COUNT     = parseInt(process.env.RAG_MATCH_COUNT) || 5;
const MATCH_THRESHOLD = parseFloat(process.env.RAG_THRESHOLD) || 0.5;

/**
 * Busca informações no Supabase Vector Store via similaridade semântica
 * @param {string} query - Termos de busca
 * @returns {string} Texto com os resultados encontrados
 */
async function buscarInfo(query) {
  log.info('🔍 Buscando no RAG', { query, table: VECTOR_TABLE, function: MATCH_FUNCTION });

  try {
    // 1. Gera embedding da query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });

    const embedding = embeddingResponse.data[0].embedding;
    log.debug('Embedding gerado', { query, dimensions: embedding.length });

    // 2. Busca por similaridade no Supabase via RPC
    const { data, error } = await supabase.rpc(MATCH_FUNCTION, {
      query_embedding: embedding,
      match_count:     MATCH_COUNT,
      match_threshold: MATCH_THRESHOLD,
    });

    if (error) {
      log.error('Erro na busca RPC', { error: error.message, function: MATCH_FUNCTION });
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      log.warn('Nenhum resultado encontrado no RAG', { query });
      return null;
    }

    log.info('Resultados encontrados no RAG', {
      query,
      total: data.length,
      scores: data.map((d) => d.similarity?.toFixed(3)),
    });

    // 3. Limpa markdown e concatena os conteúdos encontrados
    const { cleanMarkdown } = require('../utils/cleanText');

    const resultado = data
      .map((doc) => {
        const raw = doc.content || doc.text || doc.pageContent || '';
        return cleanMarkdown(raw);
      })
      .filter(Boolean)
      .join('\n\n');

    log.debug('Conteúdo RAG limpo', { query, chars: resultado.length, preview: resultado.slice(0, 150) });

    return resultado;

  } catch (err) {
    log.error('Erro no RAG', { query, error: err.message });
    throw err;
  }
}

module.exports = { buscarInfo };
