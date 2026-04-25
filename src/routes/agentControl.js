/**
 * Rotas de controle do agente — pausar e retomar atendimento manualmente.
 *
 * POST /agent/pause   { telefone, horas? }   → pausa o agente para aquele número
 * POST /agent/unpause { telefone }            → retoma o agente
 * GET  /agent/status  ?telefone=xxx           → retorna status atual
 */

const express = require('express');
const { getClientByPhone, pauseClient, unpauseClient } = require('../shared/supabase');
const { cancel } = require('../evolution/debouncer');
const config = require('../config');
const { create } = require('../utils/logger');

const log = create('AgentControl');
const router = express.Router();

// ── POST /agent/pause ────────────────────────────────────────────────────────
router.post('/pause', async (req, res) => {
  const { telefone, horas = 3 } = req.body;

  if (!telefone) {
    return res.status(400).json({ erro: 'Campo "telefone" obrigatório.' });
  }

  try {
    const clients = await getClientByPhone(telefone, config.empresaId);

    if (clients.length === 0) {
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }

    const client = clients[0];

    cancel(telefone);
    await pauseClient(client.id, horas);

    log.warn('Agente pausado via API', { telefone, id: client.id, horas });

    return res.json({
      ok: true,
      mensagem: `Agente pausado por ${horas}h para ${telefone}.`,
      pausa_fim: new Date(Date.now() + horas * 60 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    log.error('Erro ao pausar via API', { telefone, error: err.message });
    return res.status(500).json({ erro: err.message });
  }
});

// ── POST /agent/unpause ──────────────────────────────────────────────────────
router.post('/unpause', async (req, res) => {
  const { telefone } = req.body;

  if (!telefone) {
    return res.status(400).json({ erro: 'Campo "telefone" obrigatório.' });
  }

  try {
    const clients = await getClientByPhone(telefone, config.empresaId);

    if (clients.length === 0) {
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }

    const client = clients[0];
    await unpauseClient(client.id);

    log.info('Agente retomado via API', { telefone, id: client.id });

    return res.json({
      ok: true,
      mensagem: `Agente retomado para ${telefone}.`,
    });
  } catch (err) {
    log.error('Erro ao retomar via API', { telefone, error: err.message });
    return res.status(500).json({ erro: err.message });
  }
});

// ── GET /agent/status ────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  const { telefone } = req.query;

  if (!telefone) {
    return res.status(400).json({ erro: 'Query param "telefone" obrigatório.' });
  }

  try {
    const clients = await getClientByPhone(telefone, config.empresaId);

    if (clients.length === 0) {
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }

    const client = clients[0];
    const agora = new Date();
    const pausaFim = client.pausa_fim ? new Date(client.pausa_fim) : null;
    const pausaAtiva = client.pausado === true && pausaFim && pausaFim > agora;

    return res.json({
      telefone,
      nome: client.nome,
      pausado: pausaAtiva,
      pausa_inicio: client.pausa_inicio || null,
      pausa_fim: client.pausa_fim || null,
      pausa_expira_em: pausaFim && pausaFim > agora
        ? `${Math.ceil((pausaFim - agora) / 60000)} minutos`
        : null,
    });
  } catch (err) {
    log.error('Erro ao consultar status via API', { telefone, error: err.message });
    return res.status(500).json({ erro: err.message });
  }
});

module.exports = router;
