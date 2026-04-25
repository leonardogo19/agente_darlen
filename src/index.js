// Em produção (Render/Railway) as variáveis já estão no ambiente — não precisa de arquivo .env
// Em desenvolvimento carrega o .env local
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
}
const express = require('express');
const config = require('./config');
const webhookRouter = require('./evolution/webhook');
const agentControlRouter = require('./routes/agentControl');
const { create } = require('./utils/logger');

const { version } = require('../package.json');

const log = create('Server');
const app = express();

app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV || 'development',
  });
});

// Webhook principal
app.use('/webhook', webhookRouter);

// Controle do agente (pausar/retomar)
app.use('/agent', agentControlRouter);

// Handler de rotas não encontradas
app.use((_req, res) => {
  log.warn('Rota não encontrada', { path: _req.path });
  res.status(404).json({ error: 'Not found' });
});

// Handler global de erros do Express
app.use((err, _req, res, _next) => {
  log.error('Erro não tratado no Express', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, '0.0.0.0', () => {
  log.info('Servidor iniciado', {
    port: config.port,
    env: process.env.NODE_ENV || 'development',
    webhook: `POST http://localhost:${config.port}/webhook`,
    model: config.openai.model,
    debouncer_seconds: config.debouncerTime,
  });
});

// Captura erros não tratados para não derrubar o processo
process.on('unhandledRejection', (reason) => {
  log.error('UnhandledRejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  log.error('UncaughtException', { error: err.message, stack: err.stack });
});
