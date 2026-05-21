const { chamarApiStudio } = require('../../studio/studioApi');

// ─── Logger estruturado ───────────────────────────────────────────────────────
const log = {
    warn:  (mod, msg, extra = {}) => console.warn( JSON.stringify({ ts: new Date().toISOString(), level: 'WARN',  emoji: 'WARN',  module: mod, message: msg, ...extra })),
    info:  (mod, msg, extra = {}) => console.log(  JSON.stringify({ ts: new Date().toISOString(), level: 'INFO',  emoji: 'INFO',  module: mod, message: msg, ...extra })),
    error: (mod, msg, extra = {}) => console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'ERROR', emoji: 'ERROR', module: mod, message: msg, ...extra })),
};

// ─── Conversão UTC → BRT ──────────────────────────────────────────────────────
const DIAS_SEMANA = ['domingo','segunda-feira','terca-feira','quarta-feira','quinta-feira','sexta-feira','sabado'];

function utcParaBrt(iso) {
    if (!iso) return { iso, exibicao: iso };
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { iso, exibicao: iso };
    const b = new Date(d.getTime() - 3 * 3600000);
    const dd = String(b.getUTCDate()).padStart(2,'0');
    const mm = String(b.getUTCMonth()+1).padStart(2,'0');
    const aa = b.getUTCFullYear();
    const hh = String(b.getUTCHours()).padStart(2,'0');
    const mi = String(b.getUTCMinutes()).padStart(2,'0');
    return {
        iso:      `${aa}-${mm}-${dd}T${hh}:${mi}:00-03:00`,
        exibicao: `${DIAS_SEMANA[b.getUTCDay()]} (${dd}/${mm}) as ${hh}h${mi}`,
    };
}

// Garante offset -03:00; converte se vier Z ou +00:00
function normalizarParaBrt(iso) {
    if (!iso) return iso;
    if (/[+-]\d{2}:\d{2}$/.test(iso) && !iso.endsWith('+00:00')) return iso;
    return utcParaBrt(iso).iso;
}

function normalizarNomeProfessor(nome) {
    if (!nome) return nome;
    return nome.replace(/\s+/g,' ').trim().replace(/(\s+[a-z][a-z]*)+$/,'').trim();
}

function converterDatasAluno(data) {
    if (!data?.sucesso || !Array.isArray(data.alunos)) return data;
    data.alunos = data.alunos.map(aluno => {
        ['proximas_aulas','historico_aulas'].forEach(campo => {
            if (Array.isArray(aluno[campo])) {
                aluno[campo] = aluno[campo].map(aula => {
                    const brt = utcParaBrt(aula.data);
                    return { ...aula, data: brt.iso, data_exibicao: brt.exibicao, professor: normalizarNomeProfessor(aula.professor) };
                });
            }
        });
        return aluno;
    });
    return data;
}

// ─── Guardrails de UUID ───────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUUID(v) { return typeof v === 'string' && UUID_RE.test(v); }

/**
 * UUID truncado com zeros: o modelo pega o prefixo correto e completa com 0s.
 * Ex: "fd5dbf0a-0000-0000-0000-000000000000"
 * Detecta se mais de metade dos hex chars (excluindo hífens) são zeros.
 */
function isUUIDTruncado(v) {
    if (!isUUID(v)) return false;
    const hex = v.replace(/-/g,'');
    const zeros = hex.split('').filter(c => c === '0').length;
    return zeros >= 16; // mais de 50% zeros = suspeito
}

function isUUIDValido(v) {
    return isUUID(v) && !isUUIDTruncado(v);
}

async function resolverAlunoId(valor, telefoneCliente, contextAlunoInfo) {
    if (valor && isUUIDValido(valor)) return valor;

    // Se temos a informação pré-carregada no contexto e o ID bate
    if (contextAlunoInfo?.id) {
        log.info('Guardrail', 'aluno_id resolvido via context.alunoInfo', { original: valor, resolvido: contextAlunoInfo.id });
        return contextAlunoInfo.id;
    }

    const motivo = !valor ? 'ausente' : (!isUUID(valor) ? 'formato invalido' : 'UUID truncado (zeros)');
    log.warn('Guardrail', `aluno_id rejeitado ou ausente (${motivo}) — resolvendo pelo telefone do contexto`, { valor, telefoneCliente });

    // Ignora o valor inválido (pode ser placeholder, nome, telefone ou UUID truncado)
    // e resolve sempre pelo telefone confiável do contexto
    if (!telefoneCliente) throw new Error('telefoneCliente ausente no contexto — impossivel resolver aluno_id');

    const res = await chamarApiStudio({ acao: 'alunos', metodo: 'GET', params: { q: telefoneCliente } });
    const aluno = res?.alunos?.[0];
    if (aluno?.id) {
        log.info('Guardrail', 'aluno_id resolvido via telefoneCliente', { original: valor, resolvido: aluno.id, telefoneCliente });
        return aluno.id;
    }
    throw new Error(`Aluno nao encontrado pelo telefone: ${telefoneCliente}`);
}

