const express = require('express');
const config = require('../config');
const { enqueue, cancel } = require('./debouncer');
const { getClientByPhone, createClient, updateClientSession, pauseClient, unpauseClient } = require('../shared/supabase');
const { sendText, sendTyping } = require('./sender');
const { runAgent } = require('../agent/agent');
const { buildPromptAluno } = require('../agent/promptAluno');
const { buildPromptProfessor } = require('../agent/promptProfessor');
const { chamarApiStudio } = require('../studio/studioApi');
const { create } = require('../utils/logger');
const { cleanMarkdown } = require('../shared/cleanText');
const { normalizarTelefone } = require('../shared/phone');
const { v4: uuidv4 } = require('uuid');

const log = create('Webhook');
const router = express.Router();

router.post('/', async (req, res) => {
  res.status(200).json({ ok: true });

  const requestId = uuidv4().slice(0, 8);
  log.info('Webhook recebido', {
    requestId,
    event: req.body?.event,
    messageType: req.body?.data?.messageType,
    instance: req.body?.instance,
    fromMe: req.body?.data?.key?.fromMe,
    status: req.body?.data?.status,
  });

  try {
    await processWebhook(req.body, requestId);
  } catch (err) {
    log.error('Erro não tratado no webhook', { requestId, error: err.message, stack: err.stack });
  }
});

async function processWebhook(body, requestId) {
  // ── 1. Extrai campos iniciais ──────────────────────────────────────────────
  const campos = extractCampos(body);
  if (!campos) {
    log.warn('Campos inválidos — webhook ignorado', { requestId });
    return;
  }

  const { telefoneCliente, nomeCliente, nomeInstancia, mensagem,
    tipoMensagem, idMensagem, apikey, serverUrl } = campos;

  log.info('Campos extraídos', {
    requestId,
    telefoneCliente,
    nomeCliente,
    tipoMensagem,
    idMensagem,
    nomeInstancia,
    temMensagem: !!mensagem,
  });

  // ── 2. Reação → pausa o atendimento por 3 horas (antes de qualquer filtro) ─
  // Deve vir antes do fromMe pois a reação do responsável chega com fromMe=true
  if (tipoMensagem === 'reactionMessage') {
    // Só pausa se a reação veio do responsável (fromMe=true) ou do próprio cliente
    log.warn('Reação recebida — pausando atendimento por 3h', { requestId, telefoneCliente, fromMe: body?.data?.key?.fromMe });
    cancel(telefoneCliente);
    const clients = await getClientByPhone(telefoneCliente, config.empresaId);
    if (clients.length > 0) {
      await pauseClient(clients[0].id, 3);
      log.info('Atendimento pausado por 3h', { requestId, telefoneCliente, id: clients[0].id });
    } else {
      log.warn('Reação de cliente não encontrado — ignorando', { requestId, telefoneCliente });
    }
    return;
  }

  // ── 3. Ignora mensagens enviadas pelo próprio bot ──────────────────────────
  if (body?.data?.key?.fromMe === true) {
    log.debug('Ignorando mensagem própria (fromMe=true)', { requestId, telefoneCliente });
    return;
  }

  const senderNumber = body?.sender?.replace(/\D/g, '');
  const clientNumber = campos.telefoneCliente?.replace(/\D/g, '').replace(/@.*/, '');
  if (senderNumber && clientNumber && senderNumber === clientNumber) {
    log.debug('Ignorando mensagem do próprio número da instância', { requestId, telefoneCliente });
    return;
  }

  // ── 4. Processa apenas eventos de mensagem nova (MESSAGES_UPSERT) ─────────
  const event = body?.event;
  if (event && event !== 'messages.upsert') {
    log.debug('Ignorando evento não relevante', { requestId, event, telefoneCliente });
    return;
  }

  if (!event && body?.data?.status === 'DELIVERY_ACK') {
    log.debug('Ignorando DELIVERY_ACK', { requestId, telefoneCliente });
    return;
  }

  // ── 5. Busca/cria cliente no Supabase ─────────────────────────────────────
  let clients = await getClientByPhone(telefoneCliente, config.empresaId);
  let clientRecord;

  if (clients.length === 0) {
    log.info('Cliente não encontrado — criando', { requestId, telefoneCliente, nomeCliente });
    clientRecord = await createClient({
      nome: nomeCliente,
      telefone: telefoneCliente,
      idMensagem,
      sessionId: uuidv4(),
      estudio_id: config.empresaId,
    });
  } else {
    clientRecord = clients[0];
    log.debug('Cliente encontrado', {
      requestId,
      id: clientRecord.id,
      telefoneCliente,
      pausado: clientRecord.pausado,
      temSession: !!clientRecord.sessionId,
    });

    if (clientRecord.pausado === true) {
      const pausaFim = clientRecord.pausa_fim ? new Date(clientRecord.pausa_fim) : null;
      if (pausaFim && pausaFim <= new Date()) {
        log.info('Pausa expirada — retomando atendimento automaticamente', {
          requestId, id: clientRecord.id, pausaFim: pausaFim.toISOString(),
        });
        await unpauseClient(clientRecord.id);
        clientRecord.pausado = false;
      } else {
        log.warn('Cliente pausado — mensagem ignorada', {
          requestId, telefoneCliente, id: clientRecord.id,
          pausa_fim: pausaFim?.toISOString(),
        });
        return;
      }
    }

    if (!clientRecord.sessionId) {
      clientRecord.sessionId = uuidv4();
      log.info('SessionId gerado para cliente existente', { requestId, id: clientRecord.id });
    }

    await updateClientSession(clientRecord.id, clientRecord.sessionId, idMensagem, telefoneCliente);
  }

  const sessionId = clientRecord.sessionId;

  // ── 6. Imagem: avisa que não consegue interpretar ─────────────────────────
  if (tipoMensagem === 'imageMessage') {
    log.info('Imagem recebida — enviando aviso', { requestId, telefoneCliente });
    await sendText(serverUrl, nomeInstancia, apikey, telefoneCliente,
      'No momento, não consigo interpretar imagens. Poderia descrevê-la para mim?');
    return;
  }

  // ── 7. Resolve o texto da mensagem ────────────────────────────────────────
  let messageText;

  if (tipoMensagem === 'audioMessage') {
    messageText = body?.data?.message?.speechToText;
    if (!messageText) {
      log.warn('Áudio sem speechToText — pedindo para reenviar', { requestId, telefoneCliente });
      await sendText(serverUrl, nomeInstancia, apikey, telefoneCliente,
        'Não consegui ouvir seu áudio. Pode digitar sua mensagem?');
      return;
    }
  } else {
    messageText = mensagem;
  }

  if (!messageText) {
    log.warn('Mensagem sem texto — ignorando', { requestId, telefoneCliente, tipoMensagem });
    return;
  }

  // ── 8. Debouncer em memória ───────────────────────────────────────────────
  log.debug('Enfileirando no debouncer', { requestId, telefoneCliente, sessionId });

  enqueue(
    telefoneCliente,
    { message: messageText, timestamp: new Date().toISOString(), message_id: idMensagem },
    config.debouncerTime,
    (messages) => processMessages(messages, telefoneCliente, sessionId, serverUrl, nomeInstancia, apikey)
  );
}

