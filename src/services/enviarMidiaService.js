const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const { create } = require('../utils/logger');

const log = create('EnviarMidia');
const supabase = createClient(config.supabase.url, config.supabase.key);

// ID do estúdio fixo (mesmo do n8n)
const ESTUDIO_ID = process.env.EMPRESA_ID || 'bda37657-6290-439e-8a92-856d0983e26d';

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
 * Equivalente ao workflow "Modelos produtos - FOTOS" do n8n.
 */
async function enviarMidia({ categoria, telefone }, contextoWpp) {
  const { serverUrl, nomeInstancia, apikey } = contextoWpp;
  const categoriaNormalizada = normalizarCategoria(categoria);

  log.info('📸 Buscando fotos', { categoria: categoriaNormalizada, telefone });

  // 1. Busca fotos no Supabase
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

  // 2. Sorteia 1 a 3 fotos aleatórias
  const quantidade = Math.floor(Math.random() * 3) + 1;
  const embaralhadas = [...data].sort(() => Math.random() - 0.5);
  const selecionadas = embaralhadas.slice(0, quantidade);

  log.info('📸 Fotos selecionadas', {
    total_disponivel: data.length,
    quantidade_enviar: selecionadas.length,
    categoria: categoriaNormalizada,
  });

  // 3. Envia cada foto com delay aleatório entre elas
  const url = `${serverUrl}/message/sendMedia/${nomeInstancia}`;

  for (let i = 0; i < selecionadas.length; i++) {
    const foto = selecionadas[i];

    // Delay aleatório entre 1 e 10 segundos (igual ao n8n)
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

module.exports = { enviarMidia };
