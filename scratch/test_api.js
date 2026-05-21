const axios = require('axios');

const API_URL = 'http://localhost:3000/api/agente';
const API_KEY = 'sk_68ga8uxd3o3edmuqyfrag4';
const ALUNO_ID = 'fd5dbf0a-ed55-466b-96bd-81df5d65c1ca';
const TELEFONE = '5551995009663@s.whatsapp.net';

async function testarAPI(acao, corpo = {}, params = {}, metodo = 'POST') {
    const payload = {
        acao,
        metodo,
        params,
        corpo: {
            ...corpo,
            _telefone_cliente: TELEFONE
        }
    };

    console.log(`\n==========================================`);
    console.log(`[TEST] Ação: ${acao} | Método: ${metodo}`);
    console.log(`Payload:`, JSON.stringify(payload, null, 2));

    try {
        const response = await axios.post(API_URL, payload, {
            headers: {
                'Content-Type': 'application/json',
                'x-studio-key': API_KEY
            }
        });

        console.log(`[SUCESSO] Status: ${response.status}`);
        console.log(`Resposta:`, JSON.stringify(response.data, null, 2));
        return response.data;
    } catch (error) {
        console.error(`[ERRO]`);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Dados:`, JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(`Mensagem: ${error.message}`);
        }
        return null;
    }
}

async function rodarTestes() {
    console.log("=================================================");
    console.log("INICIANDO FLUXO COMPLETO DE TESTES DA API...");
    console.log("=================================================");

    // ─────────────────────────────────────────────────────────────
    // TESTE 1: Buscar Dados do Aluno (GET)
    // ─────────────────────────────────────────────────────────────
    console.log("\n>>> TESTE 1: Buscar Aluno");
    const alunoRes = await testarAPI('alunos', {}, { q: TELEFONE }, 'GET');

    if (!alunoRes || !alunoRes.sucesso || !alunoRes.alunos || alunoRes.alunos.length === 0) {
        console.log("Aluno não encontrado ou erro na busca. Parando testes.");
        return;
    }

    const aluno = alunoRes.alunos[0];
    console.log(`\n[RESULTADO] Aluno: ${aluno.nome} | ID: ${aluno.id} | Saldo: ${aluno.saldo_aulas}`);
    console.log(`Próximas aulas ativas:`, aluno.proximas_aulas.map(a => `${a.data_exibicao || a.data} (${a.id})`));

    // [LIMPEZA] Cancelar aula de teste anterior se existir em 22/05 ou 05/06 às 14h30 para liberar o horário
    const aulasTeste = aluno.proximas_aulas?.filter(a => a.data && (a.data.includes('2026-05-22T14:30') || a.data.includes('2026-06-05T14:30')));
    if (aulasTeste && aulasTeste.length > 0) {
        for (const aula of aulasTeste) {
            console.log(`\n[LIMPEZA] Encontrada aula de teste residual em ${aula.data}. Cancelando ID: ${aula.id}`);
            await testarAPI('cancelar', { agendamento_id: aula.id, motivo: 'Limpeza de teste residual' });
        }

        // Recarregar os dados do aluno para atualizar a lista
        console.log("\n>>> Recarregando perfil do aluno pós-limpeza...");
        const recarga = await testarAPI('alunos', {}, { q: TELEFONE }, 'GET');
        if (recarga && recarga.sucesso && recarga.alunos && recarga.alunos.length > 0) {
            aluno.proximas_aulas = recarga.alunos[0].proximas_aulas;
            aluno.saldo_aulas = recarga.alunos[0].saldo_aulas;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // TESTE 2: Cancelar Aula (Sexta 05/06 às 07h30) com Fallback por Data
    // ─────────────────────────────────────────────────────────────
    console.log("\n>>> TESTE 2: Cancelar Aula com Fallback por Data e ID Alucinado");
    // Vamos tentar cancelar a aula de 05/06 às 07h30 enviando um ID falso
    const cancelRes = await testarAPI('cancelar', {
        agendamento_id: '30f802b7-3789-40ab-877d-77add1bee677',
        aluno_id: ALUNO_ID,
        motivo: 'Cancelamento via Teste Automatizado de Fallback'
    });

    if (cancelRes && cancelRes.sucesso) {
        console.log("\n[RESULTADO] Cancelamento efetuado com sucesso via Fallback!");
    } else {
        console.log("\n[RESULTADO] Falha no cancelamento. Continuando testes...");
    }

    // ─────────────────────────────────────────────────────────────
    // TESTE 3: Verificar Disponibilidade para Nova Reserva (Sexta 22/05)
    // ─────────────────────────────────────────────────────────────
    console.log("\n>>> TESTE 3: Verificar Disponibilidade na Sexta 22/05");
    const dispRes = await testarAPI('verificar-disponibilidade', {
        inicio: '2026-05-22T07:00:00-03:00',
        fim: '2026-05-22T22:00:00-03:00',
        aluno_id: ALUNO_ID
    });

    // ─────────────────────────────────────────────────────────────
    // TESTE 4: Agendar Nova Aula (Marcar) na Sexta 22/05 às 18h00
    // ─────────────────────────────────────────────────────────────
    console.log("\n>>> TESTE 4: Agendar Nova Aula (Marcar) Sexta 22/05 às 14h30");
    const agendarRes = await testarAPI('agendar', {
        aluno_id: ALUNO_ID,
        data_inicio: '2026-05-22T14:30:00-03:00',
        professor_id: '6b2bbaad-da13-4bcd-9486-c43a992dcf81', // Prof Darlen
        tipo_aula: 'aula'
    });

    let agendamentoCriadoId = null;
    if (agendarRes && agendarRes.sucesso) {
        agendamentoCriadoId = agendarRes.dados?.id;
        console.log(`\n[RESULTADO] Aula agendada com sucesso! ID: ${agendamentoCriadoId}`);
    } else {
        console.log("\n[RESULTADO] Falha ao agendar aula.");
    }

    // ─────────────────────────────────────────────────────────────
    // TESTE 5: Remarcar Aula Recém Criada (Sexta 22/05 às 14h30) para Sexta 05/06 às 14h30
    // ─────────────────────────────────────────────────────────────
    if (agendamentoCriadoId) {
        console.log("\n>>> TESTE 5: Remarcar Aula para Novo Horário (Sexta 05/06 às 14h30)");
        // Vamos passar o ID recém-criado, mas simulando o fallback de data_antiga também
        const remarcarRes = await testarAPI('remarcar', {
            agendamento_antigo_id: agendamentoCriadoId,
            novo_inicio: '2026-06-05T14:30:00-03:00',
            aluno_id: ALUNO_ID,
            data_antiga: '2026-05-22T14:30:00-03:00'
        });

        if (remarcarRes && remarcarRes.sucesso) {
            console.log("\n[RESULTADO] Aula remarcada com sucesso para Sexta 05/06 às 18h00!");
        } else {
            console.log("\n[RESULTADO] Falha ao remarcar aula.");
        }
    } else {
        console.log("\n>>> TESTE 5 Pulado: Não foi possível agendar a aula no Teste 4.");
    }

    console.log("\n=================================================");
    console.log("FLUXO DE TESTES CONCLUÍDO!");
    console.log("=================================================");
}

rodarTestes();
