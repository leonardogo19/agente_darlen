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
        problema: { type: 'string', description: 'pedido de atendimento humano | erro de agendamento | renovação de plano | dúvida de cobrança' },
        resumo:   { type: 'string', description: 'Contexto breve para o atendente' },
      },
    },
  },
};

// ─── Execução da tool de notificação humana ──────────────────────────────────

async function executeHumanTool(args, context) {
  // O telefone NUNCA deve ser escolhido pelo agente. 
  // Usamos sempre o telefone de quem está enviando a mensagem no WhatsApp.
  const payload = {
    ...args,
    telefone: context.telefoneCliente, 
  };
  return notificarHumano(payload, context.wpp || {});
}

module.exports = { humanToolDefinition, executeHumanTool };
