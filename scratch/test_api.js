const axios = require('axios');

const API_URL = 'https://studio-pilates-sigma.vercel.app/api/agente';
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
    console.log("Iniciando testes da API do estúdio...");

    // Teste 1: Buscar Aluno
    console.log("\n--- TESTE 1: Buscar Aluno ---");
    const alunoRes = await testarAPI('alunos', {}, { q: TELEFONE }, 'GET');
    
    if (!alunoRes || !alunoRes.sucesso || !alunoRes.alunos || alunoRes.alunos.length === 0) {
        console.log("Aluno não encontrado ou erro na busca. Parando testes.");
        return;
    }

    const aluno = alunoRes.alunos[0];
    console.log(`Aluno encontrado: ${aluno.nome} | ID: ${aluno.id} | Saldo: ${aluno.saldo_aulas}`);
    console.log("Próximas Aulas no banco:");
    console.log(JSON.stringify(aluno.proximas_aulas, null, 2));

    // Teste 2: Verificar Disponibilidade para sexta dia 22/05
    console.log("\n--- TESTE 2: Verificar Disponibilidade Sexta 22/05 ---");
    // Faremos das 07:00 até as 22:00
    await testarAPI('verificar-disponibilidade', {
        inicio: '2026-05-22T07:00:00-03:00',
        fim: '2026-05-22T22:00:00-03:00',
        aluno_id: ALUNO_ID
    });

    // Teste 3: Cancelar aula de segunda 25/05 às 08h30 usando ID inválido e fallback por data
    console.log("\n--- TESTE 3: Cancelar Aula Segunda 25/05 08h30 com ID inválido e data_aula ---");
    const aulaSegundaProxima = aluno.proximas_aulas?.find(aula => {
        return aula.data && (aula.data.includes('2026-05-25T08:30') || aula.data_exibicao?.includes('25/05') && aula.data_exibicao?.includes('08h30'));
    });

    if (aulaSegundaProxima) {
        console.log(`Tentando cancelar aula de forma robusta. Esperada: ${aulaSegundaProxima.data}`);
        await testarAPI('cancelar', {
            agendamento_id: 'UUID-ALUCINADO-PELO-LLM-1234567890',
            data_aula: '2026-05-25T08:30:00-03:00', // data_aula do fallback
            aluno_id: ALUNO_ID,
            motivo: 'Teste de fallback no cancelamento'
        });
    } else {
        console.log("Nenhuma aula encontrada para segunda-feira 25/05 às 08h30 no perfil do aluno.");
    }
}

rodarTestes();
