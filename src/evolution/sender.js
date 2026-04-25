const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const { create } = require('../utils/logger');

const log = create('WhatsApp');
const supabase = createClient(config.supabase.url, config.supabase.key);

// Número fixo que recebe as notificações (atendente/responsável)
const NUMERO_ATENDENTE = process.env.HUMANO_TELEFONE || '5551995009663';
const ESTUDIO_ID = process.env.EMPRESA_ID || 'bda37657-6290-439e-8a92-856d0983e26d';

// ─── Envio de texto ──────────────────────────────────────────────────────────

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

// ─── Indicador de digitação ──────────────────────────────────────────────────

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

// ─── Envio de mídia ──────────────────────────────────────────────────────────

/**
 * Normaliza a categoria para o padrão do banco
 */
function normalizarCategoria(categoria) {
  const c = (categoria || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (c.includes('equip')) return 'equipamentos';
  if (c.includes('aula'))  return 'aulas';
  if (c.includes('estudio') || c.includes('studio')) return 'estudio';
  return c;
}

/**
 * Busca fotos no Supabase, sorteia 1-3 aleatórias e envia via Evolution API.
 */
async function enviarMidia({ categoria, telefone }, contextoWpp) {
  const { serverUrl, nomeInstancia, apikey } = contextoWpp;
  const categoriaNormalizada = normalizarCategoria(categoria);

  log.info('📸 Buscando fotos', { categoria: categoriaNormalizada, telefone });

  const { data, error } = await supabase
    .from('galeria_fotos')
    .select('*')
    .eq('estudio_id', ESTUDIO_ID)
    .eq('categoria', categoriaNormalizada);

  if (error) {
    log.error('Erro ao buscar fotos', { error: error.message });
    return { sucesso: false, erro: error.message };
  }

  if (!data || data.length === 0) {
    log.warn('Nenhuma foto encontrada', { categoria: categoriaNormalizada });
    return { sucesso: false, mensagem: `Nenhuma foto encontrada para categoria: ${categoriaNormalizada}` };
  }

  const quantidade = Math.floor(Math.random() * 3) + 1;
  const embaralhadas = [...data].sort(() => Math.random() - 0.5);
  const selecionadas = embaralhadas.slice(0, quantidade);

  log.info('📸 Fotos selecionadas', {
    total_disponivel: data.length,
    quantidade_enviar: selecionadas.length,
    categoria: categoriaNormalizada,
  });

  const url = `${serverUrl}/message/sendMedia/${nomeInstancia}`;

  for (let i = 0; i < selecionadas.length; i++) {
    const foto = selecionadas[i];

    if (i > 0) {
      const delaySeg = Math.floor(Math.random() * 10) + 1;
      log.debug(`⏳ Aguardando ${delaySeg}s antes da próxima foto`, { i: i + 1 });
      await new Promise((resolve) => setTimeout(resolve, delaySeg * 1000));
    }

    try {
      await axios.post(
        url,
        {
          number:    telefone,
          mediatype: 'image',
          mimetype:  'image/png',
          media:     foto.url,
        },
        { headers: { apikey } }
      );
      log.info(`✅ Foto ${i + 1}/${selecionadas.length} enviada`, { url: foto.url });
    } catch (err) {
      log.error(`❌ Erro ao enviar foto ${i + 1}`, { error: err.message, url: foto.url });
    }
  }

  return { sucesso: true, mensagem: 'enviado as fotos', quantidade: selecionadas.length };
}

// ─── Notificação humana ──────────────────────────────────────────────────────

/**
 * Notifica o atendente humano via WhatsApp com os dados do aluno e o problema.
 */
async function notificarHumano({ nome, telefone, problema, resumo }, contextoWpp) {
  const { serverUrl, nomeInstancia, apikey } = contextoWpp;

  const nomeExibido     = nome     || 'Aluno não identificado';
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

module.exports = { sendText, sendTyping, enviarMidia, notificarHumano };
