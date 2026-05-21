const { chamarApiStudio } = require('../../studio/studioApi');

// ─── Conversão de datas UTC → BRT (UTC-3) ────────────────────────────────────

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

function utcParaBrt(isoString) {
    if (!isoString) return isoString;
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;

    const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);

    const dia = String(brt.getUTCDate()).padStart(2, '0');
    const mes = String(brt.getUTCMonth() + 1).padStart(2, '0');
    const ano = brt.getUTCFullYear();
    const hora = String(brt.getUTCHours()).padStart(2, '0');
    const minuto = String(brt.getUTCMinutes()).padStart(2, '0');
    const diaSem = DIAS_SEMANA[brt.getUTCDay()];

    return {
        iso: `${ano}-${mes}-${dia}T${hora}:${minuto}:00-03:00`,
        exibicao: `${diaSem} (${dia}/${mes}) às ${hora}h${minuto}`,
    };
}

function normalizarNomeProfessor(nome) {
    if (!nome) return nome;
    return nome
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/(\s+[a-z][a-zà-ú]*)+$/, '')
        .trim();
}

function converterDatasAluno(data) {
    if (!data?.sucesso || !Array.isArray(data.alunos)) return data;

    data.alunos = data.alunos.map((aluno) => {
        if (Array.isArray(aluno.proximas_aulas)) {
            aluno.proximas_aulas = aluno.proximas_aulas.map((aula) => {
                const brt = utcParaBrt(aula.data);
                return {
                    ...aula,
                    data: brt.iso,
                    data_exibicao: brt.exibicao,
                    professor: normalizarNomeProfessor(aula.professor),
                };
            });
        }
        if (Array.isArray(aluno.historico_aulas)) {
            aluno.historico_aulas = aluno.historico_aulas.map((aula) => {
                const brt = utcParaBrt(aula.data);
                return {
                    ...aula,
                    data: brt.iso,
                    data_exibicao: brt.exibicao,
                    professor: normalizarNomeProfessor(aula.professor),
                };
            });
        }
        return aluno;
    });

    return data;
}

// ─── Guardrails de UUID ───────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUUID(value) {
    return value && UUID_REGEX.test(value);
}

/**
 * Resolve aluno_id: se não for UUID (ex: telefone), busca o aluno e retorna o UUID real.
 */
async function resolverAlunoId(aluno_id, telefoneCliente) {
    if (isUUID(aluno_id)) return aluno_id;

    // Tenta pelo valor passado (pode ser telefone ou email)
    const query = aluno_id || telefoneCliente;
    const res = await chamarApiStudio({ acao: 'alunos', metodo: 'GET', params: { q: query } });
    const aluno = res?.alunos?.[0];
    if (aluno?.id) return aluno.id;

    throw new Error(`Não foi possível resolver aluno_id a partir de: ${query}`);
}

/**
 * Resolve professor_id: se não for UUID (ex: nome "darlen"), busca na lista de professores.
 */
