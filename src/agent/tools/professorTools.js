const { chamarApiStudio } = require('../../studio/studioApi');

// ─── Tools para PROFESSORES ───────────────────────────────────────────────────
// Nota: professor_id NÃO é parâmetro — a rota resolve pelo telefone automaticamente.
// O agente só precisa passar a data/dados da ação.

const professorToolDefinitions = [
    {
        type: 'function',
        function: {
            name: 'agenda_dia',
            description: 'Retorna sua agenda para um dia específico. Sem data = hoje.',
            parameters: {
                type: 'object',
                properties: {
                    data: { type: 'string', description: 'Data em ISO 8601 com -03:00. Ex: 2026-05-18T00:00:00-03:00. Omitir = hoje.' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'agenda_semana',
            description: 'Retorna sua agenda para a semana inteira (segunda a domingo).',
            parameters: {
                type: 'object',
                properties: {
                    data: { type: 'string', description: 'Qualquer data da semana em ISO 8601 com -03:00. Omitir = semana atual.' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'ver_aluno',
            description: 'Busca informações de um aluno: próximas aulas, histórico, saldo e pacote.',
            parameters: {
                type: 'object',
                properties: {
                    aluno_id: { type: 'string', description: 'UUID do aluno (se já conhecido)' },
                    q:        { type: 'string', description: 'Nome ou telefone do aluno para busca' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'agendar_para_aluno',
            description: 'Agenda uma aula para um aluno. Execute direto sem pedir confirmação.',
            parameters: {
                type: 'object',
                required: ['aluno_id', 'data_inicio'],
                properties: {
                    aluno_id:    { type: 'string', description: 'UUID do aluno' },
                    data_inicio: { type: 'string', description: 'Data e hora em ISO 8601 com -03:00' },
                    tipo_aula:   { type: 'string', enum: ['aula', 'experimental'], description: 'Tipo da aula. Padrão: aula' },
                    observacoes: { type: 'string' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'cancelar_aula',
            description: 'Cancela uma aula da sua agenda. Execute direto sem pedir confirmação.',
            parameters: {
                type: 'object',
                required: ['agendamento_id'],
                properties: {
                    agendamento_id: { type: 'string', description: 'ID do agendamento a cancelar' },
                    motivo:         { type: 'string', description: 'Motivo do cancelamento' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'bloquear_horario',
            description: 'Bloqueia um período na sua agenda (folga, compromisso). Execute direto sem pedir confirmação.',
            parameters: {
                type: 'object',
                required: ['data_inicio', 'data_fim'],
                properties: {
                    data_inicio: { type: 'string', description: 'Início do bloqueio em ISO 8601 com -03:00' },
                    data_fim:    { type: 'string', description: 'Fim do bloqueio em ISO 8601 com -03:00' },
                    motivo:      { type: 'string', description: 'Motivo (opcional)' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'desbloquear_horario',
            description: 'Remove um bloqueio da sua agenda. Execute direto sem pedir confirmação.',
            parameters: {
                type: 'object',
                required: ['bloqueio_id'],
                properties: {
                    bloqueio_id: { type: 'string', description: 'ID do bloqueio a remover' },
                },
            },
        },
    },
];

// telefoneCliente é injetado pelo agent.js via context
async function executeProfessorTool(name, args, context) {
    const telefone   = context?.telefoneCliente || '';
    const professorId = context?.professor?.id  || '';

    switch (name) {
        case 'agenda_dia':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'agenda_dia', telefone, professor_id: professorId, data: args.data } });
        case 'agenda_semana':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'agenda_semana', telefone, professor_id: professorId, data: args.data } });
        case 'ver_aluno':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'buscar_aluno', telefone, professor_id: professorId, aluno_id: args.aluno_id, q: args.q } });
        case 'agendar_para_aluno':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'agendar_para_aluno', telefone, professor_id: professorId, aluno_id: args.aluno_id, data_inicio: args.data_inicio, tipo_aula: args.tipo_aula || 'aula', observacoes: args.observacoes } });
        case 'cancelar_aula':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'cancelar_aula', telefone, professor_id: professorId, agendamento_id: args.agendamento_id, motivo: args.motivo || 'Cancelado pelo professor' } });
        case 'bloquear_horario':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'bloquear_horario', telefone, professor_id: professorId, data_inicio: args.data_inicio, data_fim: args.data_fim, motivo: args.motivo } });
        case 'desbloquear_horario':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'desbloquear_horario', telefone, professor_id: professorId, bloqueio_id: args.bloqueio_id } });
        default:
            return null;
    }
}

const professorToolNames = professorToolDefinitions.map((t) => t.function.name);

module.exports = { professorToolDefinitions, executeProfessorTool, professorToolNames };
