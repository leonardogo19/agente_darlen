const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
require('dotenv').config({ path: require('path').resolve(__dirname, '..', envFile) });
const express = require('express');
const config = require('./config');
const webhookRouter = require('./webhook');
const { create } = require('./utils/logger');

const log = create('Server');
const app = express();

app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// Webhook principal
app.post('/webhook', webhookRouter);

// Handler de rotas não encontradas
app.use((req, res) => {
  log.warn('Rota não encontrada', { method: req.method, path: req.path });
  res.status(404).json({ error: 'Not found' });
});

// Handler global de erros do Express
app.use((err, req, res, next) => {
  log.error('Erro não tratado no Express', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
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
