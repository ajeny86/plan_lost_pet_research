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

The GitHub Pages address opens a public classroom demo with synthetic examples and no sign-in. The private hosted workspace remains separate and provides D1 persistence. Live AI analysis is disabled in the public demo; the private workspace uses the separately deployed secure backend. Never place `AI_API_KEY` in browser code, storage or repository files.

## GitHub entry page and older local data

GitHub Actions runs `node scripts/build-public-demo.mjs` and publishes `github-pages/`. The public demo is available at `https://ajeny86.github.io/plan_lost_pet_research/demo/`; the root entry page preserves the requested screen and navigates there. It never redirects classroom visitors to ChatGPT sign-in. The private workspace is still available at `https://persona-atlas.rightotter16.chatgpt.site/` with its existing access restrictions.

The demo uses six independently authored fictional interview scenarios, prepared observations, grouped patterns, three personas, relationship hypotheses and a solution hypothesis. These are explicitly labelled synthetic examples, not results of live AI analysis. The demo blocks API requests, never calls the private state endpoint and uses its own browser storage key. Changes by one visitor do not affect classmates or the private workspace. Reset my demo restores only the synthetic examples.

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
- Public classroom changes are browser-local and do not sync to the private D1 database. Live AI calls are disabled there to prevent unauthenticated use of the private backend.
- Public-source retrieval works only for accessible text pages and does not bypass logins or access restrictions.
- Automatic duplicate detection, journey maps and user-story generation remain future work.
