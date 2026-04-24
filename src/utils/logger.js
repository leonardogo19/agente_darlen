/**
 * Logger estruturado com níveis, timestamps, emojis e contexto.
 * - Desenvolvimento: texto colorido + emojis legíveis no terminal
 * - Produção: JSON estruturado (fácil de indexar no Render/Railway)
 */

const IS_PROD = process.env.NODE_ENV === 'production';

const COLORS = {
  reset:   '\x1b[0m',
  dim:     '\x1b[2m',
  bold:    '\x1b[1m',
  red:     '\x1b[31m',
  yellow:  '\x1b[33m',
  green:   '\x1b[32m',
  cyan:    '\x1b[36m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  white:   '\x1b[37m',
};

// Emoji + cor por nível
const LEVEL_STYLE = {
  DEBUG: { emoji: '🔍', color: COLORS.dim    },
  INFO:  { emoji: '✅', color: COLORS.cyan   },
  WARN:  { emoji: '⚠️ ', color: COLORS.yellow },
  ERROR: { emoji: '❌', color: COLORS.red    },
};

// Emoji por módulo — identifica visualmente a origem do log
const MODULE_EMOJI = {
  Server:       '🚀',
  Webhook:      '📨',
  Debouncer:    '⏳',
  AI:           '🤖',
  Memory:       '🧠',
  Supabase:     '🗄️ ',
  WhatsApp:     '💬',
  StudioAPI:    '🏋️ ',
  AgentControl: '🎛️ ',
};

function timestamp() {
  return new Date().toISOString();
}

function getModuleEmoji(module) {
  return MODULE_EMOJI[module] || '📦';
}

function formatDev(level, module, message, meta) {
  const { emoji, color } = LEVEL_STYLE[level] || { emoji: '•', color: '' };
  const ts    = `${COLORS.dim}${timestamp()}${COLORS.reset}`;
  const mod   = `${COLORS.magenta}${getModuleEmoji(module)} [${module}]${COLORS.reset}`;
  const msg   = `${color}${COLORS.bold}${message}${COLORS.reset}`;
  const metaStr = meta && Object.keys(meta).length
    ? `\n    ${COLORS.dim}${JSON.stringify(meta, null, 2)
        .replace(/\n/g, '\n    ')}${COLORS.reset}`
    : '';
  return `${ts}  ${emoji}  ${mod}  ${msg}${metaStr}`;
}

function formatProd(level, module, message, meta) {
  return JSON.stringify({
    ts: timestamp(),
    level,
    emoji: LEVEL_STYLE[level]?.emoji,
    module,
    message,
    ...meta,
  });
}

function log(level, module, message, meta = {}) {
  const output = IS_PROD
    ? formatProd(level, module, message, meta)
    : formatDev(level, module, message, meta);

  if (level === 'ERROR') console.error(output);
  else if (level === 'WARN') console.warn(output);
  else console.log(output);
}

function create(module) {
  return {
    debug: (msg, meta)  => log('DEBUG', module, msg, meta),
    info:  (msg, meta)  => log('INFO',  module, msg, meta),
    warn:  (msg, meta)  => log('WARN',  module, msg, meta),
    error: (msg, meta)  => {
      if (meta instanceof Error) {
        meta = { error: meta.message, stack: meta.stack };
      }
      log('ERROR', module, msg, meta);
    },
  };
}

module.exports = { create };
