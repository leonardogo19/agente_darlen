const express = require('express');
const config = require('./config');
const { enqueue, cancel } = require('./services/debouncerService');
const { getClientByPhone, createClient, updateClientSession, pauseClient } = require('./services/supabaseService');
const { sendText } = require('./services/whatsappService');
const { runAgent } = require('./services/aiService');
const { buildSystemPrompt } = require('./services/promptService');
const { create } = require('./utils/logger');
const { v4: uuidv4 } = require('uuid');

const log = create('Webhook');
const router = express.Router();

router.post('/', async (req, res) => {
  res.status(200).json({ ok: true });

  const requestId = uuidv4().slice(0, 8); // ID curto para rastrear o request nos logs
  log.info('Webhook recebido', {
    requestId,
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

  // ── 2. Ignora mensagens enviadas pelo próprio bot ──────────────────────────
  if (body?.data?.key?.fromMe === true) {
    log.debug('Ignorando mensagem própria (fromMe=true)', { requestId, telefoneCliente });
    return;
  }

  // ── 3. Ignora status DELIVERY_ACK ─────────────────────────────────────────
  if (body?.data?.status === 'DELIVERY_ACK') {
    log.debug('Ignorando DELIVERY_ACK', { requestId, telefoneCliente });
    return;
  }

  // ── 4. Reação → pausa o atendimento ───────────────────────────────────────
  if (tipoMensagem === 'reactionMessage') {
    log.warn('Reação recebida — pausando atendimento', { requestId, telefoneCliente });
    cancel(telefoneCliente);
    const clients = await getClientByPhone(telefoneCliente, config.empresaId);
    if (clients.length > 0) {
      await pauseClient(clients[0].id);
    } else {
      log.warn('Reação de cliente não encontrado — ignorando', { requestId, telefoneCliente });
    }
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
      log.warn('Cliente pausado — mensagem ignorada', { requestId, telefoneCliente, id: clientRecord.id });
      return;
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
  const messageText = tipoMensagem === 'audioMessage'
    ? body?.data?.message?.speechToText
    : mensagem;

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

  const systemPrompt = buildSystemPrompt(telefoneCliente);
  const response = await runAgent(sessionId, combinedMessage, systemPrompt, { telefoneCliente });

  if (!response) {
    log.warn('Agente retornou resposta vazia', { telefoneCliente, sessionId });
    return;
  }

  await sendText(serverUrl, nomeInstancia, apikey, telefoneCliente, response);

  log.info('Ciclo completo', {
    telefoneCliente,
    sessionId,
    elapsed_ms: Date.now() - start,
  });
}

// ── Extração de campos do body ─────────────────────────────────────────────

function extractCampos(body) {
  try {
    const telefoneCliente =
      body?.conversation?.contact_inbox?.contact_id ||
      body?.data?.key?.remoteJid ||
      null;

    if (!telefoneCliente) return null;

    return {
      telefoneCliente: telefoneCliente.toString(),
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
