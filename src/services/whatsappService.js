const axios = require('axios');
const { create } = require('../utils/logger');
const log = create('WhatsApp');

/**
 * Envia mensagem de texto via Evolution API
 */
async function sendText(serverUrl, instance, apikey, telefone, text) {
  const url = `${serverUrl}/message/sendText/${instance}`;

  log.info('📤 Enviando mensagem', {
    telefone,
    instance,
    preview: text?.slice(0, 80),
    chars: text?.length,
  });

  try {
    const response = await axios.post(
      url,
      { number: telefone, text },
      { headers: { apikey } }
    );

    log.info('✅ Mensagem enviada com sucesso', {
      telefone,
      status: response.status,
      message_id: response.data?.key?.id,
    });

    return response.data;
  } catch (err) {
    log.error('❌ Falha ao enviar mensagem', {
      telefone,
      url,
      status: err.response?.status,
      response: err.response?.data,
      error: err.message,
    });
    throw err;
  }
}

/**
 * Ativa o indicador "digitando..." via Evolution API
 * @param {number} duracaoMs - quanto tempo manter o indicador ativo
 */
async function sendTyping(serverUrl, instance, apikey, telefone, duracaoMs = 2000) {
  try {
    await axios.post(
      `${serverUrl}/chat/updatePresence/${instance}`,
      { number: telefone, presence: 'composing' },
      { headers: { apikey } }
    );
    log.debug('⌨️  Digitando ativado', { telefone, duracaoMs });

    await new Promise((resolve) => setTimeout(resolve, duracaoMs));

    // Para o "digitando" após o delay
    await axios.post(
      `${serverUrl}/chat/updatePresence/${instance}`,
      { number: telefone, presence: 'paused' },
      { headers: { apikey } }
    ).catch(() => {}); // ignora erro ao pausar — não é crítico

  } catch (err) {
    // Não quebra o fluxo se o endpoint de presença falhar
    log.debug('Presença não suportada ou erro ignorado', { error: err.message });
  }
}

module.exports = { sendText, sendTyping };
