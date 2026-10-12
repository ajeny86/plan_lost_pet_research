# Persona Builder — Priority 1 MVP

Evidence-based UX research workspace for Lost & Found Pets in Lisbon.

## Run the interface

```bash
python3 -m http.server 4173 --directory dist
```

Open `http://127.0.0.1:4173`.

## Configure real AI analysis

The browser never receives an API key. Copy `.env.example` to `.env`, provide an API key for an OpenAI-compatible Responses API, then export the values and run:

```bash
node backend/server.mjs
```

In **Settings**, set the analysis endpoint to `http://127.0.0.1:8787/api/analyze`. The backend rejects unconfigured requests and the interface creates no findings when analysis fails.

## Persistence

Priority 1 records persist in the browser's local storage and can be used without an AI key. Research originals, observations, review decisions, personas and version history are stored separately. This is device-local prototype storage, not a multi-user database.

## Implemented

- Empty research-first workspace and manual proto-personas
- TXT/CSV import, pasted text, and small PDF attachment retention
- Source viewing and exact excerpt capture
- Configurable server-side AI adapter with structured-output validation
- Evidence and grouped-pattern review: approve, edit, reject
- Persona creation and updates from approved patterns
- Persona version history in the stored data model
- Responsive dashboard and navigation matching the approved visual direction

Priority 2 screens are intentionally labelled and contain honest empty states.
