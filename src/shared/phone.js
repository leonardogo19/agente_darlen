/**
 * Utilitários para tratamento de telefone/WhatsApp — versão CommonJS para o agente
 *
 * Padrão canônico do banco:
 *   55 + DDD(2) + 9 + número(8) + @s.whatsapp.net
 *   Exemplo: "5511987654321@s.whatsapp.net"  (13 dígitos numéricos)
 */

const WHATSAPP_SUFFIX = '@s.whatsapp.net';

/**
 * Normaliza qualquer variante de número brasileiro para o formato canônico:
 *   "5511987654321@s.whatsapp.net"
 *
 * Retorna null se o número for inválido.
 * @param {string|null|undefined} telefone
 * @returns {string|null}
 */
function normalizarTelefone(telefone) {
  if (!telefone) return null;

  // Remove sufixo do WhatsApp e tudo que não for número
  let digits = telefone.replace(WHATSAPP_SUFFIX, '').replace(/\D/g, '');

  if (!digits) return null;

  if (digits.length === 10) {
    // DDD(2) + 8 dígitos → adiciona 55 e 9
    digits = '55' + digits.substring(0, 2) + '9' + digits.substring(2);
  } else if (digits.length === 11) {
    if (digits.startsWith('55')) {
      // 55 + DDD(2) + 7 dígitos (raro) — assume que falta o 9
      // Não altera, pode ser legítimo curto; só adiciona sufixo
    } else {
      // DDD(2) + 9 + 8 dígitos → adiciona 55
      digits = '55' + digits;
    }
  } else if (digits.length === 12) {
    if (digits.startsWith('55')) {
      // 55 + DDD(2) + 8 dígitos sem 9 → insere 9
      digits = '55' + digits.substring(2, 4) + '9' + digits.substring(4);
    } else {
      // Trata como DDD(2) + 9 + 8 dígitos + algo extra — recorta
      digits = '55' + digits.substring(0, 2) + '9' + digits.substring(2, 10);
    }
  } else if (digits.length === 13) {
    // 55 + DDD(2) + 9 + 8 dígitos — formato canônico
    if (!digits.startsWith('55')) return null;
  } else if (digits.length > 13) {
    // Número muito longo — tenta extrair os últimos 11 dígitos
    const tail = digits.slice(-11);
    digits = '55' + tail;
  }

  // Garantia final: 13 dígitos começando com 55
  if (digits.length !== 13 || !digits.startsWith('55')) return null;

  return digits + WHATSAPP_SUFFIX;
}

/**
 * Retorna as duas variantes de um número (com 9 e sem 9) para busca
 * no banco, cobrindo números antigos cadastrados com 8 dígitos.
 * @param {string|null|undefined} telefone
 * @returns {string[]}
 */
function variantesTelefone(telefone) {
  const canonico = normalizarTelefone(telefone);
  if (!canonico) return telefone ? [telefone] : [];

  const digits = canonico.replace(WHATSAPP_SUFFIX, '');
  const ddd  = digits.substring(2, 4); // posições 2-3
  const nono = digits[4];              // posição 4
  const resto = digits.substring(5);  // 8 dígitos

  const variants = new Set();
  variants.add(canonico);

  if (nono === '9') {
    // Variante sem o 9 (números antigos)
    variants.add('55' + ddd + resto + WHATSAPP_SUFFIX);
  } else {
    // Já sem 9, adiciona variante com 9
    variants.add('55' + ddd + '9' + nono + resto + WHATSAPP_SUFFIX);
  }

  return Array.from(variants);
}

module.exports = { normalizarTelefone, variantesTelefone };
