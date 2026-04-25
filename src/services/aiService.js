const OpenAI = require('openai');
const config = require('../config');
const { chamarApiStudio } = require('./studioApiService');
const { saveMessage, getHistory } = require('./memoryService');
const { buscarInfo } = require('./ragService');
const { notificarHumano } = require('./notificarHumanoService');
const { enviarMidia } = require('./enviarMidiaService');
const { create } = require('../utils/logger');

const log = create('AI');
const openai = new OpenAI({ apiKey: config.openai.apiKey });
const SEP = '|||';

// ─── Definição das tools ────────────────────────────────────────────────────

const tools = [
  {
    type: 'function',
    function: {
      name: 'chamar_api_studio',
      description: `Chama a API do estúdio. Regras de uso:
- "alunos" GET: busca aluno. Use params.q com o telefone. Ex: { acao:"alunos", metodo:"GET", params:{ q:"5551..." } }
- "verificar-disponibilidade": SEMPRE use corpo com inicio, fim (ISO -03:00), tipo_aula e aluno_id. Ex: { acao:"verificar-disponibilidade", corpo:{ inicio:"2026-04-28T10:00:00-03:00", fim:"2026-04-28T11:00:00-03:00", tipo_aula:"individual", aluno_id:"uuid" } }
- "agendar": use corpo com aluno_id, professor_id, data_inicio (ISO -03:00), tipo_aula
- "remarcar": use corpo com agendamento_antigo_id, novo_inicio (ISO -03:00), professor_id
- "cancelar": use corpo com agendamento_id e motivo
- NUNCA coloque inicio/fim/data_inicio em params — sempre em corpo`,
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
      description: 'Busca informações no RAG (preços, planos, horários, localização, convênios, benefícios). IMPORTANTE: após receber o resultado, reescreva as informações em texto corrido e natural, como se estivesse explicando numa conversa. NUNCA copie o texto do resultado diretamente — sempre reformule em linguagem simples sem markdown.',
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
  log.info('⚡ Executando tool', { tool: name, args });

  let result;
  try {
    switch (name) {
      case 'chamar_api_studio': {
        // Correção automática: modelo às vezes manda inicio/fim em params em vez de corpo
        const fixedArgs = { ...args };
        if (fixedArgs.params) {
          const camposCorporo = ['inicio', 'fim', 'data_inicio', 'novo_inicio', 'tipo_aula',
            'aluno_id', 'professor_id', 'agendamento_id', 'agendamento_antigo_id', 'motivo'];
          fixedArgs.corpo = fixedArgs.corpo || {};
          for (const campo of camposCorporo) {
            if (fixedArgs.params[campo] !== undefined) {
              fixedArgs.corpo[campo] = fixedArgs.params[campo];
              delete fixedArgs.params[campo];
              log.warn(`⚠️  Campo "${campo}" movido de params para corpo`, { acao: fixedArgs.acao });
            }
          }
        }
        result = await chamarApiStudio(fixedArgs);
        break;
      }

      case 'notificar_humano':
        log.warn('🔔 NOTIFICAR HUMANO solicitado', args);
        result = await notificarHumano(args, context.wpp || {});
        break;

      case 'buscar_info': {
        log.info('🔍 BUSCAR INFO (RAG)', { query: args.query });
        const conteudo = await buscarInfo(args.query);
        if (conteudo) {
          result = {
            instrucao: `Reformule estas informações em texto corrido e natural, sem markdown, sem bullets, sem títulos. Escreva como numa conversa de WhatsApp. OBRIGATÓRIO: quebre em partes curtas usando ${SEP} — cada plano ou informação em uma parte separada.`,
            conteudo,
          };
        } else {
          result = { resultado: 'Nenhuma informação encontrada para esta consulta.' };
        }
        break;
      }

      case 'enviar_midia':
        log.info('📸 ENVIAR MÍDIA', args);
        result = await enviarMidia(args, context.wpp || {});
        break;

      default:
        log.warn('Tool desconhecida', { tool: name });
        result = { erro: `Tool desconhecida: ${name}` };
    }
  } catch (err) {
    log.error('Erro na execução da tool', { tool: name, error: err.message });
    result = { erro: err.message };
  }

  log.info('✔️  Tool concluída', { tool: name, elapsed_ms: Date.now() - start, sucesso: !result?.erro });
  return result;
}

// ─── Loop do agente ──────────────────────────────────────────────────────────

/**
 * Executa o agente de IA com memória e tools
 */
async function runAgent(sessionId, userMessage, systemPrompt, context = {}) {
  const MAX_ITERATIONS = 6;
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

    log.debug(`🔄 Iteração ${iterations}/${MAX_ITERATIONS}`, {
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

    log.debug(`📡 OpenAI respondeu — iteração ${iterations}`, {
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

      log.info('🏁 Agente concluído', {
        sessionId,
        iteracoes: iterations,
        elapsed_ms: Date.now() - agentStart,
        tokens_total: response.usage?.total_tokens,
        preview: finalText?.slice(0, 80),
      });

      return finalText;
    }

    // Executa tools em paralelo
    log.info('🔧 Executando tools', { sessionId, tools: toolCalls.map((t) => t.function.name) });

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
  log.warn('🚨 Limite de iterações atingido', { sessionId, MAX_ITERATIONS });
  const fallback = 'Desculpe, não consegui processar sua solicitação. Por favor, tente novamente.';
  await saveMessage(sessionId, 'assistant', fallback);
  return fallback;
}

module.exports = { runAgent };
