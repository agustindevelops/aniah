# Gmail-First Local Sync v1

Local-first operator tool that:

- captures Gmail records with Playwright from an authenticated browser tab
- stores raw records in SQLite
- normalizes into a shared event/update schema
- runs Gemma via Ollama for classification, summary, and missing field flags
- serves results through local API + web dashboard

## Services

- `apps/worker`: sync orchestration (`POST /sync/gmail`)
- `apps/api`: read/query API + sync trigger endpoint (`POST /sync`)
- `apps/web`: lightweight dashboard

## Prerequisites

- Node.js 20+
- Chromium/Chrome with remote debugging enabled
- Ollama installed locally with a Gemma model

## 1) Start Chrome for Playwright attach mode

Playwright attaches to your running authenticated browser session (v1 choice):

```bash
"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222
```

Then sign into Gmail in that browser.

## 2) Start Ollama and pull model

```bash
ollama pull gemma3:4b
ollama serve
```

## 3) Install dependencies

```bash
npm install
```

## 4) Run locally (non-Docker)

In separate terminals:

```bash
npm run dev -w @local-sync/worker
npm run dev -w @local-sync/api
npm run dev -w @local-sync/web
```

Dashboard: [http://localhost:4173](http://localhost:4173)

### Optional: set initial Gmail sync start time

The worker stores the last synced email timestamp in `sync_sources.last_cursor`.

- First run: if `GMAIL_SYNC_START_AT` is set, sync starts from that timestamp.
- Later runs: sync starts from the stored last cursor (latest captured email timestamp).

Example (PowerShell), start from April 1st, 2026:

```powershell
$env:GMAIL_SYNC_START_AT="2026-04-01T00:00:00-04:00"
npm run dev -w @local-sync/worker
```

Example (bash):

```bash
export GMAIL_SYNC_START_AT="2026-04-01T00:00:00-04:00"
npm run dev -w @local-sync/worker
```

## 5) Docker Compose (browser outside Docker)

```bash
docker compose -f docker/compose.yaml up --build
```

Note:

- Browser remains outside Docker.
- Worker connects to host Chrome via `CHROME_CDP_URL=http://host.docker.internal:9222`.

## API Endpoints

- `POST /sync` - trigger Gmail sync through worker
- `GET /sync/status` - last cursor/last sync metadata
- `GET /records/recent?limit=50` - recent normalized records + AI summary joins
- `GET /records/:id/summary` - AI summary for one normalized record
