# Local-First Operator Tool (v1) - Implementation Brief

## Objective

Build a local-first sync tool that captures operational updates from authenticated web tools, normalizes records into a shared schema, and uses a local Gemma model (via Ollama) to organize what changed, what matters, and what may be missing.

## Architecture Overview

Use three clear layers:

1. Capture layer (deterministic)
   - Playwright opens or attaches to an authenticated browser context.
   - Navigates to relevant screens.
   - Extracts raw records (rows, threads, cards, timestamps, message text).

2. Normalize layer (deterministic)
   - Cleans captured payloads into a shared record shape.
   - Handles dedupe, hashing, source IDs, and sync checkpoints.

3. Organize layer (AI post-processing)
   - Local Gemma model classifies, clusters, summarizes, and flags missing details.
   - AI only processes cleaned text/records, not raw DOM orchestration.

## Core Principles

- Keep architecture boring and maintainable.
- Deterministic code controls scraping, navigation, checkpoints, and dedupe.
- AI is a post-processor for readability and triage, not the system brain.
- Local-first by default (local API, local DB, local model runner).

## Recommended Stack

- Runtime/language: Node.js + TypeScript
- Browser automation: Playwright
- Local database/state: SQLite
- Local API: Express or Fastify
- Frontend dashboard: React or Next.js
- Local model runner: Ollama
- Model family: Gemma (start small, scale up only if needed)

## Why This Split Works

Deterministic code handles:

- Opening Gmail / Teams / Goodshuffle
- Navigating recent/relevant screens
- Scraping records and timestamps
- Dedupe by source record ID / timestamp / text hash
- Saving sync checkpoints

Gemma handles:

- Categorizing updates
- Extracting event-related fields from messy text
- Drafting short status summaries
- Flagging missing details (for example no contact, no assigned staff, no load-in time)

## Proposed Repo Shape

```text
project/
  apps/
    web/                 # dashboard
    api/                 # local API
    worker/              # sync jobs + parsers
  packages/
    scraper/             # Playwright source adapters
    pipeline/            # normalize + dedupe + transform
    ai/                  # Gemma prompts + structured outputs
    db/                  # SQLite schema and queries
    shared/              # shared types
  docker/
    compose.yaml
```

## Data Model (Initial Tables)

Keep schema minimal for v1.

### `sync_sources`

- `id`
- `name`
- `last_synced_at`
- `last_cursor`
- `last_hash`

### `raw_records`

- `id`
- `source`
- `source_record_id`
- `captured_at`
- `raw_json`
- `raw_text_hash`

### `normalized_records`

- `id`
- `raw_record_id`
- `event_date`
- `location`
- `point_of_contact`
- `assigned_staff`
- `status`
- `notes`
- `updated_at`

### `ai_summaries`

- `id`
- `normalized_record_id`
- `summary`
- `missing_fields`
- `priority`
- `generated_at`

## v1 Scope (First Milestone)

Only build:

- One source adapter
- One sync button
- One last-sync checkpoint flow
- One normalized table
- One "recent changes" screen

Do not start with all channels/sources.

## Browser Strategy

Preferred (lowest friction):

- Attach Playwright to the user's running Chromium browser and inspect already-authenticated tabs.

Alternative:

- Launch a persistent Playwright-managed profile and ask user to sign in once.

Both approaches are valid because Playwright supports persistent contexts and stored auth state.

## Docker Guidance

Use Docker Compose for app services:

- `api`
- `worker`
- `web`
- optional `db`

For v1, do not force the interactive browser into Docker. Keep user's browser outside containers.

## Local Gemma Guidance

Practical flow:

1. Install Ollama
2. Pull a Gemma model
3. Call model from local API/worker
4. Feed cleaned text (not raw DOM noise)

Start with a smaller Gemma variant that is good enough for classification/summarization. Increase model size only if quality gaps are real and repeatable.

## Prompt Jobs for Gemma (Narrow Tasks)

- Classify update into:
  - `event logistics`
  - `staffing`
  - `delivery`
  - `client comms`
  - `venue`
- Extract structured fields
- Produce a 3-line summary
- Flag important missing fields

Do not ask Gemma to browse websites or control browser state.

## Suggested Development Order

1. Define shared types
2. Build SQLite schema
3. Build one Playwright adapter
4. Store raw records
5. Normalize into one common model
6. Add Gemma summary/classification step
7. Build minimal dashboard
8. Add a second source only after source one is stable

## Operational Guideline

For v1, treat AI as a post-processor, not a core orchestrator.

Benefits:

- Scraping failures remain debuggable
- Normalized records stay deterministic
- AI adds organization and readability without coupling to browser control

## Cursor/Codex Hand-off Statement

Build a local-first sync tool.
Use Playwright to read authenticated browser tabs and capture new source records since the last sync.
Store raw records in SQLite.
Normalize them into a shared event/update schema.
Run a local Gemma model through Ollama to classify, summarize, and flag missing details.
Expose results in a lightweight local web app.
Dockerize API, worker, and web app with Docker Compose, but keep the user's browser outside Docker for v1.

## Out of Scope for v1

- Full multi-source rollout at launch
- Browser orchestration by AI agents
- Cloud-first deployment requirements
- Complex workflow automation beyond capture -> normalize -> summarize
