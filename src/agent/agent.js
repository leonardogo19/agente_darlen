const OpenAI = require('openai');
const config = require('../config');
const { saveMessage, getHistory } = require('./memory');

// ─── Tools por modo ───────────────────────────────────────────────────────────
const { alunoToolDefinitions, executeAlunoTool, alunoToolNames } = require('./tools/alunoTools');
const { professorToolDefinitions, executeProfessorTool, professorToolNames } = require('./tools/professorTools');

// ─── Tools auxiliares (usadas em ambos os modos) ──────────────────────────────
const { ragToolDefinition, executeRagTool } = require('./tools/ragTool');
const { humanToolDefinition, executeHumanTool } = require('./tools/humanTool');
const { mediaToolDefinition, executeMediaTool } = require('./tools/mediaTool');

const { create } = require('../utils/logger');

const log = create('AI');
const openai = new OpenAI({ apiKey: config.openai.apiKey });

// ─── Conjuntos de tools por modo ─────────────────────────────────────────────

const toolsAluno = [
  ...alunoToolDefinitions,
  // buscar_info, notificar_humano e enviar_midia já estão em alunoToolDefinitions
];

const toolsProfessor = [
  ...professorToolDefinitions,
  // Professores não precisam de RAG, notificar_humano ou enviar_midia
];

// ─── Execução das tools ───────────────────────────────────────────────────────

async function executeTool(name, args, context, modo) {
  const start = Date.now();
  log.info('⚡ Executando tool', { tool: name, args, modo });

  let result;
  try {
    if (modo === 'professor') {
      // Tools do professor
      result = await executeProfessorTool(name, args);
      if (result !== null) {
        log.info('✔️  Tool professor concluída', { tool: name, elapsed_ms: Date.now() - start });
        return result;
      }
    } else {
      // Tools do aluno
      if (alunoToolNames.includes(name)) {
        // buscar_info, notificar_humano e enviar_midia são tratados abaixo
        if (!['buscar_info', 'notificar_humano', 'enviar_midia'].includes(name)) {
          result = await executeAlunoTool(name, args);
          log.info('✔️  Tool aluno concluída', { tool: name, elapsed_ms: Date.now() - start });
          return result;
        }
      }
    }

    // Tools auxiliares (aluno usa RAG, humano e mídia)
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
        log.warn('Tool desconhecida', { tool: name, modo });
        result = { erro: `Tool desconhecida: ${name}` };
    }
  } catch (err) {
    log.error('Erro na execução da tool', { tool: name, error: err.message });
    result = { erro: err.message };
  }

  log.info('✔️  Tool concluída', { tool: name, elapsed_ms: Date.now() - start, sucesso: !result?.erro });
  return result;
}

// ─── Loop do agente ───────────────────────────────────────────────────────────

async function runAgent(sessionId, userMessage, systemPrompt, context = {}) {
  const MAX_ITERATIONS = 8;
  const agentStart = Date.now();
  const modo = context.modo || 'aluno';

  log.info('🎯 Iniciando agente', {
    sessionId,
    modo,
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

  // Seleciona o conjunto de tools correto para o modo
  const tools = modo === 'professor' ? toolsProfessor : toolsAluno;

  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const iterStart = Date.now();

    log.debug(`🔄 Iteração ${iterations}/${MAX_ITERATIONS}`, { sessionId, modo, total_messages: messages.length });

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
      modo,
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
        modo,
        iteracoes: iterations,
        elapsed_ms: Date.now() - agentStart,
        tokens_total: response.usage?.total_tokens,
        preview: finalText?.slice(0, 80),
      });
      return finalText;
    }

    log.info('🔧 Executando tools', { sessionId, modo, tools: toolCalls.map((t) => t.function.name) });

    const toolResults = await Promise.all(
      toolCalls.map(async (toolCall) => {
        let args;
        try { args = JSON.parse(toolCall.function.arguments); } catch { args = {}; }
        const result = await executeTool(toolCall.function.name, args, context, modo);
        return { tool_call_id: toolCall.id, result };
      })
    );

    for (const { tool_call_id, result } of toolResults) {
      messages.push({ role: 'tool', tool_call_id, content: JSON.stringify(result) });
    }
  }

  log.warn('🚨 Limite de iterações atingido', { sessionId, modo, MAX_ITERATIONS });
  const fallback = 'Desculpe, não consegui processar sua solicitação. Por favor, tente novamente.';
  await saveMessage(sessionId, 'assistant', fallback);
  return fallback;
}

module.exports = { runAgent };
