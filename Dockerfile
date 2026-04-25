FROM node:20-alpine

WORKDIR /app

# Copia dependências primeiro (cache de layers)
COPY package*.json ./
RUN npm ci --omit=dev

# Copia o restante do código
COPY . .

ENV NODE_ENV=production

# Porta exposta
EXPOSE 3000

# Inicia em produção
CMD ["node", "src/index.js"]
