const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { create } = require('../utils/logger');
const { normalizarTelefone, variantesTelefone } = require('./phone');

const log = create('Supabase');
const supabase = createSupabaseClient(config.supabase.url, config.supabase.key);

/**
 * Busca aluno pelo telefone e empresa.
 * Tenta as duas variantes (com e sem o 9) para não quebrar com números antigos.
 */
async function getClientByPhone(telefone, empresaId) {
  // Normaliza o número antes de qualquer coisa
  const canonico = normalizarTelefone(telefone);
  const variantes = variantesTelefone(telefone);

  log.debug('Buscando cliente', { telefone, canonico, variantes, empresaId });

  if (variantes.length === 0) {
    log.warn('Telefone inválido, não é possível buscar', { telefone });
    return [];
  }

  const { data, error } = await supabase
    .from('alunos')
    .select('*')
    .in('telefone', variantes)
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
 * Pausa o atendimento do aluno por X horas (padrão: 2h)
 */
async function pauseClient(id, horas = 2) {
  const now = new Date();
  const pausaFim = new Date(now.getTime() + horas * 60 * 60 * 1000);

  log.warn('Pausando atendimento do cliente', {
    id,
    horas,
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

/**
 * Retoma o atendimento do aluno (remove a pausa)
 */
async function unpauseClient(id) {
  log.info('Retomando atendimento do cliente', { id });

  const { error } = await supabase
    .from('alunos')
    .update({
      pausado: false,
      pausa_inicio: null,
      pausa_fim: null,
    })
    .eq('id', id);

  if (error) {
    log.error('Erro ao retomar cliente', { id, error: error.message });
    throw new Error(`[Supabase] unpauseClient: ${error.message}`);
  }
}

module.exports = { getClientByPhone, createClient, updateClientSession, pauseClient, unpauseClient };
