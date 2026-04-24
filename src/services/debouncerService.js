const { create } = require('../utils/logger');
const log = create('Debouncer');

/**
 * Debouncer em memória — agrupa mensagens subsequentes do mesmo usuário.
 *
 * state: telefone → { messages: [], timer, onFlush, processing }
 *
 * - O onFlush é sempre atualizado para o da mensagem mais recente
 * - processing: impede que um novo flush comece enquanto o agente ainda está rodando
 */
const state = new Map();

function enqueue(telefone, messageData, delaySeconds, onFlush) {
  let entry = state.get(telefone);

  if (!entry) {
    entry = { messages: [], timer: null, onFlush: null, processing: false };
    state.set(telefone, entry);
    log.debug('📬 Nova fila criada', { telefone });
  }

  // Se o agente ainda está processando a rodada anterior,
  // acumula a mensagem mas não reinicia o timer — vai esperar o lock liberar
  if (entry.processing) {
    entry.messages.push(messageData);
    log.info('📥 Mensagem enfileirada (aguardando processamento anterior)', {
      telefone,
      fila: entry.messages.length,
      message_id: messageData.message_id,
    });
    return;
  }

  entry.messages.push(messageData);
  entry.onFlush = onFlush; // sempre usa o contexto mais recente (apikey, sessionId, etc.)

  const queueSize = entry.messages.length;
  log.info('📥 Mensagem enfileirada', {
    telefone,
    fila: queueSize,
    aguardando_segundos: delaySeconds,
    message_id: messageData.message_id,
  });

  // Reinicia o timer a cada nova mensagem
  if (entry.timer) {
    clearTimeout(entry.timer);
    log.debug('🔁 Timer reiniciado', { telefone, fila: queueSize });
  }

  entry.timer = setTimeout(async () => {
    const flushed = entry.messages.slice();
    const flush = entry.onFlush;

    // Limpa as mensagens e marca como processando
    entry.messages = [];
    entry.timer = null;
    entry.processing = true;

    log.info('🚀 Flush disparado', {
      telefone,
      total_mensagens: flushed.length,
      mensagens: flushed.map((m) => ({ id: m.message_id, preview: m.message?.slice(0, 60) })),
    });

    try {
      await flush(flushed);
    } catch (err) {
      log.error('Erro no flush', err);
    } finally {
      entry.processing = false;

      // Se chegaram mensagens durante o processamento, dispara imediatamente
      if (entry.messages.length > 0) {
        log.info('📨 Mensagens acumuladas durante processamento — disparando novo flush', {
          telefone,
          total: entry.messages.length,
        });
        const pendentes = entry.messages.slice();
        const flushPendente = entry.onFlush;
        entry.messages = [];

        // Remove o estado se não houver mais nada
        if (!state.has(telefone)) return;
        state.delete(telefone);

        try {
          await flushPendente(pendentes);
        } catch (err) {
          log.error('Erro no flush pendente', err);
        }
      } else {
        // Nada mais pendente — remove o estado
        state.delete(telefone);
      }
    }
  }, delaySeconds * 1000);
}

function cancel(telefone) {
  const entry = state.get(telefone);
  if (entry?.timer) {
    clearTimeout(entry.timer);
    log.warn('🚫 Fila cancelada (pausa)', { telefone, mensagens_descartadas: entry.messages.length });
  }
  state.delete(telefone);
}

module.exports = { enqueue, cancel };
