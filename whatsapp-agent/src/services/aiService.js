const OpenAI = require('openai');
const config = require('../config');
const { chamarApiStudio } = require('./studioApiService');
const { saveMessage, getHistory } = require('./memoryService');
const { create } = require('../utils/logger');

const log = create('AI');
const openai = new OpenAI({ apiKey: config.openai.apiKey });

// ─── Definição das tools ────────────────────────────────────────────────────

const tools = [
  {
    type: 'function',
    function: {
      name: 'chamar_api_studio',
      description: 'Chama a API principal do estúdio para agendamentos, alunos, professores, disponibilidade, etc.',
      parameters: {
        type: 'object',
        required: ['acao'],
        properties: {
          acao: {
            type: 'string',
            enum: ['alunos', 'professores', 'verificar-disponibilidade', 'agendar', 'remarcar', 'cancelar', 'ativar-pacote', 'listar-pacotes'],
          },
          metodo: { type: 'string', enum: ['GET', 'POST'] },
          params: {
            type: 'object',
            properties: {
              q:        { type: 'string' },
              aluno_id: { type: 'string' },
              limit:    { type: 'integer' },
            },
          },
          corpo: {
            type: 'object',
            properties: {
              aluno_id:              { type: 'string' },
              nome:                  { type: 'string' },
              telefone:              { type: 'string' },
              cpf:                   { type: 'string' },
              email:                 { type: 'string' },
              professor_id:          { type: 'string' },
              data_inicio:           { type: 'string', description: 'ISO 8601 com -03:00. Para agendar.' },
              inicio:                { type: 'string', description: 'Início da janela ISO -03:00. Para verificar-disponibilidade.' },
              fim:                   { type: 'string', description: 'Fim da janela ISO -03:00. Para verificar-disponibilidade.' },
              tipo_aula:             { type: 'string', enum: ['individual', 'vip', 'grupo', 'experimental'] },
              agendamento_id:        { type: 'string' },
              agendamento_antigo_id: { type: 'string' },
              novo_inicio:           { type: 'string', description: 'Novo horário ISO -03:00 para remarcar.' },
              motivo:                { type: 'string' },
              observacoes:           { type: 'string' },
              pacote_id:             { type: 'string' },
            },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'notificar_humano',
      description: 'Notifica um atendente humano quando necessário (renovação, reclamação, erro persistente, pedido de humano).',
      parameters: {
        type: 'object',
        required: ['problema', 'resumo'],
        properties: {
          aluno_id:  { type: 'string' },
          nome:      { type: 'string' },
          telefone:  { type: 'string' },
          problema:  { type: 'string', description: "'saldo incorreto' | 'cobrança' | 'reclamação' | 'pedido de atendimento humano' | 'erro de agendamento' | 'renovação de plano'" },
          resumo:    { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_info',
      description: 'Busca informações no RAG (preços, planos, horários, localização, convênios). Máximo 2 chamadas por pergunta.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Termos-chave — não a pergunta completa.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'enviar_midia',
      description: 'Envia mídia ao aluno. Usar somente quando o aluno pedir explicitamente.',
      parameters: {
        type: 'object',
        required: ['categoria', 'telefone'],
        properties: {
          categoria: { type: 'string', enum: ['aulas', 'estudio', 'equipamentos'] },
          telefone:  { type: 'string' },
        },
      },
    },
  },
];

// ─── Execução das tools ──────────────────────────────────────────────────────

async function executeTool(name, args, context) {
  const start = Date.now();
  log.info('Executando tool', { tool: name, args });

  let result;
  try {
    switch (name) {
      case 'chamar_api_studio':
        result = await chamarApiStudio(args);
        break;

      case 'notificar_humano':
        // TODO: integre com seu sistema (webhook, email, Slack, etc.)
        log.warn('NOTIFICAR HUMANO solicitado', args);
        result = { sucesso: true, mensagem: 'Atendente notificado.' };
        break;

      case 'buscar_info':
        // TODO: integre com seu Supabase Vector Store / RAG
        log.info('BUSCAR INFO (RAG)', { query: args.query });
        result = { resultado: 'Informação não disponível no momento.' };
        break;

      case 'enviar_midia':
        // TODO: integre com seu sistema de envio de mídia
        log.info('ENVIAR MÍDIA', args);
        result = { sucesso: true };
        break;

      default:
        log.warn('Tool desconhecida', { tool: name });
        result = { erro: `Tool desconhecida: ${name}` };
    }
  } catch (err) {
    log.error('Erro na execução da tool', { tool: name, error: err.message });
    result = { erro: err.message };
  }

  log.info('Tool concluída', { tool: name, elapsed_ms: Date.now() - start, sucesso: !result?.erro });
  return result;
}

// ─── Loop do agente ──────────────────────────────────────────────────────────

/**
 * Executa o agente de IA com memória e tools
 */
async function runAgent(sessionId, userMessage, systemPrompt, context = {}) {
  const MAX_ITERATIONS = 4;
  const agentStart = Date.now();

  log.info('Iniciando agente', {
    sessionId,
    telefone: context.telefoneCliente,
    preview: userMessage?.slice(0, 80),
  });

  await saveMessage(sessionId, 'user', userMessage);

  const history = await getHistory(sessionId);
  log.debug('Histórico carregado', { sessionId, mensagens: history.length });

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((h) => ({ role: h.role, content: h.content })),
  ];

  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const iterStart = Date.now();

    log.debug(`Iteração ${iterations}/${MAX_ITERATIONS}`, {
      sessionId,
      total_messages: messages.length,
    });

    const response = await openai.chat.completions.create({
      model: config.openai.model,
      max_tokens: config.openai.maxTokens,
      messages,
      tools,
      tool_choice: 'auto',
    });

    const choice = response.choices[0];
    const assistantMessage = choice.message;
    const toolCalls = assistantMessage.tool_calls || [];

    log.debug(`Resposta OpenAI — iteração ${iterations}`, {
      sessionId,
      finish_reason: choice.finish_reason,
      tool_calls: toolCalls.map((t) => t.function.name),
      tokens: response.usage,
      elapsed_ms: Date.now() - iterStart,
    });

    messages.push(assistantMessage);

    // Sem tool calls → resposta final
    if (toolCalls.length === 0) {
      const finalText = assistantMessage.content || '';
      await saveMessage(sessionId, 'assistant', finalText);

      log.info('Agente concluído', {
        sessionId,
        iteracoes: iterations,
        elapsed_ms: Date.now() - agentStart,
        tokens_total: response.usage?.total_tokens,
        preview: finalText?.slice(0, 80),
      });

      return finalText;
    }

    // Executa tools em paralelo
    log.info('Executando tools', { sessionId, tools: toolCalls.map((t) => t.function.name) });

    const toolResults = await Promise.all(
      toolCalls.map(async (toolCall) => {
        let args;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }
        const result = await executeTool(toolCall.function.name, args, context);
        return { tool_call_id: toolCall.id, result };
      })
    );

    for (const { tool_call_id, result } of toolResults) {
      messages.push({
        role: 'tool',
        tool_call_id,
        content: JSON.stringify(result),
      });
    }
  }

  // Fallback se atingiu o limite de iterações
  log.warn('Limite de iterações atingido', { sessionId, MAX_ITERATIONS });
  const fallback = 'Desculpe, não consegui processar sua solicitação. Por favor, tente novamente.';
  await saveMessage(sessionId, 'assistant', fallback);
  return fallback;
}

module.exports = { runAgent };
