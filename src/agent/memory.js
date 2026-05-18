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
 * Recupera as últimas N mensagens da sessão em ordem cronológica,
 * com marcadores de data/hora injetados entre mensagens de dias diferentes.
 * Isso evita que o modelo trate conversas de dias distintos como continuação.
 */
async function getHistory(sessionId) {
  log.debug('Buscando histórico', { sessionId, limit: CONTEXT_WINDOW });

  const { data, error } = await supabase
    .from('chat_memory')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(CONTEXT_WINDOW);

  if (error) {
    log.error('Erro ao buscar histórico', { sessionId, error: error.message });
    throw new Error(`[Memory] getHistory: ${error.message}`);
  }

  const rows = (data || []).reverse();

  // Injeta marcadores de quebra entre mensagens de dias diferentes
  const history = [];
  let lastDateStr = null;

  for (const row of rows) {
    const ts = row.created_at ? new Date(row.created_at) : null;

    if (ts) {
      // Formata a data no fuso de São Paulo
      const dateStr = ts.toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const timeStr = ts.toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      });

      if (lastDateStr !== null && dateStr !== lastDateStr) {
        // Dia diferente — injeta marcador de quebra de contexto
        history.push({
          role: 'system',
          content: `[Nova conversa — ${dateStr} às ${timeStr}. Trate como início de uma nova interação, não como continuação da anterior.]`,
        });
      } else if (lastDateStr === null) {
        // Primeira mensagem do histórico — registra o dia sem marcador de quebra
        history.push({
          role: 'system',
          content: `[Conversa iniciada em ${dateStr}]`,
        });
      }

      lastDateStr = dateStr;
    }

    history.push({ role: row.role, content: row.content });
  }

  log.debug('Histórico carregado', { sessionId, mensagens: rows.length, comMarcadores: history.length });
  return history;
}

module.exports = { saveMessage, getHistory };

module.exports = { saveMessage, getHistory };
