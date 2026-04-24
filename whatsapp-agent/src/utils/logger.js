/**
 * Logger estruturado com níveis, timestamps e contexto.
 * Produz JSON em produção (fácil de indexar) e texto colorido em dev.
 */

const IS_PROD = process.env.NODE_ENV === 'production';

const COLORS = {
  reset:  '\x1b[0m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  green:  '\x1b[32m',
  cyan:   '\x1b[36m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
};

const LEVEL_COLORS = {
  DEBUG: COLORS.dim,
  INFO:  COLORS.cyan,
  WARN:  COLORS.yellow,
  ERROR: COLORS.red,
};

function timestamp() {
  return new Date().toISOString();
}

function formatDev(level, module, message, meta) {
  const color = LEVEL_COLORS[level] || '';
  const ts = `${COLORS.dim}${timestamp()}${COLORS.reset}`;
  const lvl = `${color}${level.padEnd(5)}${COLORS.reset}`;
  const mod = `${COLORS.magenta}[${module}]${COLORS.reset}`;
  const msg = `${color}${message}${COLORS.reset}`;
  const metaStr = meta && Object.keys(meta).length
    ? `\n  ${COLORS.dim}${JSON.stringify(meta, null, 2).replace(/\n/g, '\n  ')}${COLORS.reset}`
    : '';
  return `${ts} ${lvl} ${mod} ${msg}${metaStr}`;
}

function formatProd(level, module, message, meta) {
  return JSON.stringify({ ts: timestamp(), level, module, message, ...meta });
}

function log(level, module, message, meta = {}) {
  const output = IS_PROD
    ? formatProd(level, module, message, meta)
    : formatDev(level, module, message, meta);

  if (level === 'ERROR') {
    console.error(output);
  } else if (level === 'WARN') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

/**
 * Cria um logger com módulo fixo.
 * Uso: const log = require('./logger').create('Webhook')
 */
function create(module) {
  return {
    debug: (msg, meta) => log('DEBUG', module, msg, meta),
    info:  (msg, meta) => log('INFO',  module, msg, meta),
    warn:  (msg, meta) => log('WARN',  module, msg, meta),
    error: (msg, meta) => {
      // Serializa Error objects automaticamente
      if (meta instanceof Error) {
        meta = { error: meta.message, stack: meta.stack };
      }
      log('ERROR', module, msg, meta);
    },
  };
}

module.exports = { create };
