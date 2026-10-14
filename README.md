# Persona Builder — University Prototype

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

The public GitHub Pages build is static and cannot run this backend. For a public AI demonstration, deploy `backend/server.mjs` to a server-side host, configure the environment variables there, set `ALLOWED_ORIGIN` to the public frontend origin, and enter the deployed `/api/analyze` URL in Settings. Never place `AI_API_KEY` in `dist`, browser storage or repository files.

## Persistence

Records persist in the browser's local storage and can be used without an AI key. Research originals, observations, review decisions, personas and version history are stored separately. This is device-local prototype storage, not a multi-user database.

## Implemented

- Empty research-first workspace plus three clearly labelled visual test templates
- TXT/CSV import, pasted text, bulk record splitting, and small PDF attachment retention
- Structured lost/found report metadata, optional image attachments and revision preservation
- Survey CSV row/column summaries labelled as descriptive convenience-sample counts
- On-demand public URL extraction/refresh through the backend, with prior content preserved
- Source metadata editing and possible-duplicate flags
- Source viewing and exact excerpt capture
- Configurable server-side AI adapter with structured-output validation
- AI pattern proposals require at least two observations from two independent sources
- Evidence and grouped-pattern review: approve, edit, reject
- Pattern merge/split and threshold-based persona proposals
- Persona creation and updates from approved patterns, with evidence-aware sections
- Persona version history with evidence links and restore-as-new-version controls
- Full behavioural persona comparison, evidence-linked connections/gaps, and solution hypotheses
- JSON repository backup and restore for moving browser-local data between devices
- Responsive dashboard and navigation matching the approved visual direction

Test template images are illustrative and never treated as research participants. Empty fields remain explicitly unknown until a researcher adds supported information.

## Known prototype limits

- PDF attachments are retained, but the researcher must paste extracted text before analysis.
- Browser storage is persistent only on the current browser profile. Use JSON backup for portability.
- Public-source retrieval works only for accessible text pages and does not bypass logins or access restrictions.
- Automatic duplicate detection, journey maps and user-story generation remain future work.
