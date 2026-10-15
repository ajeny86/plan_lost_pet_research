# Persona Builder — University Prototype

Evidence-based UX research workspace for Lost & Found Pets in Lisbon.

## Run the full application

```bash
pnpm install
pnpm run dev
```

The hosted application uses a Sites D1 database. Local preview uses a separate local D1 instance.

## Configure real AI analysis

The browser never receives an API key. Copy `.env.example` to `.env`, provide an API key for an OpenAI-compatible Responses API, then export the values and run:

```bash
node backend/server.mjs
```

In **Settings**, set the analysis endpoint to `http://127.0.0.1:8787/api/analyze`. The backend rejects unconfigured requests and the interface creates no findings when analysis fails.

The GitHub Pages address opens the primary hosted workspace, which provides D1 persistence and sign-in. Both entry links therefore lead to the same application and database. AI analysis remains on the separately deployed secure backend. Never place `AI_API_KEY` in `public`, browser storage or repository files.

## GitHub entry page and older local data

GitHub Actions publishes `github-pages/` as an entry page, rather than a second application. It preserves the requested screen (`#research`, `#analysis`, `#personas`, etc.) when navigating to the shared Site. New browsers continue automatically; the target Site enforces sign-in and workspace access.

If the old GitHub application has research work saved in the current browser, the entry page pauses and offers a complete JSON backup before continuing. It never clears, uploads or replaces that local copy. The backup uses the existing Settings import/export format. Review backups before restoring: importing a full backup replaces the active workspace; it is not an automatic merge. The `?stay=1` parameter displays the entry page without automatic navigation.

## Persistence

The primary hosted Site stores the complete research workspace in a shared D1 database. Browser local storage remains as a device-level safety copy. On first launch after the database upgrade, existing browser-local records are migrated into D1 automatically. Subsequent changes are version-checked before saving so an older browser tab cannot silently overwrite a newer cloud revision.

The workspace state includes research originals, observations, patterns, review decisions, personas, relationship maps, solution hypotheses and version history. Uploaded binary attachments remain subject to the prototype repository-size limit.

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
- Shared cross-device D1 persistence with first-run migration from browser storage
- Dashboard workflow guidance with live counts and direct links to the next required review step

Test template images are illustrative and never treated as research participants. Empty fields remain explicitly unknown until a researcher adds supported information.

## Known prototype limits

- PDF attachments are retained, but the researcher must paste extracted text before analysis.
- GitHub Pages is an entry link to the primary Site. It does not run a second database or independent application.
- Public-source retrieval works only for accessible text pages and does not bypass logins or access restrictions.
- Automatic duplicate detection, journey maps and user-story generation remain future work.
