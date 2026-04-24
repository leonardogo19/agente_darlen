const axios = require('axios');
const { create } = require('../utils/logger');
const log = create('WhatsApp');

/**
 * Envia mensagem de texto via Evolution API
 */
async function sendText(serverUrl, instance, apikey, telefone, text) {
  const url = `${serverUrl}/message/sendText/${instance}`;

  log.info('Enviando mensagem', {
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

    log.info('Mensagem enviada com sucesso', {
      telefone,
      status: response.status,
      message_id: response.data?.key?.id,
    });

    return response.data;
  } catch (err) {
    log.error('Falha ao enviar mensagem', {
      telefone,
      url,
      status: err.response?.status,
      response: err.response?.data,
      error: err.message,
    });
    throw err;
  }
}

module.exports = { sendText };
