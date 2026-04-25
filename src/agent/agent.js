const OpenAI = require('openai');
const config = require('../config');
const { saveMessage, getHistory } = require('./memory');
const { studioToolDefinitions, executeStudioTool, studioToolNames } = require('./tools/studioTools');
const { ragToolDefinition, executeRagTool } = require('./tools/ragTool');
const { humanToolDefinition, executeHumanTool } = require('./tools/humanTool');
const { mediaToolDefinition, executeMediaTool } = require('./tools/mediaTool');
const { create } = require('../utils/logger');

const log = create('AI');
const openai = new OpenAI({ apiKey: config.openai.apiKey });

// ─── Todas as tools disponíveis ──────────────────────────────────────────────

const tools = [
  ...studioToolDefinitions,
  ragToolDefinition,
  humanToolDefinition,
  mediaToolDefinition,
];

// ─── Execução das tools ──────────────────────────────────────────────────────

async function executeTool(name, args, context) {
  const start = Date.now();
  log.info('⚡ Executando tool', { tool: name, args });

  let result;
  try {
    // Tools de estúdio
    if (studioToolNames.includes(name)) {
      result = await executeStudioTool(name, args);
    } else {
      switch (name) {
        case 'buscar_info':
          log.info('🔍 BUSCAR INFO (RAG)', { query: args.query });
          result = await executeRagTool(args);
          break;

        case 'notificar_humano':
          log.warn('🔔 NOTIFICAR HUMANO', args);
          result = await executeHumanTool(args, context);
          break;

        case 'enviar_midia':
          log.info('📸 ENVIAR MÍDIA', args);
          result = await executeMediaTool(args, context);
          break;

        default:
          log.warn('Tool desconhecida', { tool: name });
          result = { erro: `Tool desconhecida: ${name}` };
      }
    }
  } catch (err) {
    log.error('Erro na execução da tool', { tool: name, error: err.message });
    result = { erro: err.message };
  }

  log.info('✔️  Tool concluída', { tool: name, elapsed_ms: Date.now() - start, sucesso: !result?.erro });
  return result;
}

// ─── Loop do agente ──────────────────────────────────────────────────────────

async function runAgent(sessionId, userMessage, systemPrompt, context = {}) {
  const MAX_ITERATIONS = 8;
  const agentStart = Date.now();

  log.info('🎯 Iniciando agente', {
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

    log.debug(`🔄 Iteração ${iterations}/${MAX_ITERATIONS}`, { sessionId, total_messages: messages.length });

    // Modelos legados (gpt-3.5-*, gpt-4, gpt-4-*, gpt-4o clássico) usam max_tokens.
    // Modelos novos (gpt-4o-mini 2024+, gpt-5*, o1, o3, o4, etc.) usam max_completion_tokens.
    const isLegacyModel = /^gpt-(3\.5|4(?!o-mini|-mini|-5|-turbo-preview|-vision|-0125|-1106|-32k|-0613|-0314|-4-0314|-4-0613|-4-32k))/i.test(config.openai.model);
    const tokenParam = isLegacyModel
      ? { max_tokens: config.openai.maxTokens }
      : { max_completion_tokens: config.openai.maxTokens };

    const response = await openai.chat.completions.create({
      model: config.openai.model,
      ...tokenParam,
      messages,
      tools,
      tool_choice: 'auto',
    });

    const choice = response.choices[0];
    const assistantMessage = choice.message;
    const toolCalls = assistantMessage.tool_calls || [];

    log.debug(`📡 OpenAI respondeu — iteração ${iterations}`, {
      sessionId,
      finish_reason: choice.finish_reason,
      tool_calls: toolCalls.map((t) => t.function.name),
      tokens: response.usage,
      elapsed_ms: Date.now() - iterStart,
    });

    messages.push(assistantMessage);

    if (toolCalls.length === 0) {
      const finalText = assistantMessage.content || '';
      await saveMessage(sessionId, 'assistant', finalText);
      log.info('🏁 Agente concluído', {
        sessionId,
        iteracoes: iterations,
        elapsed_ms: Date.now() - agentStart,
        tokens_total: response.usage?.total_tokens,
        preview: finalText?.slice(0, 80),
      });
      return finalText;
    }

    log.info('🔧 Executando tools', { sessionId, tools: toolCalls.map((t) => t.function.name) });

    const toolResults = await Promise.all(
      toolCalls.map(async (toolCall) => {
        let args;
        try { args = JSON.parse(toolCall.function.arguments); } catch { args = {}; }
        const result = await executeTool(toolCall.function.name, args, context);
        return { tool_call_id: toolCall.id, result };
      })
    );

    for (const { tool_call_id, result } of toolResults) {
      messages.push({ role: 'tool', tool_call_id, content: JSON.stringify(result) });
    }
  }

  log.warn('🚨 Limite de iterações atingido', { sessionId, MAX_ITERATIONS });
  const fallback = 'Desculpe, não consegui processar sua solicitação. Por favor, tente novamente.';
  await saveMessage(sessionId, 'assistant', fallback);
  return fallback;
}

module.exports = { runAgent };