async function resolverProfessorId(professor_id) {
    if (isUUID(professor_id)) return professor_id;

    const res = await chamarApiStudio({ acao: 'professores', metodo: 'GET' });
    const professores = res?.professores || [];
    const match = professores.find((p) =>
        p.nome?.toLowerCase().includes(professor_id?.toLowerCase())
    );
    if (match?.id) return match.id;

    throw new Error(`Não foi possível resolver professor_id a partir de: ${professor_id}`);
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const alunoToolDefinitions = [
    {
        type: 'function',
        function: {
            name: 'buscar_aluno',
            description: 'Busca um aluno pelo telefone, email ou CPF. Chame APENAS na primeira mensagem da conversa para identificar o aluno, ou após uma ação (agendar/cancelar/remarcar) para recarregar os dados.',
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
                    nome: { type: 'string' },
                    telefone: { type: 'string' },
                    email: { type: 'string' },
                    cpf: { type: 'string' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'verificar_disponibilidade',
            description: 'Verifica horários disponíveis para agendamento. Sempre chame antes de oferecer ou confirmar qualquer horário. O campo "inicio" de cada slot retornado é o valor exato a usar como data_inicio em agendar_aula e como novo_inicio em remarcar_aula.',
            parameters: {
                type: 'object',
                required: ['inicio', 'aluno_id'],
                properties: {
                    inicio: {
                        type: 'string',
                        description: 'Data/hora de início da busca em ISO 8601 com offset -03:00. Ex: 2026-05-22T11:00:00-03:00',
                    },
                    fim: {
                        type: 'string',
                        description: 'Data/hora final da busca em ISO 8601 com -03:00. Se omitido, busca por 1 hora a partir do início.',
                    },
                    aluno_id: {
                        type: 'string',
                        description: 'UUID do aluno — campo "id" retornado por buscar_aluno. NUNCA use telefone aqui.',
                    },
                    professor_id: {
                        type: 'string',
                        description: 'UUID do professor — campo "professor_id" de proximas_aulas ou de um slot anterior. NUNCA use nome aqui.',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'agendar_aula',
            description: 'Cria um agendamento e debita o saldo do aluno. Só chame após confirmação explícita do aluno. Use EXCLUSIVAMENTE UUIDs — nunca telefone como aluno_id, nunca nome como professor_id.',
            parameters: {
                type: 'object',
                required: ['aluno_id', 'professor_id', 'data_inicio', 'tipo_aula'],
                properties: {
                    aluno_id: {
                        type: 'string',
                        description: 'UUID do aluno (campo "id" de buscar_aluno). Formato: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
                    },
                    professor_id: {
                        type: 'string',
                        description: 'UUID do professor (campo "professor_id" de verificar_disponibilidade ou proximas_aulas). Formato: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
                    },
                    data_inicio: {
                        type: 'string',
                        description: 'Campo "inicio" exato do slot retornado por verificar_disponibilidade, convertido para -03:00. Ex: 2026-05-22T11:00:00-03:00',
                    },
                    tipo_aula: {
                        type: 'string',
                        enum: ['aula', 'experimental'],
                        description: '"aula" para aulas normais, "experimental" para primeira aula gratuita',
                    },
                    observacoes: { type: 'string' },
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
                    aluno_id: {
                        type: 'string',
                        description: 'UUID do aluno (campo "id" de buscar_aluno).',
                    },
                    data_antiga: {
                        type: 'string',
                        description: 'Campo "data" da aula a remarcar em proximas_aulas (ISO -03:00).',
                    },
                    novo_inicio: {
                        type: 'string',
                        description: 'Campo "inicio" exato do slot retornado por verificar_disponibilidade (ISO -03:00).',
                    },
                    agendamento_antigo_id: {
                        type: 'string',
                        description: 'Campo "id" da aula em proximas_aulas (opcional, mas recomendado).',
                    },
                    professor_id: {
                        type: 'string',
                        description: 'UUID do professor (opcional — mantém o mesmo da aula original se omitido).',
                    },
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
                    agendamento_id: {
                        type: 'string',
                        description: 'Campo "id" da aula em proximas_aulas.',
                    },
                    data_aula: {
                        type: 'string',
                        description: 'Campo "data" da aula em proximas_aulas (ISO -03:00). Altamente recomendado.',
                    },
                    aluno_id: {
                        type: 'string',
                        description: 'UUID do aluno.',
                    },
                    motivo: { type: 'string' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'listar_professores',
            description: 'Lista os professores disponíveis no estúdio.',
            parameters: { type: 'object', properties: {} },
        },
    },
    {
        type: 'function',
        function: {
            name: 'listar_pacotes',
            description: 'Lista os pacotes de aulas disponíveis para compra.',
            parameters: { type: 'object', properties: {} },
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
            description: 'Notifica um atendente humano. Use APENAS quando: aluno pede humano, cobrança incorreta, ou erro técnico persistente.',
            parameters: {
                type: 'object',
                required: ['problema'],
                properties: {
                    problema: { type: 'string' },
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
                    url: { type: 'string' },
                    caption: { type: 'string' },
                    telefone: { type: 'string' },
                },
            },
        },
    },
];

// ─── Executor ─────────────────────────────────────────────────────────────────

async function executeAlunoTool(name, args, context = {}) {
    const comTelefone = (corpo) => ({
        ...corpo,
        _telefone_cliente: context.telefoneCliente || null,
    });

    switch (name) {
        case 'buscar_aluno': {
            const resultado = await chamarApiStudio({ acao: 'alunos', metodo: 'GET', params: { q: args.q } });
            return converterDatasAluno(resultado);
        }

        case 'cadastrar_aluno':
            return chamarApiStudio({ acao: 'alunos', metodo: 'POST', corpo: args });

        case 'verificar_disponibilidade':
            return chamarApiStudio({ acao: 'verificar-disponibilidade', corpo: comTelefone(args) });

        case 'agendar_aula': {
            // Guardrail: aluno_id deve ser UUID
            let aluno_id = args.aluno_id;
            let professor_id = args.professor_id;

            if (!isUUID(aluno_id)) {
                console.warn(`[agendar_aula] aluno_id inválido ("${aluno_id}") — resolvendo pelo telefone do contexto`);
                try {
                    aluno_id = await resolverAlunoId(aluno_id, context.telefoneCliente);
                } catch (e) {
                    return { sucesso: false, erro: 'ALUNO_ID_INVALIDO', mensagem: e.message };
                }
            }

            if (!isUUID(professor_id)) {
                console.warn(`[agendar_aula] professor_id inválido ("${professor_id}") — resolvendo pelo nome`);
                try {
                    professor_id = await resolverProfessorId(professor_id);
                } catch (e) {
                    return { sucesso: false, erro: 'PROFESSOR_ID_INVALIDO', mensagem: e.message };
                }
            }

            return chamarApiStudio({
                acao: 'agendar',
                corpo: comTelefone({ ...args, aluno_id, professor_id }),
            });
        }

        case 'remarcar_aula': {
            let aluno_id = args.aluno_id;
            let professor_id = args.professor_id;

            if (aluno_id && !isUUID(aluno_id)) {
                console.warn(`[remarcar_aula] aluno_id inválido ("${aluno_id}") — resolvendo`);
                try {
                    aluno_id = await resolverAlunoId(aluno_id, context.telefoneCliente);
                } catch (e) {
                    return { sucesso: false, erro: 'ALUNO_ID_INVALIDO', mensagem: e.message };
                }
            }

            if (professor_id && !isUUID(professor_id)) {
                console.warn(`[remarcar_aula] professor_id inválido ("${professor_id}") — resolvendo`);
                try {
                    professor_id = await resolverProfessorId(professor_id);
                } catch (e) {
                    return { sucesso: false, erro: 'PROFESSOR_ID_INVALIDO', mensagem: e.message };
                }
            }

            return chamarApiStudio({
                acao: 'remarcar',
                corpo: comTelefone({
                    ...args,
                    ...(aluno_id && { aluno_id }),
                    ...(professor_id && { professor_id }),
                }),
            });
        }

        case 'cancelar_aula': {
            let aluno_id = args.aluno_id;

            if (aluno_id && !isUUID(aluno_id)) {
                console.warn(`[cancelar_aula] aluno_id inválido ("${aluno_id}") — resolvendo`);
                try {
                    aluno_id = await resolverAlunoId(aluno_id, context.telefoneCliente);
                } catch (e) {
                    aluno_id = undefined; // deixa a API tentar pelo telefone via _telefone_cliente
                }
            }

            return chamarApiStudio({
                acao: 'cancelar',
                corpo: comTelefone({
                    agendamento_id: args.agendamento_id,
                    data_aula: args.data_aula,
                    motivo: args.motivo || 'Cancelamento solicitado pelo aluno',
                    ...(aluno_id && { aluno_id }),
                }),
            });
        }

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