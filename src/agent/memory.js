const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const { create } = require('../utils/logger');

const log = create('Memory');
const supabase = createClient(config.supabase.url, config.supabase.key);

const CONTEXT_WINDOW = 25;

/**
 * Salva uma mensagem na memória do chat
 */
async function saveMessage(sessionId, role, content) {
  log.debug('Salvando mensagem', { sessionId, role, preview: content?.slice(0, 60) });

  const { error } = await supabase
    .from('chat_memory')
    .insert([{ session_id: sessionId, role, content }]);

  if (error) {
    log.error('Erro ao salvar mensagem', { sessionId, role, error: error.message });
    throw new Error(`[Memory] saveMessage: ${error.message}`);
  }
}

/**
 * Recupera as últimas N mensagens da sessão em ordem cronológica
 */
async function getHistory(sessionId) {
  log.debug('Buscando histórico', { sessionId, limit: CONTEXT_WINDOW });

  const { data, error } = await supabase
    .from('chat_memory')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(CONTEXT_WINDOW);

  if (error) {
    log.error('Erro ao buscar histórico', { sessionId, error: error.message });
    throw new Error(`[Memory] getHistory: ${error.message}`);
  }

  const history = (data || []).reverse();
  log.debug('Histórico carregado', { sessionId, mensagens: history.length });
  return history;
}

module.exports = { saveMessage, getHistory };
