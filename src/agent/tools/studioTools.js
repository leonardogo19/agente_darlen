const { chamarApiStudio } = require('../../studio/studioApi');

// ─── Definições das tools de estúdio ────────────────────────────────────────
const studioToolDefinitions = [
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
                    tipo_aula:    { type: 'string', enum: ['aula', 'experimental'], description: '"aula" para aulas normais (individual ou grupo — definido pelo pacote do aluno), "experimental" para primeira aula gratuita' },
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
    // ─── Tools exclusivas para professores ──────────────────────────────────
    {
        type: 'function',
        function: {
            name: 'identificar_professor',
            description: 'Verifica se o telefone pertence a um professor cadastrado. Chame SEMPRE no início quando o contexto indicar que pode ser professor.',
            parameters: {
                type: 'object',
                required: ['telefone'],
                properties: {
                    telefone: { type: 'string', description: 'Telefone do contato' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'agenda_dia_professor',
            description: 'Retorna a agenda do professor para o dia especificado.',
            parameters: {
                type: 'object',
                required: ['professor_id'],
                properties: {
                    professor_id: { type: 'string', description: 'UUID do professor' },
                    data: { type: 'string', description: 'Data em ISO 8601. Se omitido, usa hoje.' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'agenda_semana_professor',
            description: 'Retorna a agenda do professor para a semana inteira.',
            parameters: {
                type: 'object',
                required: ['professor_id'],
                properties: {
                    professor_id: { type: 'string', description: 'UUID do professor' },
                    data: { type: 'string', description: 'Qualquer data da semana em ISO 8601. Se omitido, usa a semana atual.' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'buscar_aluno_professor',
            description: 'Busca informações de um aluno específico para o professor ver (próximas aulas, histórico, saldo).',
            parameters: {
                type: 'object',
                required: ['professor_id'],
                properties: {
                    professor_id: { type: 'string', description: 'UUID do professor' },
                    aluno_id: { type: 'string', description: 'UUID do aluno (se já conhecido)' },
                    q: { type: 'string', description: 'Nome ou telefone do aluno para busca' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'bloquear_horario_professor',
            description: 'Bloqueia um horário na agenda do professor (ex: folga, compromisso pessoal). Impede novos agendamentos nesse período.',
            parameters: {
                type: 'object',
                required: ['professor_id', 'data_inicio', 'data_fim'],
                properties: {
                    professor_id: { type: 'string', description: 'UUID do professor' },
                    data_inicio: { type: 'string', description: 'Início do bloqueio em ISO 8601 com -03:00' },
                    data_fim: { type: 'string', description: 'Fim do bloqueio em ISO 8601 com -03:00' },
                    motivo: { type: 'string', description: 'Motivo do bloqueio (opcional)' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'desbloquear_horario_professor',
            description: 'Remove um bloqueio de horário da agenda do professor.',
            parameters: {
                type: 'object',
                required: ['professor_id', 'bloqueio_id'],
                properties: {
                    professor_id: { type: 'string', description: 'UUID do professor' },
                    bloqueio_id: { type: 'string', description: 'ID do bloqueio a remover' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'agendar_aula_professor',
            description: 'Professor agenda uma aula para um aluno.',
            parameters: {
                type: 'object',
                required: ['professor_id', 'aluno_id', 'data_inicio'],
                properties: {
                    professor_id: { type: 'string', description: 'UUID do professor' },
                    aluno_id: { type: 'string', description: 'UUID do aluno' },
                    data_inicio: { type: 'string', description: 'Data e hora em ISO 8601 com -03:00' },
                    tipo_aula: { type: 'string', enum: ['aula', 'experimental'], description: 'Tipo da aula' },
                    observacoes: { type: 'string' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'cancelar_aula_professor',
            description: 'Professor cancela uma aula da sua agenda.',
            parameters: {
                type: 'object',
                required: ['professor_id', 'agendamento_id'],
                properties: {
                    professor_id: { type: 'string', description: 'UUID do professor' },
                    agendamento_id: { type: 'string', description: 'ID do agendamento a cancelar' },
                    motivo: { type: 'string', description: 'Motivo do cancelamento' },
                },
            },
        },
    },
];

// ─── Execução das tools de estúdio ──────────────────────────────────────────
async function executeStudioTool(name, args) {
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
        // ─── Tools de professor ──────────────────────────────────────────────
        case 'identificar_professor':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'identificar', telefone: args.telefone } });
        case 'agenda_dia_professor':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'agenda_dia', professor_id: args.professor_id, data: args.data } });
        case 'agenda_semana_professor':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'agenda_semana', professor_id: args.professor_id, data: args.data } });
        case 'buscar_aluno_professor':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'buscar_aluno', professor_id: args.professor_id, aluno_id: args.aluno_id, q: args.q } });
        case 'bloquear_horario_professor':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'bloquear_horario', professor_id: args.professor_id, data_inicio: args.data_inicio, data_fim: args.data_fim, motivo: args.motivo } });
        case 'desbloquear_horario_professor':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'desbloquear_horario', professor_id: args.professor_id, bloqueio_id: args.bloqueio_id } });
        case 'agendar_aula_professor':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'agendar_para_aluno', professor_id: args.professor_id, aluno_id: args.aluno_id, data_inicio: args.data_inicio, tipo_aula: args.tipo_aula || 'aula', observacoes: args.observacoes } });
        case 'cancelar_aula_professor':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'cancelar_aula', professor_id: args.professor_id, agendamento_id: args.agendamento_id, motivo: args.motivo } });
        default:
            return null; // não é uma tool de estúdio
    }
}

const studioToolNames = studioToolDefinitions.map((t) => t.function.name);

module.exports = { studioToolDefinitions, executeStudioTool, studioToolNames };
