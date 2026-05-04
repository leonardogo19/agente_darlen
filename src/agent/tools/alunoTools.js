const { chamarApiStudio } = require('../../studio/studioApi');

// ─── Tools exclusivas para ALUNOS ────────────────────────────────────────────

const alunoToolDefinitions = [
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
    {
        type: 'function',
        function: {
            name: 'verificar_disponibilidade',
            description: 'Verifica horários disponíveis para agendamento. Sempre chame antes de confirmar qualquer aula.',
            parameters: {
                type: 'object',
                required: ['inicio', 'fim', 'aluno_id'],
                properties: {
                    inicio:       { type: 'string', description: 'Início da janela em ISO 8601 com -03:00. Ex: 2026-04-28T10:00:00-03:00' },
                    fim:          { type: 'string', description: 'Fim da janela em ISO 8601 com -03:00. Ex: 2026-04-28T11:00:00-03:00' },
                    aluno_id:     { type: 'string', description: 'UUID do aluno' },
                    professor_id: { type: 'string', description: 'UUID do professor (opcional — filtra por professor específico)' },
                },
            },
        },
    },
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
                    tipo_aula:    { type: 'string', enum: ['aula', 'experimental'], description: '"aula" para aulas normais, "experimental" para primeira aula gratuita' },
                    observacoes:  { type: 'string' },
                },
            },
        },
    },
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
    {
        type: 'function',
        function: {
            name: 'buscar_info',
            description: 'Busca informações sobre o estúdio (preços, horários, localização, modalidades, etc.) na base de conhecimento.',
            parameters: {
                type: 'object',
                required: ['query'],
                properties: {
                    query: { type: 'string', description: 'O que deseja buscar' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'notificar_humano',
            description: 'Notifica um atendente humano quando o agente não consegue resolver.',
            parameters: {
                type: 'object',
                required: ['problema'],
                properties: {
                    problema: { type: 'string', description: 'Descrição do problema' },
                    telefone: { type: 'string' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'enviar_midia',
            description: 'Envia uma imagem ou arquivo para o aluno.',
            parameters: {
                type: 'object',
                required: ['url'],
                properties: {
                    url:      { type: 'string' },
                    caption:  { type: 'string' },
                    telefone: { type: 'string' },
                },
            },
        },
    },
];

async function executeAlunoTool(name, args, context) {
    switch (name) {
        case 'buscar_aluno':
            return chamarApiStudio({ acao: 'alunos', metodo: 'GET', params: { q: args.q } });
        case 'cadastrar_aluno':
            return chamarApiStudio({ acao: 'alunos', metodo: 'POST', corpo: args });
        case 'verificar_disponibilidade':
            return chamarApiStudio({ acao: 'verificar-disponibilidade', corpo: args });
        case 'agendar_aula':
            return chamarApiStudio({ acao: 'agendar', corpo: args });
        case 'remarcar_aula':
            return chamarApiStudio({ acao: 'remarcar', corpo: args });
        case 'cancelar_aula':
            return chamarApiStudio({
                acao: 'cancelar',
                corpo: { agendamento_id: args.agendamento_id, motivo: args.motivo || 'Cancelamento solicitado pelo aluno' },
            });
        case 'listar_professores':
            return chamarApiStudio({ acao: 'professores', metodo: 'GET' });
        case 'listar_pacotes':
            return chamarApiStudio({ acao: 'listar-pacotes', metodo: 'GET' });
        default:
            return null;
    }
}

const alunoToolNames = alunoToolDefinitions.map((t) => t.function.name);

module.exports = { alunoToolDefinitions, executeAlunoTool, alunoToolNames };
