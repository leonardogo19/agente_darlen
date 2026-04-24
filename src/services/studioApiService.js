const axios = require('axios');
const config = require('../config');
const { create } = require('../utils/logger');

const log = create('StudioAPI');

/**
 * Chama a API do estúdio
 * @param {object} payload - { acao, metodo, params, corpo }
 */
async function chamarApiStudio(payload) {
  log.info('Chamando API do estúdio', {
    acao: payload.acao,
    metodo: payload.metodo || 'POST',
    params: payload.params,
    corpo: payload.corpo,
  });

  const start = Date.now();

  try {
    const response = await axios.post(config.studio.apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-studio-key': config.studio.apiKey,
      },
    });

    const elapsed = Date.now() - start;
    log.info('Resposta da API do estúdio', {
      acao: payload.acao,
      status: response.status,
      elapsed_ms: elapsed,
      sucesso: response.data?.sucesso,
      preview: JSON.stringify(response.data)?.slice(0, 200),
    });

    return response.data;
  } catch (err) {
    const elapsed = Date.now() - start;
    log.error('Erro na API do estúdio', {
      acao: payload.acao,
      elapsed_ms: elapsed,
      status: err.response?.status,
      response: err.response?.data,
      error: err.message,
    });
    throw err;
  }
}

module.exports = { chamarApiStudio };
