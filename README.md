# Agente WhatsApp — Darlen Portal Fitness

Conversão do workflow n8n para Node.js puro.

## Estrutura


whatsapp-agent/
├── src/
│   ├── index.js                    # Servidor Express
│   ├── config.js                   # Configurações via .env
│   ├── webhook.js                  # Recebe e processa webhooks
│   └── services/
│       ├── aiService.js            # Agente OpenAI com tools
│       ├── promptService.js        # System prompt do agente
│       ├── debouncerService.js     # Debouncer em memória (sem Redis)
│       ├── supabaseService.js      # CRUD de alunos
│       ├── memoryService.js        # Memória de chat (PostgreSQL)
│       ├── whatsappService.js      # Envio via Evolution API
│       └── studioApiService.js     # API principal do estúdio
├── .env.example
└── package.json


## Fluxo equivalente ao n8n


Webhook recebido
  → Extrai campos (telefone, mensagem, tipo, instância, etc.)
  → Ignora fromMe=true
  → Ignora DELIVERY_ACK
  → Reação → pausa atendimento no Supabase
  → Imagem → responde "não consigo interpretar imagens"
  → Busca/cria cliente no Supabase
  → Verifica se está pausado
  → Empilha mensagem no debouncer (Map em memória)
  → Debouncer (25s) — aguarda mensagens subsequentes
  → Agrupa todas as mensagens acumuladas
  → Executa agente OpenAI com tools + memória PostgreSQL
  → Envia resposta via Evolution API


## Instalação

bash
cd whatsapp-agent
npm install
cp .env.example .env
# Edite o .env com suas credenciais
npm start


## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `PORT` | Porta do servidor (padrão: 3000) |
| `OPENAI_API_KEY` | Chave da OpenAI |
| `OPENAI_MODEL` | Modelo (padrão: gpt-4o-mini) |
| `DEBOUNCER_TIME` | Segundos para agrupar mensagens (padrão: 25) |
| `SUPABASE_KEY` | Chave do Supabase |
| `POSTGRES_URL` | URL do PostgreSQL (memória do chat) |
| `STUDIO_API_URL` | URL da API do estúdio |
| `STUDIO_API_KEY` | Chave da API do estúdio |
| `EMPRESA_ID` | UUID da empresa |
| `SUPABASE_URL` | URL do Supabase |

| Tool | Descrição |
|---|---|
| `chamar_api_studio` | Agendamentos, alunos, professores, disponibilidade |
| `notificar_humano` | Notifica atendente humano |
| `buscar_info` | RAG — preços, planos, horários |
| `enviar_midia` | Envia fotos/vídeos ao aluno |

## Personalizações necessárias

1. **`notificar_humano`** em `aiService.js` — integre com seu sistema (webhook, email, Slack, etc.)
2. **`buscar_info`** em `aiService.js` — integre com seu Supabase Vector Store / RAG
3. **`enviar_midia`** em `aiService.js` — integre com seu sistema de envio de mídia