async function resolverProfessorId(valor, listaProfessores = []) {
    if (isUUIDValido(valor)) return valor;

    const motivo = !isUUID(valor) ? 'formato invalido' : 'UUID truncado (zeros)';
    log.warn('Guardrail', `professor_id rejeitado (${motivo}) — buscando na lista`, { valor });

    const professores = Array.isArray(listaProfessores) && listaProfessores.length > 0
        ? listaProfessores
        : (await chamarApiStudio({ acao: 'professores', metodo: 'GET' }))?.professores || [];

    if (!professores.length) throw new Error('Lista de professores vazia ou inacessivel');

    // 1. Se for UUID truncado, tenta pelo prefixo (primeiros 8 chars)
    if (isUUID(valor)) {
        const prefixo = valor.split('-')[0].toLowerCase();
        const match = professores.find(p => p.id && p.id.startsWith(prefixo));
        if (match?.id) {
            log.info('Guardrail', 'professor_id resolvido pelo prefixo UUID', { original: valor, resolvido: match.id });
            return match.id;
        }
    }

    // 2. Tenta por nome (funciona se o modelo passou o nome em vez do UUID)
    const normalizado = valor.toLowerCase().trim();
    const matchNome = professores.find(p => p.nome?.toLowerCase().includes(normalizado));
    if (matchNome?.id) {
        log.info('Guardrail', 'professor_id resolvido pelo nome', { original: valor, resolvido: matchNome.id });
        return matchNome.id;
    }

    // 3. Fallback: se só há um professor no estúdio, usa ele (caso comum em estúdios pequenos)
    if (professores.length === 1) {
        log.warn('Guardrail', 'professor_id — usando unico professor disponivel como fallback', { original: valor, resolvido: professores[0].id });
        return professores[0].id;
    }

    throw new Error(`Professor nao encontrado para: "${valor}". Disponiveis: ${professores.map(p => p.nome).join(', ')}`);
}

function compararDatas(d1, d2) {
    if (!d1 || !d2) return false;
    if (d1 === d2) return true;
    const date1 = new Date(d1);
    const date2 = new Date(d2);
    if (!isNaN(date1.getTime()) && !isNaN(date2.getTime())) {
        return date1.getTime() === date2.getTime();
    }
    return false;
}

async function resolverAgendamentoId(dataAula, alunoId, context) {
    if (!dataAula) return null;
    
    const dataAulaNorm = normalizarParaBrt(dataAula);
    const alunoInfo = context?.alunoInfo;
    let proximas = alunoInfo?.proximas_aulas || [];

    if (proximas.length === 0 && context?.telefoneCliente) {
        try {
            log.info('Guardrail', 'proximas_aulas vazias ou nao carregadas - buscando da API para resolver agendamento_id', { alunoId, telefone: context.telefoneCliente });
            const res = await chamarApiStudio({ acao: 'alunos', metodo: 'GET', params: { q: context.telefoneCliente } });
            const dataConvertida = converterDatasAluno(res);
            const freshAluno = dataConvertida?.alunos?.[0];
            if (freshAluno?.proximas_aulas) {
                proximas = freshAluno.proximas_aulas;
            }
        } catch (e) {
            log.error('Guardrail', 'Erro ao buscar aluno para resolver agendamento_id', { erro: e.message });
        }
    }

    const match = proximas.find(aula => {
        if (!aula.data) return false;
        const dataAulaBrt = normalizarParaBrt(aula.data);
        return dataAulaBrt === dataAulaNorm || compararDatas(aula.data, dataAula);
    });

    if (match?.id) {
        log.info('Guardrail', 'agendamento_id resolvido por data', { dataAula, resolvido: match.id });
        return match.id;
    }

    log.warn('Guardrail', `Nao foi possivel resolver agendamento_id para a data ${dataAula}`, { proximas_aulas: proximas.map(a => a.data) });
    throw new Error(`Nao foi possivel encontrar uma aula agendada na data ${dataAula}`);
}

