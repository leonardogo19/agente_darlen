const { chamarApiStudio } = require('../../studio/studioApi');

// ─── Conversão de datas UTC → BRT (UTC-3) ────────────────────────────────────

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/**
 * Converte uma string ISO UTC para BRT (UTC-3) e retorna um objeto com:
 * - iso: string ISO com offset -03:00  (para o modelo usar em tool calls)
 * - exibicao: string legível "quarta (20/05) às 18h00"  (para o modelo exibir ao aluno)
 */
function utcParaBrt(isoString) {
    if (!isoString) return isoString;
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;

    // Subtrai 3 horas em milissegundos
    const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);

    const dia     = String(brt.getUTCDate()).padStart(2, '0');
    const mes     = String(brt.getUTCMonth() + 1).padStart(2, '0');
    const ano     = brt.getUTCFullYear();
    const hora    = String(brt.getUTCHours()).padStart(2, '0');
    const minuto  = String(brt.getUTCMinutes()).padStart(2, '0');
    const diaSem  = DIAS_SEMANA[brt.getUTCDay()];

    return {
        iso:      `${ano}-${mes}-${dia}T${hora}:${minuto}:00-03:00`,
        exibicao: `${diaSem} (${dia}/${mes}) às ${hora}h${minuto}`,
    };
}

/**
 * Normaliza o nome do professor removendo espaços extras e sufixos como "portal".
 * Ex: "Darlen  portal" → "Darlen"
 */
function normalizarNomeProfessor(nome) {
    if (!nome) return nome;
    // Remove espaços duplos, trim, e descarta palavras em minúsculo no final (ex: "portal", "fitness")
    return nome
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/(\s+[a-z][a-zà-ú]*)+$/, '')
        .trim();
}

/**
 * Recebe a resposta bruta de buscar_aluno e converte todas as datas
 * de proximas_aulas e historico_aulas para BRT antes de entregar ao modelo.
 */
function converterDatasAluno(data) {
    if (!data?.sucesso || !Array.isArray(data.alunos)) return data;

    data.alunos = data.alunos.map((aluno) => {
        if (Array.isArray(aluno.proximas_aulas)) {
            aluno.proximas_aulas = aluno.proximas_aulas.map((aula) => {
                const brt = utcParaBrt(aula.data);
                return { ...aula, data: brt.iso, data_exibicao: brt.exibicao, professor: normalizarNomeProfessor(aula.professor) };
            });
        }
        if (Array.isArray(aluno.historico_aulas)) {
            aluno.historico_aulas = aluno.historico_aulas.map((aula) => {
                const brt = utcParaBrt(aula.data);
                return { ...aula, data: brt.iso, data_exibicao: brt.exibicao, professor: normalizarNomeProfessor(aula.professor) };
            });
        }
        return aluno;
    });

    return data;
}

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
                required: ['aluno_id', 'data_antiga', 'novo_inicio'],
                properties: {
                    aluno_id:              { type: 'string', description: 'UUID do aluno (de buscar_aluno)' },
                    data_antiga:           { type: 'string', description: 'Data/hora da aula a remarcar em ISO 8601 com -03:00. Use o campo `data` de proximas_aulas. Ex: 2026-05-22T10:00:00-03:00' },
                    novo_inicio:           { type: 'string', description: 'Novo horário em ISO 8601 com -03:00. Ex: 2026-05-26T10:00:00-03:00' },
                    agendamento_antigo_id: { type: 'string', description: 'ID do agendamento (opcional — use o campo `id` de proximas_aulas se disponível)' },
                    professor_id:          { type: 'string', description: 'UUID do professor (opcional — será o mesmo da aula original se omitido)' },
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
        case 'buscar_aluno': {
            const resultado = await chamarApiStudio({ acao: 'alunos', metodo: 'GET', params: { q: args.q } });
            return converterDatasAluno(resultado);
        }
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
