const { notificarHumano } = require('../../evolution/sender');

// ─── Definição da tool de notificação humana ────────────────────────────────

const humanToolDefinition = {
  type: 'function',
  function: {
    name: 'notificar_humano',
    description: 'Notifica um atendente humano. Use APENAS quando: aluno pede explicitamente humano, erro técnico de agendamento, dúvida de cobrança ou renovação de plano. NUNCA use porque não encontrou informações gerais (fotos, horários, modalidades) — nesses casos, apenas forneça o contato de Bruna ou Darlen.',
    parameters: {
      type: 'object',
      required: ['problema', 'resumo'],
      properties: {
        aluno_id: { type: 'string' },
        nome:     { type: 'string' },
        telefone: { type: 'string', description: 'Opcional, o sistema pegará automaticamente' },
        problema: { type: 'string', description: 'pedido de atendimento humano | erro de agendamento | renovação de plano | dúvida de cobrança' },
        resumo:   { type: 'string', description: 'Contexto breve para o atendente' },
      },
    },
  },
};

// ─── Execução da tool de notificação humana ──────────────────────────────────

async function executeHumanTool(args, context) {
  // Garantir que o telefone venha do contexto se não for informado pela tool
  const payload = {
    ...args,
    telefone: args.telefone || context.telefoneCliente,
  };
  return notificarHumano(payload, context.wpp || {});
}

module.exports = { humanToolDefinition, executeHumanTool };
