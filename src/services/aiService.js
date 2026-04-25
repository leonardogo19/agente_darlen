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

// ─── Tools individuais por ação ──────────────────────────────────────────────

const tools = [

  // ── Alunos ────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'buscar_aluno',
      description: 'Busca um aluno pelo telefone, email ou CPF. Use sempre no início da conversa para identificar o aluno.',
      parameters: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', description: 'Telefone, email ou CPF do aluno' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cadastrar_aluno',
      description: 'Cadastra um novo aluno no sistema.',
      parameters: {
        type: 'object',
        required: ['nome', 'telefone'],
        properties: {
          nome:     { type: 'string' },
          telefone: { type: 'string' },
          email:    { type: 'string' },
          cpf:      { type: 'string' },
        },
      },
    },
  },

  // ── Disponibilidade ───────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'verificar_disponibilidade',
      description: 'Verifica horários disponíveis para agendamento. Sempre chame antes de confirmar qualquer aula.',
      parameters: {
        type: 'object',
        required: ['inicio', 'fim', 'tipo_aula', 'aluno_id'],
        properties: {
          inicio:       { type: 'string', description: 'Início da janela em ISO 8601 com -03:00. Ex: 2026-04-28T10:00:00-03:00' },
          fim:          { type: 'string', description: 'Fim da janela em ISO 8601 com -03:00. Ex: 2026-04-28T11:00:00-03:00' },
          tipo_aula:    { type: 'string', enum: ['individual', 'vip', 'grupo', 'experimental'] },
          aluno_id:     { type: 'string', description: 'UUID do aluno' },
          professor_id: { type: 'string', description: 'UUID do professor (opcional — filtra por professor específico)' },
        },
      },
    },
  },

  // ── Agendamento ───────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'agendar_aula',
      description: 'Cria um agendamento e debita o saldo do aluno. Só chame após confirmação explícita do aluno.',
      parameters: {
        type: 'object',
        required: ['aluno_id', 'professor_id', 'data_inicio', 'tipo_aula'],
        properties: {
          aluno_id:     { type: 'string' },
          professor_id: { type: 'string' },
          data_inicio:  { type: 'string', description: 'Data e hora em ISO 8601 com -03:00. Ex: 2026-04-28T10:00:00-03:00' },
          tipo_aula:    { type: 'string', enum: ['individual', 'vip', 'grupo', 'experimental'] },
          observacoes:  { type: 'string' },
        },
      },
    },
  },

  // ── Remarcação ────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'remarcar_aula',
      description: 'Remarca uma aula existente sem debitar saldo. Use SEMPRE para trocar horário — nunca cancelar + agendar.',
      parameters: {
        type: 'object',
        required: ['agendamento_antigo_id', 'novo_inicio', 'professor_id'],
        properties: {
          agendamento_antigo_id: { type: 'string', description: 'ID do agendamento a ser remarcado' },
          novo_inicio:           { type: 'string', description: 'Novo horário em ISO 8601 com -03:00' },
          professor_id:          { type: 'string', description: 'UUID do professor (mesmo professor original)' },
        },
      },
    },
  },

  // ── Cancelamento ──────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'cancelar_aula',
      description: 'Cancela uma aula agendada. Devolve crédito se cancelado com mais de 2 horas de antecedência.',
      parameters: {
        type: 'object',
        required: ['agendamento_id'],
        properties: {
          agendamento_id: { type: 'string' },
          motivo:         { type: 'string', description: 'Motivo do cancelamento' },
        },
      },
    },
  },

  // ── Professores ───────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'listar_professores',
      description: 'Lista os professores disponíveis no estúdio.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },

  // ── Pacotes ───────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'listar_pacotes',
      description: 'Lista os pacotes de aulas disponíveis para compra.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },

  // ── RAG / Info ────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'buscar_info',
      description: 'Busca informações no banco de conhecimento (preços, planos, horários de funcionamento, localização, convênios, benefícios do pilates, estrutura). Use proativamente quando o aluno perguntar sobre qualquer um desses temas. Após receber o resultado, reescreva em linguagem natural simples sem markdown.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Termos-chave da busca. Ex: "preços planos mensalidade", "horário funcionamento", "benefícios pilates"' },
        },
      },
    },
  },

  // ── Notificação humano ────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'notificar_humano',
      description: 'Notifica um atendente humano. Use quando: aluno pede humano, dúvida sobre cobrança/saldo, erro persistente de API, aluno quer renovar ou comprar créditos.',
      parameters: {
        type: 'object',
        required: ['problema', 'resumo'],
        properties: {
          aluno_id: { type: 'string' },
          nome:     { type: 'string' },
          telefone: { type: 'string' },
          problema: { type: 'string', description: 'saldo incorreto | cobrança | reclamação | pedido de atendimento humano | erro de agendamento | renovação de plano' },
          resumo:   { type: 'string', description: '2 a 4 frases resumindo a situação' },
        },
      },
    },
  },

  // ── Mídia ─────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'enviar_midia',
      description: 'Envia fotos do estúdio ao aluno. Use somente quando o aluno pedir explicitamente.',
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

      case 'buscar_aluno':
        result = await chamarApiStudio({ acao: 'alunos', metodo: 'GET', params: { q: args.q } });
        break;

      case 'cadastrar_aluno':
        result = await chamarApiStudio({ acao: 'alunos', metodo: 'POST', corpo: args });
        break;

      case 'verificar_disponibilidade':
        result = await chamarApiStudio({ acao: 'verificar-disponibilidade', corpo: args });
        break;

      case 'agendar_aula':
        result = await chamarApiStudio({ acao: 'agendar', corpo: args });
        break;

      case 'remarcar_aula':
        result = await chamarApiStudio({ acao: 'remarcar', corpo: args });
        break;

      case 'cancelar_aula':
        result = await chamarApiStudio({
          acao: 'cancelar',
          corpo: { agendamento_id: args.agendamento_id, motivo: args.motivo || 'Cancelamento solicitado pelo aluno' },
        });
        break;

      case 'listar_professores':
        result = await chamarApiStudio({ acao: 'professores', metodo: 'GET' });
        break;

      case 'listar_pacotes':
        result = await chamarApiStudio({ acao: 'listar-pacotes', metodo: 'GET' });
        break;

      case 'buscar_info': {
        log.info('🔍 BUSCAR INFO (RAG)', { query: args.query });
        const conteudo = await buscarInfo(args.query);
        result = conteudo
          ? { instrucao: `Reformule em texto corrido natural, sem markdown. Use ${SEP} para separar cada informação.`, conteudo }
          : { resultado: 'Nenhuma informação encontrada.' };
        break;
      }

      case 'notificar_humano':
        log.warn('🔔 NOTIFICAR HUMANO', args);
        result = await notificarHumano(args, context.wpp || {});
        break;

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
