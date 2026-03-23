# Vyana Backend

Express + Prisma backend for Vyana (cycle tracking, daily logs, AI-powered insights, and chat).

## Tech Stack

- Node.js + TypeScript
- Express
- Prisma ORM
- PostgreSQL (Supabase compatible)
- JWT auth (access + refresh)
- OpenAI (optional phrasing layer for insights)

## Project Structure

```text
src/
  controllers/
  lib/
  middleware/
  routes/
  services/
  types/
  utils/
prisma/
  schema.prisma
```

## Core Design Docs

- `INSIGHTS_SYSTEM.md` - Complete architecture and logic for the insights + forecast engine
- `SYSTEM_DESIGN.md` - End-to-end backend system design (architecture, flows, data, security, ops)

## Environment Variables

Create `.env` from `.env.example`:

```bash
DATABASE_URL="postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require"
JWT_SECRET="replace-with-strong-secret"
OPENAI_API_KEY="sk-..."        # optional (for AI-enhanced insights phrasing)
OPENAI_MODEL="gpt-4o-mini"     # optional
PORT=3000
```

## Setup

```bash
npm install
npx prisma migrate dev --name init
npm run prisma:generate
npm run dev
```

Build for production:

```bash
npm run build
npm run start
```

## Available Scripts

- `npm run dev` - Start dev server with hot reload
- `npm run build` - Compile TypeScript to `dist/`
- `npm run start` - Run compiled server
- `npm run prisma:migrate` - Run Prisma dev migration
- `npm run prisma:generate` - Generate Prisma client

## API Endpoints

### Health

- `GET /health`

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`

### User

- `GET /api/user/me` (auth required)

### Cycle

- `GET /api/cycle/current` (auth required)
- `GET /api/cycle/calendar?month=YYYY-MM` (auth required)

### Logs

- `POST /api/logs` (auth required)
- `GET /api/logs?date=YYYY-MM-DD` (auth required)

### Insights

- `GET /api/insights` (auth required)

### Chat

- `POST /api/chat` (auth required)
- `GET /api/chat/history` (auth required)

## Auth Usage

Send access token in the `Authorization` header:

```text
Authorization: Bearer <access_token>
```

## Example Payloads

Register:

```json
{
  "name": "Priya",
  "age": 27,
  "height": 162,
  "weight": 58,
  "cycleLength": 28,
  "lastPeriodStart": "2026-03-10"
}
```

Login:

```json
{
  "userId": "uuid-here"
}
```

Create log:

```json
{
  "mood": "low",
  "energy": "medium",
  "sleep": 6.5,
  "stress": "high",
  "diet": "irregular",
  "exercise": "none",
  "symptoms": ["headache"],
  "pain": "moderate",
  "padsChanged": 7,
  "cravings": "high",
  "fatigue": "medium"
}
```

Chat request:

```json
{
  "message": "I feel very tired today, is this normal?",
  "history": [
    { "role": "user", "content": "I had cramps yesterday." },
    { "role": "assistant", "content": "That can happen during menstrual days." }
  ]
}
```

Cycle calendar request:

```text
GET /api/cycle/calendar?month=2026-03
```

Insights response shape:

```json
{
  "mode": "personalized",
  "confidence": "medium",
  "aiEnhanced": true,
  "basedOn": {
    "phase": "menstrual",
    "recentLogsCount": 5,
    "trends": ["Sleep decreasing", "Stress increasing"],
    "reasoning": ["..."]
  },
  "insights": {
    "physicalInsight": "...",
    "mentalInsight": "...",
    "emotionalInsight": "...",
    "whyThisIsHappening": "...",
    "solution": "...",
    "recommendation": "..."
  }
}
```

## Insights Engine Notes

- Pipeline: logs -> signals -> trends -> context -> insights
- Rule-based logic is always available
- If `OPENAI_API_KEY` is set, GPT rewrites insights for tone and personalization
- If AI call fails, service automatically falls back to rule-based output
- Menstrual bleeding load uses `padsChanged` to improve weakness/strain guidance

## Current Scope

Implemented:

- Auth + JWT middleware
- Cycle engine + current cycle endpoint
- Monthly cycle calendar endpoint
- Daily log save/read
- Insight context + trend detection + personalized/fallback modes
- Insight outputs with cause (`whyThisIsHappening`) and action (`solution`)
- Optional GPT-enhanced phrasing for insights
- AI chat endpoint + chat history

Planned next:

- Notifications (FCM)
- Cron-based daily check-in scheduling
