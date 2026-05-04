const { chamarApiStudio } = require('../../studio/studioApi');

// ─── Tools exclusivas para PROFESSORES ───────────────────────────────────────

const professorToolDefinitions = [
    {
        type: 'function',
        function: {
            name: 'agenda_dia',
            description: 'Retorna a agenda do professor para o dia. Se não informar data, usa hoje.',
            parameters: {
                type: 'object',
                required: ['professor_id'],
                properties: {
                    professor_id: { type: 'string', description: 'UUID do professor' },
                    data: { type: 'string', description: 'Data em ISO 8601. Omitir = hoje.' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'agenda_semana',
            description: 'Retorna a agenda do professor para a semana inteira (segunda a domingo).',
            parameters: {
                type: 'object',
                required: ['professor_id'],
                properties: {
                    professor_id: { type: 'string', description: 'UUID do professor' },
                    data: { type: 'string', description: 'Qualquer data da semana em ISO 8601. Omitir = semana atual.' },
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
                required: ['professor_id'],
                properties: {
                    professor_id: { type: 'string', description: 'UUID do professor' },
                    aluno_id:     { type: 'string', description: 'UUID do aluno (se já conhecido)' },
                    q:            { type: 'string', description: 'Nome ou telefone do aluno para busca' },
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
                required: ['professor_id', 'aluno_id', 'data_inicio'],
                properties: {
                    professor_id: { type: 'string', description: 'UUID do professor' },
                    aluno_id:     { type: 'string', description: 'UUID do aluno' },
                    data_inicio:  { type: 'string', description: 'Data e hora em ISO 8601 com -03:00' },
                    tipo_aula:    { type: 'string', enum: ['aula', 'experimental'], description: 'Tipo da aula. Padrão: aula' },
                    observacoes:  { type: 'string' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'cancelar_aula',
            description: 'Cancela uma aula da agenda do professor. Execute direto sem pedir confirmação.',
            parameters: {
                type: 'object',
                required: ['professor_id', 'agendamento_id'],
                properties: {
                    professor_id:   { type: 'string', description: 'UUID do professor' },
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
            description: 'Bloqueia um período na agenda do professor (folga, compromisso). Execute direto sem pedir confirmação.',
            parameters: {
                type: 'object',
                required: ['professor_id', 'data_inicio', 'data_fim'],
                properties: {
                    professor_id: { type: 'string', description: 'UUID do professor' },
                    data_inicio:  { type: 'string', description: 'Início do bloqueio em ISO 8601 com -03:00' },
                    data_fim:     { type: 'string', description: 'Fim do bloqueio em ISO 8601 com -03:00' },
                    motivo:       { type: 'string', description: 'Motivo (opcional)' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'desbloquear_horario',
            description: 'Remove um bloqueio da agenda do professor. Execute direto sem pedir confirmação.',
            parameters: {
                type: 'object',
                required: ['professor_id', 'bloqueio_id'],
                properties: {
                    professor_id: { type: 'string', description: 'UUID do professor' },
                    bloqueio_id:  { type: 'string', description: 'ID do bloqueio a remover' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'verificar_disponibilidade',
            description: 'Verifica horários disponíveis em uma janela de tempo.',
            parameters: {
                type: 'object',
                required: ['inicio', 'fim'],
                properties: {
                    inicio:       { type: 'string', description: 'Início da janela em ISO 8601 com -03:00' },
                    fim:          { type: 'string', description: 'Fim da janela em ISO 8601 com -03:00' },
                    aluno_id:     { type: 'string', description: 'UUID do aluno (opcional)' },
                    professor_id: { type: 'string', description: 'UUID do professor (opcional)' },
                },
            },
        },
    },
];

async function executeProfessorTool(name, args) {
    switch (name) {
        case 'agenda_dia':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'agenda_dia', professor_id: args.professor_id, data: args.data } });
        case 'agenda_semana':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'agenda_semana', professor_id: args.professor_id, data: args.data } });
        case 'ver_aluno':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'buscar_aluno', professor_id: args.professor_id, aluno_id: args.aluno_id, q: args.q } });
        case 'agendar_para_aluno':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'agendar_para_aluno', professor_id: args.professor_id, aluno_id: args.aluno_id, data_inicio: args.data_inicio, tipo_aula: args.tipo_aula || 'aula', observacoes: args.observacoes } });
        case 'cancelar_aula':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'cancelar_aula', professor_id: args.professor_id, agendamento_id: args.agendamento_id, motivo: args.motivo || 'Cancelado pelo professor' } });
        case 'bloquear_horario':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'bloquear_horario', professor_id: args.professor_id, data_inicio: args.data_inicio, data_fim: args.data_fim, motivo: args.motivo } });
        case 'desbloquear_horario':
            return chamarApiStudio({ acao: 'professor', metodo: 'POST', corpo: { acao: 'desbloquear_horario', professor_id: args.professor_id, bloqueio_id: args.bloqueio_id } });
        case 'verificar_disponibilidade':
            return chamarApiStudio({ acao: 'verificar-disponibilidade', corpo: args });
        default:
            return null;
    }
}

const professorToolNames = professorToolDefinitions.map((t) => t.function.name);

module.exports = { professorToolDefinitions, executeProfessorTool, professorToolNames };
