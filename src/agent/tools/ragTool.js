const { buscarInfo } = require('../../shared/rag');

const SEP = '|||';

// ─── Definição da tool RAG ───────────────────────────────────────────────────

const ragToolDefinition = {
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
};

// ─── Execução da tool RAG ────────────────────────────────────────────────────

async function executeRagTool(args) {
  const conteudo = await buscarInfo(args.query);
  return conteudo
    ? { instrucao: `Reformule em texto corrido natural, sem markdown. Use ${SEP} para separar cada informação.`, conteudo }
    : { resultado: 'Nenhuma informação encontrada.' };
}

module.exports = { ragToolDefinition, executeRagTool };
