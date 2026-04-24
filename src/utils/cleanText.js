/**
 * Remove markdown e formata o texto para WhatsApp puro.
 * Garante mensagens limpas mesmo que o modelo ignore as instruções do prompt.
 */
function cleanMarkdown(text) {
  if (!text) return text;

  return text
    // Remove ### títulos
    .replace(/^#{1,6}\s+/gm, '')
    // Remove **negrito** e __negrito__
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    // Remove *itálico* e _itálico_
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // Remove `código inline`
    .replace(/`([^`]+)`/g, '$1')
    // Remove blocos de código ```
    .replace(/```[\s\S]*?```/g, '')
    // Converte links markdown [texto](url) → só o texto
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove bullets markdown (- item ou * item)
    .replace(/^[\s]*[-*•]\s+/gm, '')
    // Remove numeração de listas (1. item)
    .replace(/^\d+\.\s+/gm, '')
    // Remove linhas horizontais ---
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Colapsa múltiplas linhas em branco em uma só
    .replace(/\n{3,}/g, '\n\n')
    // Remove espaços no início/fim
    .trim();
}

module.exports = { cleanMarkdown };