function removerUUIDsRecursivo(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
        return obj.map(removerUUIDsRecursivo);
    }
    const clean = {};
    for (const key of Object.keys(obj)) {
        const val = obj[key];
        if ((['id', 'aluno_id', 'professor_id', 'estudio_id', 'agendamento_id', 'agendamento_antigo_id'].includes(key) && isUUID(val)) || key === 'estudio_id') {
            continue;
        }
        clean[key] = removerUUIDsRecursivo(val);
    }
    return clean;
}

const sanitizarRetornoAluno = removerUUIDsRecursivo;

async function aplicarGuardrails(args, campos, context) {
    const corrigido = { ...args };
    const erros = [];
    for (const campo of campos) {
        try {
            if (campo === 'aluno_id') {
                corrigido.aluno_id = await resolverAlunoId(corrigido.aluno_id, context.telefoneCliente, context.alunoInfo);
            } else if (campo === 'professor') {
                if (corrigido.professor) {
                    corrigido.professor_id = await resolverProfessorId(corrigido.professor, context.listaProfessores);
                    delete corrigido.professor;
                }
            } else if (campo === 'agendamento_id') {
                if (corrigido.data_aula) {
                    const resolvedId = await resolverAgendamentoId(corrigido.data_aula, corrigido.aluno_id, context);
                    if (resolvedId) {
                        corrigido.agendamento_id = resolvedId;
                    }
                }
            } else if (campo === 'agendamento_antigo_id') {
                if (corrigido.data_antiga) {
                    const resolvedId = await resolverAgendamentoId(corrigido.data_antiga, corrigido.aluno_id, context);
                    if (resolvedId) {
                        corrigido.agendamento_antigo_id = resolvedId;
                    }
                }
            }
        } catch (e) {
            erros.push({ campo, erro: e.message });
        }
    }
    return { corrigido, erros };
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────
const alunoToolDefinitions = [
    {
        type: 'function',
        function: {
            name: 'buscar_aluno',
            description: 'Busca um aluno pelo telefone, email ou CPF. Retorna: nome, saldo_aulas, proximas_aulas (com data, data_exibicao, professor), historico_aulas. Chame APENAS: (1) se o aluno nao estiver cadastrado no prompt, ou (2) apos agendar/remarcar/cancelar para recarregar. NAO chame em toda mensagem.',
            parameters: {
                type: 'object',
                required: ['q'],
                properties: {
                    q: { type: 'string', description: 'Telefone (ex: 5551999887766@s.whatsapp.net), email ou CPF.' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'cadastrar_aluno',
            description: 'Cadastra um novo aluno. Use apenas quando buscar_aluno nao encontrar o aluno.',
            parameters: {
                type: 'object',
                required: ['nome', 'telefone'],
                properties: {
                    nome:     { type: 'string' },
                    telefone: { type: 'string', description: 'Formato: 55DDD9XXXXXXXX@s.whatsapp.net' },
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
            description: 'Verifica horarios disponiveis. OBRIGATORIO antes de oferecer ou confirmar qualquer horario. O campo "inicio" de cada slot retornado e o valor EXATO a passar como data_inicio (agendar_aula) ou novo_inicio (remarcar_aula). O campo "professor" de cada slot e o professor a usar nas chamadas seguintes.',
            parameters: {
                type: 'object',
                required: ['inicio'],
                properties: {
                    inicio: {
                        type: 'string',
                        description: 'Inicio da janela em ISO 8601 com -03:00. Horario especifico: o exato pedido. Manha: T07:00:00-03:00. Tarde: T13:00:00-03:00. Noite: T18:00:00-03:00.',
                    },
                    fim: {
                        type: 'string',
                        description: 'Fim da janela em ISO 8601 com -03:00. Horario especifico: inicio + 1h. Manha: T11:00:00-03:00. Tarde: T18:00:00-03:00. Noite: T22:00:00-03:00.',
                    },
                    professor: {
                        type: 'string',
                        description: 'Nome do professor (ex: "Darlen"). Opcional.',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'agendar_aula',
            description: 'Cria agendamento e debita 1 credito. APENAS apos confirmacao explicita do aluno. NUNCA sem verificar_disponibilidade antes.',
            parameters: {
                type: 'object',
                required: ['professor', 'data_inicio', 'tipo_aula'],
                properties: {
                    professor: {
                        type: 'string',
                        description: 'Nome do professor (ex: "Darlen").',
                    },
                    data_inicio: {
                        type: 'string',
                        description: 'Campo "inicio" EXATO do slot de verificar_disponibilidade, em -03:00. Ex: 2026-05-21T09:00:00-03:00.',
                    },
                    tipo_aula: {
                        type: 'string',
                        enum: ['aula', 'experimental'],
                        description: '"aula" para aulas normais. "experimental" para primeira aula gratuita.',
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
            description: 'Remarca aula existente sem debitar saldo. Use SEMPRE para trocar horario — nunca cancelar + agendar. APENAS apos confirmacao do aluno e verificar_disponibilidade para o novo horario.',
            parameters: {
                type: 'object',
                required: ['data_antiga', 'novo_inicio'],
                properties: {
                    data_antiga: {
                        type: 'string',
                        description: 'Campo "data" (ISO -03:00) da aula a remarcar (obtida das proximas aulas no prompt).',
                    },
                    novo_inicio: {
                        type: 'string',
                        description: 'Campo "inicio" EXATO do slot de verificar_disponibilidade (ISO -03:00).',
                    },
                    professor: {
                        type: 'string',
                        description: 'Nome do professor (ex: "Darlen"). Opcional — mantem o mesmo da aula original se omitido.',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'cancelar_aula',
            description: 'Cancela aula agendada. Devolve 1 credito se cancelado com mais de 2h de antecedencia. APENAS apos confirmacao do aluno. Verifique "devolveu_credito" no retorno.',
            parameters: {
                type: 'object',
                required: ['data_aula'],
                properties: {
                    data_aula: {
                        type: 'string',
                        description: 'Campo "data" (ISO -03:00) da aula a ser cancelada (obtida das proximas aulas no prompt).',
                    },
                    motivo: { type: 'string', description: 'Padrao: "Cancelamento solicitado pelo aluno".' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'listar_professores',
            description: 'Lista nomes dos professores ativos do estúdio.',
            parameters: { type: 'object', properties: {} },
        },
    },
    {
        type: 'function',
        function: {
            name: 'listar_pacotes',
            description: 'Lista pacotes de aulas disponiveis. Use quando o aluno perguntar sobre planos ou renovacao.',
            parameters: { type: 'object', properties: {} },
        },
    },
    {
        type: 'function',
        function: {
            name: 'buscar_info',
            description: 'Busca informacoes do estudio (precos, planos, funcionamento, localizacao, modalidades, convenios). Tente SEMPRE antes de notificar_humano por falta de info.',
            parameters: {
                type: 'object',
                required: ['query'],
                properties: {
                    query: { type: 'string', description: 'Ex: "preco mensal", "horario de funcionamento", "pilates".' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'notificar_humano',
            description: 'Notifica atendente humano. Use APENAS: (1) aluno pede humano, (2) cobranca incorreta, (3) erro tecnico persistente apos 2+ tentativas. NUNCA por falta de informacao. NUNCA diga "vou chamar a Darlen" sem ter chamado esta tool.',
            parameters: {
                type: 'object',
                required: ['problema'],
                properties: {
                    problema: { type: 'string', description: 'Descricao clara do problema.' },
                    telefone: { type: 'string', description: 'Telefone do aluno.' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'enviar_midia',
            description: 'Envia imagem ou arquivo ao aluno via WhatsApp.',
            parameters: {
                type: 'object',
                required: ['url', 'telefone'],
                properties: {
                    url:      { type: 'string', description: 'URL publica da midia.' },
                    caption:  { type: 'string' },
                    telefone: { type: 'string', description: 'Telefone do destinatario (formato WhatsApp).' },
                },
            },
        },
    },
];

// ─── Executor ─────────────────────────────────────────────────────────────────
async function executeAlunoTool(name, args, context = {}) {
    const comTelefone = corpo => ({ ...corpo, _telefone_cliente: context.telefoneCliente || null });

    switch (name) {

        case 'buscar_aluno': {
            const res = await chamarApiStudio({ acao: 'alunos', metodo: 'GET', params: { q: args.q } });
            const dataConvertida = converterDatasAluno(res);
            return sanitizarRetornoAluno(dataConvertida);
        }

        case 'cadastrar_aluno':
            return chamarApiStudio({ acao: 'alunos', metodo: 'POST', corpo: args });

        case 'verificar_disponibilidade': {
            const { corrigido, erros } = await aplicarGuardrails(args, ['aluno_id', 'professor'], context);
            if (erros.length) {
                log.error('Guardrail', 'IDs invalidos em verificar_disponibilidade', { erros });
                return { sucesso: false, erro: 'ID_INVALIDO', detalhes: erros };
            }
            const res = await chamarApiStudio({ acao: 'verificar-disponibilidade', corpo: comTelefone(corrigido) });
            // Sanitiza para remover IDs de professor nas opções retornadas ao modelo
            if (res && Array.isArray(res.disponiveis)) {
                res.disponiveis = res.disponiveis.map(slot => {
                    const cleanSlot = { ...slot };
                    if (cleanSlot.professor_nome) {
                        cleanSlot.professor = cleanSlot.professor_nome;
                        delete cleanSlot.professor_nome;
                    }
                    delete cleanSlot.professor_id;
                    return cleanSlot;
                });
            }
            return res;
        }

        case 'agendar_aula': {
            const { corrigido, erros } = await aplicarGuardrails(args, ['aluno_id', 'professor'], context);
            if (erros.length) {
                log.error('Guardrail', 'IDs invalidos em agendar_aula', { erros });
                return { sucesso: false, erro: 'ID_INVALIDO', detalhes: erros };
            }
            // Normaliza data_inicio para -03:00 caso venha em UTC
            if (corrigido.data_inicio) {
                const norm = normalizarParaBrt(corrigido.data_inicio);
                if (norm !== corrigido.data_inicio) {
                    log.warn('Guardrail', 'data_inicio convertida para BRT', { original: corrigido.data_inicio, normalizado: norm });
                    corrigido.data_inicio = norm;
                }
            }
            return chamarApiStudio({ acao: 'agendar', corpo: comTelefone(corrigido) });
        }

        case 'remarcar_aula': {
            const { corrigido, erros } = await aplicarGuardrails(args, ['aluno_id', 'professor', 'agendamento_antigo_id'], context);
            if (erros.length) {
                log.error('Guardrail', 'IDs invalidos em remarcar_aula', { erros });
                return { sucesso: false, erro: 'ID_INVALIDO', detalhes: erros };
            }
            if (corrigido.novo_inicio) {
                const norm = normalizarParaBrt(corrigido.novo_inicio);
                if (norm !== corrigido.novo_inicio) {
                    log.warn('Guardrail', 'novo_inicio convertido para BRT', { original: corrigido.novo_inicio, normalizado: norm });
                    corrigido.novo_inicio = norm;
                }
            }
            return chamarApiStudio({ acao: 'remarcar', corpo: comTelefone(corrigido) });
        }

        case 'cancelar_aula': {
            const { corrigido, erros } = await aplicarGuardrails(args, ['aluno_id', 'agendamento_id'], context);
            if (erros.length) {
                log.error('Guardrail', 'IDs invalidos em cancelar_aula', { erros });
                return { sucesso: false, erro: 'ID_INVALIDO', detalhes: erros };
            }
            return chamarApiStudio({
                acao: 'cancelar',
                corpo: comTelefone({
                    agendamento_id: corrigido.agendamento_id,
                    data_aula:      corrigido.data_aula,
                    motivo:         corrigido.motivo || 'Cancelamento solicitado pelo aluno',
                    ...(corrigido.aluno_id && { aluno_id: corrigido.aluno_id }),
                }),
            });
        }

        case 'listar_professores': {
            const res = await chamarApiStudio({ acao: 'professores', metodo: 'GET' });
            if (res?.sucesso && Array.isArray(res.professores)) {
                return {
                    sucesso: true,
                    professores: res.professores.map(p => ({ nome: p.nome })),
                };
            }
            return res;
        }

        case 'listar_pacotes':
            return chamarApiStudio({ acao: 'listar-pacotes', metodo: 'GET' });

        case 'buscar_info':
            return chamarApiStudio({ acao: 'buscar-info', corpo: { query: args.query } });

        case 'notificar_humano':
            return chamarApiStudio({
                acao: 'notificar-humano',
                corpo: {
                    problema: args.problema,
                    telefone: args.telefone || context.telefoneCliente || null,
                },
            });

        case 'enviar_midia':
            return chamarApiStudio({
                acao: 'enviar-midia',
                corpo: {
                    url:      args.url,
                    caption:  args.caption || '',
                    telefone: args.telefone || context.telefoneCliente || null,
                },
            });

        default:
            log.warn('AlunoTools', `Tool desconhecida: ${name}`, { args });
            return { sucesso: false, erro: 'TOOL_DESCONHECIDA', mensagem: `Tool "${name}" nao existe.` };
    }
}

const alunoToolNames = alunoToolDefinitions.map(t => t.function.name);

module.exports = { alunoToolDefinitions, executeAlunoTool, alunoToolNames, converterDatasAluno };