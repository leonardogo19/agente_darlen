const { enviarMidia } = require('../../evolution/sender');

// ─── Definição da tool de mídia ──────────────────────────────────────────────

const mediaToolDefinition = {
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
};

// ─── Execução da tool de mídia ───────────────────────────────────────────────

async function executeMediaTool(args, context) {
  return enviarMidia(args, context.wpp || {});
}

module.exports = { mediaToolDefinition, executeMediaTool };
