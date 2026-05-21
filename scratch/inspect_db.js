const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ESTUDIO_ID = process.env.EMPRESA_ID || 'bda37657-6290-439e-8a92-856d0983e26d';

async function main() {
    console.log("=== INSPEÇÃO DO BANCO DE DADOS ===");
    console.log("Supabase URL:", process.env.SUPABASE_URL);
    console.log("Estúdio ID:", ESTUDIO_ID);

    // 1. Buscar regras de disponibilidade do professor Darlen (professor_id: 6b2bbaad-da13-4bcd-9486-c43a992dcf81)
    const { data: regras, error: errRegras } = await supabase
        .from('disponibilidade_professores')
        .select('*')
        .eq('estudio_id', ESTUDIO_ID)
        .eq('professor_id', '6b2bbaad-da13-4bcd-9486-c43a992dcf81');

    if (errRegras) {
        console.error("Erro ao buscar regras:", errRegras);
    } else {
        console.log("\n>>> Regras de Disponibilidade da Darlen:");
        console.table(regras.map(r => ({
            dia_semana: r.dia_semana, // 0 = Domingo, 5 = Sexta
            hora_inicio: r.hora_inicio,
            hora_fim: r.hora_fim
        })));
    }

    // 2. Buscar agendamentos em 22/05/2026
    const { data: agendamentos, error: errAgend } = await supabase
        .from('agendamentos')
        .select('id, data_inicio, data_fim, status, aluno_id, professor_id, tipo_aula')
        .eq('estudio_id', ESTUDIO_ID)
        .gte('data_inicio', '2026-05-22T00:00:00Z')
        .lte('data_inicio', '2026-05-22T23:59:59Z');

    if (errAgend) {
        console.error("Erro ao buscar agendamentos:", errAgend);
    } else {
        console.log("\n>>> Agendamentos em 22/05/2026 (UTC):");
        console.table(agendamentos.map(a => ({
            id: a.id,
            inicio: a.data_inicio,
            fim: a.data_fim,
            status: a.status,
            aluno_id: a.aluno_id,
            professor_id: a.professor_id,
            tipo_aula: a.tipo_aula
        })));
    }
}

main().catch(console.error);
