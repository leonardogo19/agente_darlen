require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 8000,
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
  },

  postgres: null, // não usado — memória do chat vai para o Supabase

  studio: {
    apiUrl: process.env.STUDIO_API_URL,
    apiKey: process.env.STUDIO_API_KEY,
  },

  empresaId: process.env.EMPRESA_ID || 'bda37657-6290-439e-8a92-856d0983e26d',
  debouncerTime: parseInt(process.env.DEBOUNCER_TIME) || 25,
};
