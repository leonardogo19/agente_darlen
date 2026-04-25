const axios = require('axios');
const { create } = require('../utils/logger');

const log = create('NotificarHumano');

// Número fixo que recebe as notificações (atendente/responsável)
const NUMERO_ATENDENTE = process.env.HUMANO_TELEFONE || '5551995009663';

/**
 * Notifica o atendente humano via WhatsApp com os dados do aluno e o problema.
 * Equivalente ao workflow TOOL_HUMANO do n8n.
 */
async function notificarHumano({ nome, telefone, problema, resumo, aluno_id }, contextoWpp) {
  const { serverUrl, nomeInstancia, apikey } = contextoWpp;

  const nomeExibido    = nome     || 'Aluno não identificado';
  const telefoneExibido = telefone || 'não informado';
  const problemaExibido = problema || 'não informado';
  const resumoExibido   = resumo   || '';

  const mensagem =
    `Solicitação de Atendimento Humano\n\n` +
    `Nome: ${nomeExibido}\n` +
    `Telefone: ${telefoneExibido}\n\n` +
    `Motivo: ${problemaExibido}\n\n` +
    `Resumo:\n${resumoExibido}`;

  log.warn('🔔 Notificando atendente humano', {
    para: NUMERO_ATENDENTE,
    nome: nomeExibido,
    telefone: telefoneExibido,
    problema: problemaExibido,
  });

  try {
    const url = `${serverUrl}/message/sendText/${nomeInstancia}`;
    await axios.post(
      url,
      { number: NUMERO_ATENDENTE, text: mensagem },
      { headers: { apikey } }
    );
    log.info('✅ Atendente notificado com sucesso', { para: NUMERO_ATENDENTE });
    return { sucesso: true, mensagem: 'Atendente notificado.' };
  } catch (err) {
    log.error('❌ Erro ao notificar atendente', { error: err.message });
    return { sucesso: false, erro: err.message };
  }
}

module.exports = { notificarHumano };
