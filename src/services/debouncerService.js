const { create } = require('../utils/logger');
const log = create('Debouncer');

/**
 * Debouncer em memória — agrupa mensagens subsequentes do mesmo usuário.
 * state: telefone → { messages: [], timer }
 */
const state = new Map();

function enqueue(telefone, messageData, delaySeconds, onFlush) {
  let entry = state.get(telefone);

  if (!entry) {
    entry = { messages: [], timer: null };
    state.set(telefone, entry);
    log.debug('Nova fila criada', { telefone });
  }

  entry.messages.push(messageData);

  const queueSize = entry.messages.length;
  log.info('Mensagem enfileirada', {
    telefone,
    fila: queueSize,
    aguardando_segundos: delaySeconds,
    message_id: messageData.message_id,
  });

  // Reinicia o timer a cada nova mensagem
  if (entry.timer) {
    clearTimeout(entry.timer);
    log.debug('Timer reiniciado', { telefone, fila: queueSize });
  }

  entry.timer = setTimeout(async () => {
    const flushed = entry.messages.slice();
    state.delete(telefone);

    log.info('Flush disparado', {
      telefone,
      total_mensagens: flushed.length,
      mensagens: flushed.map((m) => ({ id: m.message_id, preview: m.message?.slice(0, 60) })),
    });

    try {
      await onFlush(flushed);
    } catch (err) {
      log.error('Erro no flush', err);
    }
  }, delaySeconds * 1000);
}

function cancel(telefone) {
  const entry = state.get(telefone);
  if (entry?.timer) {
    clearTimeout(entry.timer);
    log.warn('Fila cancelada (pausa)', { telefone, mensagens_descartadas: entry.messages.length });
  }
  state.delete(telefone);
}

module.exports = { enqueue, cancel };
