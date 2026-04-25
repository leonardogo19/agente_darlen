const { notificarHumano } = require('../../evolution/sender');

// ─── Definição da tool de notificação humana ────────────────────────────────

const humanToolDefinition = {
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
};

// ─── Execução da tool de notificação humana ──────────────────────────────────

async function executeHumanTool(args, context) {
  return notificarHumano(args, context.wpp || {});
}

module.exports = { humanToolDefinition, executeHumanTool };