// ── Processa as mensagens agrupadas e chama o agente ──────────────────────

async function processMessages(messages, telefoneCliente, sessionId, serverUrl, nomeInstancia, apikey) {
  const start = Date.now();

  const combinedMessage = messages
    .map((m) => m.message)
    .filter(Boolean)
    .join('\n');

  if (!combinedMessage) {
    log.warn('Nenhum texto após combinar mensagens', { telefoneCliente });
    return;
  }

  log.info('Processando mensagens agrupadas', {
    telefoneCliente,
    sessionId,
    total: messages.length,
    combined_preview: combinedMessage.slice(0, 100),
  });

  // ── Identificar se é professor (PRIORIDADE) ────────────────────────────────
  let modo = 'aluno';
  let professor = null;

  try {
    const resultado = await chamarApiStudio({
      acao: 'professor',
      metodo: 'POST',
      corpo: { acao: 'identificar', telefone: telefoneCliente },
    });

    if (resultado?.eh_professor === true && resultado?.professor) {
      modo = 'professor';
      professor = resultado.professor;
      log.info('👨‍🏫 Professor identificado', { telefoneCliente, nome: professor.nome, id: professor.id });
    } else {
      log.debug('Não é professor — modo aluno', { telefoneCliente });
    }
  } catch (err) {
    log.warn('Erro ao identificar professor — assumindo modo aluno', { telefoneCliente, error: err.message });
  }

  // ── Selecionar prompt correto ──────────────────────────────────────────────
  const systemPrompt = modo === 'professor'
    ? buildPromptProfessor(telefoneCliente, professor)
    : buildPromptAluno(telefoneCliente);

  // ── Chamar o agente com o modo correto ────────────────────────────────────
  const response = await runAgent(sessionId, combinedMessage, systemPrompt, {
    telefoneCliente,
    modo,
    professor,
    wpp: { serverUrl, nomeInstancia, apikey },
  });

  if (!response) {
    log.warn('Agente retornou resposta vazia', { telefoneCliente, sessionId });
    return;
  }

  const partes = response
    .split('|||')
    .map((p) => cleanMarkdown(p))
    .filter(Boolean);

  log.info('Enviando resposta picotada', {
    telefoneCliente,
    modo,
    total_partes: partes.length,
    partes: partes.map((p) => p.slice(0, 50)),
  });

  for (let i = 0; i < partes.length; i++) {
    const parte = partes[i];
    const typingMs = Math.min(Math.max(parte.length * 50, 800), 3000);

    await sendTyping(serverUrl, nomeInstancia, apikey, telefoneCliente, typingMs);
    await sendText(serverUrl, nomeInstancia, apikey, telefoneCliente, parte);

    if (i < partes.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  log.info('Ciclo completo', {
    telefoneCliente,
    sessionId,
    modo,
    partes: partes.length,
    elapsed_ms: Date.now() - start,
  });
}

// ── Extração de campos do body ─────────────────────────────────────────────

function extractCampos(body) {
  try {
    const rawTelefone =
      body?.conversation?.contact_inbox?.contact_id ||
      body?.data?.key?.remoteJid ||
      null;

    if (!rawTelefone) return null;

    // Normaliza para o padrão canônico — cobre 8 e 9 dígitos
    const telefoneCliente = normalizarTelefone(rawTelefone.toString()) ?? rawTelefone.toString();

    return {
      telefoneCliente,
      telefoneEmpresa: body?.sender || null,
      nomeCliente:     body?.data?.pushName || null,
      nomeInstancia:   body?.instance || null,
      mensagem:
        body?.content ||
        body?.data?.message?.extendedTextMessage?.text ||
        body?.data?.message?.imageMessage?.caption ||
        body?.data?.message?.conversation ||
        null,
      tipoMensagem: body?.data?.messageType || null,
      idMensagem:   body?.data?.key?.id || null,
      apikey:       body?.apikey || null,
      serverUrl:    body?.server_url || null,
    };
  } catch (err) {
    log.error('Erro ao extrair campos do body', { error: err.message, body: JSON.stringify(body)?.slice(0, 300) });
    return null;
  }
}

module.exports = router;
