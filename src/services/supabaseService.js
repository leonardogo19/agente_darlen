const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { create } = require('../utils/logger');

const log = create('Supabase');
const supabase = createSupabaseClient(config.supabase.url, config.supabase.key);

/**
 * Busca aluno pelo telefone e empresa
 */
async function getClientByPhone(telefone, empresaId) {
  log.debug('Buscando cliente', { telefone, empresaId });

  const { data, error } = await supabase
    .from('alunos')
    .select('*')
    .eq('telefone', telefone)
    .eq('estudio_id', empresaId);

  if (error) {
    log.error('Erro ao buscar cliente', { telefone, error: error.message });
    throw new Error(`[Supabase] getClientByPhone: ${error.message}`);
  }

  log.debug('Resultado da busca', { telefone, encontrados: data?.length ?? 0 });
  return data || [];
}

/**
 * Cria novo aluno
 */
async function createClient(fields) {
  const sessionId = uuidv4();
  log.info('Criando novo cliente', { telefone: fields.telefone, sessionId });

  const { data, error } = await supabase
    .from('alunos')
    .insert([{ ...fields, sessionId }])
    .select();

  if (error) {
    log.error('Erro ao criar cliente', { telefone: fields.telefone, error: error.message });
    throw new Error(`[Supabase] createClient: ${error.message}`);
  }

  log.info('Cliente criado', { id: data[0].id, telefone: fields.telefone });
  return data[0];
}

/**
 * Atualiza sessionId e idMensagem do aluno
 */
async function updateClientSession(id, sessionId, idMensagem, telefone) {
  log.debug('Atualizando sessão do cliente', { id, sessionId, idMensagem });

  const { error } = await supabase
    .from('alunos')
    .update({ sessionId, idMensagem, telefone })
    .eq('id', id);

  if (error) {
    log.error('Erro ao atualizar sessão', { id, error: error.message });
    throw new Error(`[Supabase] updateClientSession: ${error.message}`);
  }
}

/**
 * Pausa o atendimento do aluno por 3 horas
 */
async function pauseClient(id) {
  const now = new Date();
  const pausaFim = new Date(now.getTime() + 3 * 60 * 60 * 1000);

  log.warn('Pausando atendimento do cliente', {
    id,
    pausa_inicio: now.toISOString(),
    pausa_fim: pausaFim.toISOString(),
  });

  const { error } = await supabase
    .from('alunos')
    .update({
      pausado: true,
      pausa_inicio: now.toISOString(),
      pausa_fim: pausaFim.toISOString(),
    })
    .eq('id', id);

  if (error) {
    log.error('Erro ao pausar cliente', { id, error: error.message });
    throw new Error(`[Supabase] pauseClient: ${error.message}`);
  }
}

module.exports = { getClientByPhone, createClient, updateClientSession, pauseClient };
