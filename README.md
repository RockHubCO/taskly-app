# TaskForge — Assistente de Criação de Tarefas

Assistente de criação de tarefas Asana com memória persistente, powered by Anthropic Claude.

## Stack

- **Frontend/Backend:** Next.js 15 (App Router)
- **ORM:** Prisma 7 + PostgreSQL
- **Auth:** NextAuth.js v5 (JWT + Credentials)
- **AI:** Anthropic Claude API (streaming SSE)

## Setup Local

**Pré-requisitos:** Node.js 20+, PostgreSQL

1. Instalar dependências:
   ```bash
   npm install
   ```

2. Configurar variáveis de ambiente:
   ```bash
   cp .env.example .env
   # Editar .env com suas credenciais
   ```

3. Subir o banco de dados:
   ```bash
   npx prisma db push
   npx prisma db seed
   ```

4. Rodar a aplicação:
   ```bash
   npm run dev
   ```

## Deploy com Docker

```bash
docker compose up -d
```

## Variáveis de Ambiente

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Connection string do PostgreSQL |
| `NEXTAUTH_SECRET` | Secret para JWT sessions |
| `NEXTAUTH_URL` | URL pública da aplicação |
| `ANTHROPIC_API_KEY` | Chave da API Anthropic |
| `ANTHROPIC_MODEL` | Modelo Claude (default: `claude-sonnet-4-20250514`) |
