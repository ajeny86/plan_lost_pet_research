/* Requirements upgrade: structured source metadata, fuller provenance and persona version control. */
(() => {
  const MISSING_SOURCE_VALUE = 'Not found in source — please verify';
  const originalBindDynamic = bindDynamic;
  const originalOpenPersonaDetails = openPersonaDetails;
  const originalOpenPersonaForm = openPersonaForm;
  const originalPersonas = personas;

  state.analysisArchives ??= [];
  state.personaUpdates ??= [];
  state.deletedTemplateIds ??= ['test-owner'];
  let templatePendingDeletion = null;

  function purgePersonaArtifacts(personaId, personaName = '') {
    state.personaUpdates = (state.personaUpdates || []).filter(item => item.personaId !== personaId);
    state.gaps = (state.gaps || []).filter(item => !(item.personaIds || []).includes(personaId));
    state.solutions = (state.solutions || []).filter(item => !(item.personaIds || []).includes(personaId));
    state.proposals = (state.proposals || []).filter(item => item.personaId !== personaId && !(item.personaIds || []).includes(personaId));
    (state.patterns || []).forEach(pattern => { pattern.affectedPersonaIds = (pattern.affectedPersonaIds || []).filter(id => id !== personaId); });
    (state.analysisArchives || []).forEach(archive => { archive.personaEvidenceLinks = (archive.personaEvidenceLinks || []).filter(item => item.personaId !== personaId); });
    if (personaName) state.activity = (state.activity || []).filter(item => !String(item.action || '').includes(personaName));
  }

  for (const deletedId of state.deletedTemplateIds) purgePersonaArtifacts(deletedId, TEST_PERSONAS.find(item => item.id === deletedId)?.name || '');
  save();

  function uniqueStatements(items) {
    const seen = new Set();
    return (items || []).map(item => String(item).trim()).filter(item => {
      const key = item.toLowerCase().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Approval may attach a new observation to an AI-matched existing pattern,
  // but never creates a one-observation pattern.
  groupApprovedObservations = function () {
    state.observations.filter(observation => observation.status === 'approved' && observation.suggestedPatternId && !observation.patternMatchApplied).forEach(observation => {
      const pattern = state.patterns.find(item => item.id === observation.suggestedPatternId && item.status !== 'rejected');
      if (!pattern) return;
      pattern.observationIds = [...new Set([...(pattern.observationIds || []), observation.id])];
      pattern.reviewState = 'edited';
      pattern.history ??= [];
      pattern.history.unshift({ action: 'Approved matching observation added to existing pattern', at: now(), observationIds: [observation.id] });
      observation.patternMatchApplied = true;
    });
  };

  const researchDialogBody = $('#researchForm .dialog-body');
  $('#sourceUrl').closest('label').insertAdjacentHTML('afterend', `
    <section class="source-metadata-fields" aria-label="Case metadata">
      <div class="source-metadata-heading"><b>Report metadata</b><span>Use Unknown when the source does not say.</span></div>
      <div class="field-row">
        <label>Report status<select id="reportStatus"><option>Unknown</option><option>Lost</option><option>Found</option><option>Sighted</option></select></label>
        <label>Level of involvement<select id="involvement"><option>Unknown</option><option>Quick</option><option>Active</option><option>Temporary Care</option></select></label>
      </div>
      <div class="field-row">
        <label>Animal type<input id="animalType" placeholder="Unknown"></label>
        <label>Lisbon location<input id="sourceLocation" placeholder="Unknown"></label>
      </div>
      <div class="field-row">
        <label>Incident date (YYYY-MM-DD)<input id="incidentDate" type="text" inputmode="numeric" placeholder="YYYY-MM-DD"></label>
        <label>Publication date (YYYY-MM-DD)<input id="publicationDate" type="text" inputmode="numeric" placeholder="YYYY-MM-DD"></label>
      </div>
      <label>Known outcome<input id="caseOutcome" placeholder="Unknown"></label>
      <label>Relevant comments or updates<textarea id="sourceUpdates" rows="3" placeholder="Unknown"></textarea></label>
      <label class="custom-file-field">Optional photograph or screenshot<span class="custom-file-control"><span class="custom-file-button">Choose file</span><span id="sourceImageName">No file selected</span></span><input id="sourceImage" class="native-file-input" type="file" accept="image/png,image/jpeg,image/webp"></label>
    </section>
  `);
  researchDialogBody.insertAdjacentHTML('beforeend', `
    <label class="privacy-check"><input id="privacyConfirmed" type="checkbox"> I checked this material for names, phone numbers and private addresses. Common email and phone formats will also be redacted before storage.</label>
  `);
  $('#researchForm .dialog-actions').insertAdjacentHTML('afterbegin', '<p class="form-error" id="researchFormError" role="alert" aria-live="polite" hidden></p>');
  $('#researchForm').noValidate = true;

  function researchFormError(message = '', field = null) {
    const error = $('#researchFormError');
    error.textContent = message;
    error.hidden = !message;
    if (message) {
      toast(message);
      field?.focus();
    }
    return false;
  }

  $('#personaStatus').closest('label').insertAdjacentHTML('afterend', `
    <label class="persona-evidence-field">Supporting approved patterns<span>These are the reviewed patterns that will remain traceable from the saved persona.</span><div id="personaEvidencePatternCards" class="persona-evidence-patterns"></div><select id="personaEvidencePatterns" multiple hidden aria-hidden="true"></select></label>
  `);

  $('#solutionStatus').closest('label').insertAdjacentHTML('afterend', `
    <label>Relevant personas<span class="field-help">Choose every persona affected by this hypothesis. Demonstration profiles remain clearly marked as test personas.</span><select id="solutionPersonas" multiple size="4"></select></label>
  `);

  $('#settingsForm .dialog-body').insertAdjacentHTML('beforeend', `
    <section class="data-portability">
      <b>Research repository backup</b>
      <p class="form-note">Export a JSON backup before moving to another browser or computer.</p>
      <div class="review-actions"><button type="button" class="secondary" id="exportBackupBtn">Export backup</button><label class="secondary import-backup-label">Import backup<input id="importBackupFile" type="file" accept="application/json"></label></div>
    </section>
  `);

  function value(id, fallback = 'Unknown') {
    const item = $(`#${id}`);
    return item?.value?.trim() || fallback;
  }

  function redactPersonalData(text = '') {
    return String(text)
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email removed]')
      .replace(/(?:\+?\d[\s().-]*){8,}/g, '[phone removed]')
      .replace(/\b(?:Rua|Avenida|Av\.|Travessa|Praça)\s+[^\n,]{3,80},?\s*\d+[A-Za-z-]*\b/gi, '[private address removed]');
  }

  function parseCsvSummary(text = '') {
    const rows = text.split(/\r?\n/).filter(row => row.trim());
    if (!rows.length) return null;
    const columns = rows[0].split(',').map(item => item.trim().replace(/^"|"$/g, ''));
    return { responseCount: Math.max(0, rows.length - 1), columns, note: 'Descriptive count from the imported convenience sample. Not a population estimate.' };
  }

  function metadataFromForm() {
    return {
      reportStatus: value('reportStatus'),
      involvement: value('involvement'),
      animalType: value('animalType'),
      location: value('sourceLocation'),
      incidentDate: value('incidentDate'),
      publicationDate: value('publicationDate'),
      outcome: value('caseOutcome'),
      updates: value('sourceUpdates'),
    };
  }

  function isMissingValue(value) {
    return !value || value === 'Unknown' || value === MISSING_SOURCE_VALUE;
  }

  async function extractMetadataFromSource(record) {
    const endpoint = String(state.settings.endpoint || PUBLIC_AI_ENDPOINT).replace(/\/api\/analyze\/?$/, '/api/extract-metadata');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: { id: record.participantId, type: record.type, content: record.content } }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Metadata extraction returned ${response.status}`);
    const fields = data.metadata || {};
    const allowed = {
      participantRole: ['Owner', 'Finder', 'Spotter', 'Volunteer', 'Other'],
      reportStatus: ['Lost', 'Found', 'Sighted'],
      involvement: ['Quick', 'Active', 'Temporary Care'],
    };
    const result = { metadataEvidence: {} };
    for (const key of ['participantRole', 'reportStatus', 'involvement', 'animalType', 'location', 'incidentDate', 'publicationDate', 'outcome', 'updates']) {
      let extracted = fields[key]?.value;
      if (allowed[key] && !allowed[key].includes(extracted)) extracted = null;
      result[key] = extracted || MISSING_SOURCE_VALUE;
      if (extracted && fields[key]?.excerpt) result.metadataEvidence[key] = fields[key].excerpt;
    }
    return result;
  }

  function fillMetadata(record = {}) {
    $('#reportStatus').value = record.reportStatus === MISSING_SOURCE_VALUE ? 'Unknown' : record.reportStatus || 'Unknown';
    $('#involvement').value = record.involvement === MISSING_SOURCE_VALUE ? 'Unknown' : record.involvement || 'Unknown';
    $('#animalType').value = record.animalType === 'Unknown' ? '' : record.animalType || '';
    $('#sourceLocation').value = record.location === 'Unknown' ? '' : record.location || '';
    $('#incidentDate').value = record.incidentDate === 'Unknown' ? '' : record.incidentDate || '';
    $('#publicationDate').value = record.publicationDate === 'Unknown' ? '' : record.publicationDate || '';
    $('#caseOutcome').value = record.outcome === 'Unknown' ? '' : record.outcome || '';
    $('#sourceUpdates').value = record.updates === 'Unknown' ? '' : record.updates || '';
  }

  openResearch = function (sid = null) {
    $('#researchForm').reset();
    researchFormError();
    $('#sourceFileName').textContent = 'No file selected';
    $('#sourceImageName').textContent = 'No file selected';
    $('#researchForm').dataset.editId = sid || '';
    $('#sourceDate').value = new Date().toISOString().slice(0, 10);
    const record = sid ? source(sid) : null;
    if (record) {
      $('#sourceType').value = record.type;
      $('#sourceTitle').value = record.title;
      $('#sourceDate').value = record.date === 'Unknown' ? '' : record.date;
      $('#participantId').value = record.participantId === 'Unknown' ? '' : record.participantId;
      $('#participantRole').value = record.participantRole || 'Unknown';
      $('#sourceUrl').value = record.url || '';
      $('#sourceContent').value = record.content || '';
      fillMetadata(record);
      $('#privacyConfirmed').checked = true;
    }
    show('#researchDialog');
  };

  saveResearch = async function (event) {
    event.preventDefault();
    researchFormError();
    if (!$('#sourceTitle').value.trim()) return researchFormError('Add a short title for this research source.', $('#sourceTitle'));
    if (!$('#privacyConfirmed').checked) return researchFormError('Confirm that you checked the material for personal information before saving.', $('#privacyConfirmed'));
    const file = $('#sourceFile').files[0];
    const image = $('#sourceImage').files[0];
    if (file?.size > 1_500_000 || image?.size > 1_500_000) return researchFormError('Each attachment must be smaller than 1.5 MB.', file?.size > 1_500_000 ? $('#sourceFile') : $('#sourceImage'));
    let content = $('#sourceContent').value.trim();
    let fileData = null;
    let imageData = null;
    if (file) {
      if (file.type === 'application/pdf') {
        fileData = await fileToData(file);
        if (!content) return researchFormError('Paste the PDF text before saving so it can be analysed.', $('#sourceContent'));
      } else if (!content) content = await file.text();
    }
    if (image) imageData = await fileToData(image);
    if (!content && !file) return researchFormError('Add pasted content or upload a TXT, CSV or PDF file.', $('#sourceContent'));
    const redacted = redactPersonalData(content);
    let record = {
      type: $('#sourceType').value,
      title: $('#sourceTitle').value.trim(),
      date: value('sourceDate'),
      participantId: value('participantId'),
      participantRole: $('#participantRole').value,
      url: $('#sourceUrl').value.trim(),
      fileName: file?.name || '',
      fileType: file?.type || '',
      fileData,
      imageData,
      ...metadataFromForm(),
      content: redacted,
      processed: false,
      surveySummary: $('#sourceType').value === 'Survey' && (file?.type === 'text/csv' || file?.name?.endsWith('.csv')) ? parseCsvSummary(redacted) : null,
    };
    const missingFields = ['participantRole', 'reportStatus', 'involvement', 'animalType', 'location', 'incidentDate', 'publicationDate', 'outcome', 'updates'].filter(key => isMissingValue(record[key]));
    if (missingFields.length && redacted) {
      const saveButton = $('#saveResearchBtn');
      saveButton.disabled = true;
      saveButton.textContent = 'Reading source…';
      try {
        const extracted = await extractMetadataFromSource(record);
        record.metadataEvidence = extracted.metadataEvidence;
        for (const key of missingFields) record[key] = extracted[key];
        record.metadataExtraction = { status: 'complete', at: now(), method: 'AI source extraction' };
      } catch (error) {
        for (const key of missingFields) record[key] = MISSING_SOURCE_VALUE;
        record.metadataExtraction = { status: 'unavailable', at: now(), error: error.message };
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Save source';
      }
    }
    const normalizedUrl = record.url.replace(/\/$/, '').toLowerCase();
    const normalizedContent = redacted.replace(/\s+/g, ' ').trim().toLowerCase();
    const possibleDuplicate = state.research.find(item => {
      if (event.target.dataset.editId && item.id === event.target.dataset.editId) return false;
      const sameUrl = normalizedUrl && String(item.url || '').replace(/\/$/, '').toLowerCase() === normalizedUrl;
      const itemContent = String(item.content || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const sameContent = normalizedContent.length > 80 && itemContent === normalizedContent;
      return sameUrl || sameContent;
    });
    const editId = event.target.dataset.editId;
    if (editId) {
      const existing = source(editId);
      if (!existing) return researchFormError('This source could not be found. Close the form and try again.');
      if (existing.content !== redacted) {
        existing.previousContents ??= [];
        existing.previousContents.unshift({ content: existing.content, at: now(), reason: 'Researcher edited imported content' });
      }
      Object.assign(existing, record, { imported: existing.imported, metadataUpdated: now(), duplicateStatus: possibleDuplicate ? `possible:${possibleDuplicate.id}` : 'checked' });
      log(`Updated source metadata: ${existing.title}`);
      save(); closeDialogs(); render(); go('research'); toast('Source updated; original revision preserved');
      return;
    }
    const parts = $('#bulkMode').checked ? redacted.split(/^---\s*$/m).map(item => item.trim()).filter(Boolean) : [redacted];
    parts.forEach((part, index) => state.research.unshift({
      id: id('src'), ...record, content: part, imported: now(),
      title: parts.length > 1 ? `${record.title} · ${index + 1}` : record.title,
      participantId: parts.length > 1 ? `${record.participantId}-${index + 1}` : record.participantId,
      duplicateStatus: possibleDuplicate ? `possible:${possibleDuplicate.id}` : 'checked',
    }));
    log(`Added ${parts.length} research source${parts.length === 1 ? '' : 's'}`);
    save(); closeDialogs(); render(); go('research');
    toast(possibleDuplicate ? `Saved, but it may duplicate “${possibleDuplicate.title}”` : redacted !== content ? 'Source saved with personal contact details redacted' : `${parts.length} original source${parts.length === 1 ? '' : 's'} saved`);
  };

  editSource = sid => openResearch(sid);

  saveObservation = function (event) {
    event.preventDefault();
    const sourceRecord = source($('#observationSourceId').value);
    const excerpt = $('#observationExcerpt').value.trim();
    if (!sourceRecord || !excerpt || !String(sourceRecord.content || '').includes(excerpt)) {
      return toast('The excerpt must match the original source exactly');
    }
    const observation = { id: id('obs'), sourceId: sourceRecord.id, dimension: $('#observationDimension').value, text: $('#observationText').value.trim(), excerpt, evidenceType: $('#observationEvidenceType').value, status: 'pending', origin: 'manual', created: now(), reviewNote: '' };
    state.observations.unshift(observation);
    log('Added an exact source-linked observation for review');
    save(); closeDialogs(); render(); go('analysis'); toast('Observation saved for human review');
  };

  openSource = function (sid) {
    const record = source(sid);
    if (!record) return;
    activeSource = sid;
    const metadata = [
      ['Report', record.reportStatus], ['Involvement', record.involvement], ['Animal', record.animalType],
      ['Location', record.location], ['Incident', record.incidentDate], ['Published', record.publicationDate], ['Outcome', record.outcome],
    ].map(([key, val]) => [key, val && val !== 'Unknown' ? val : MISSING_SOURCE_VALUE]);
    $('#sourceDialogTitle').textContent = record.title;
    $('#sourceDialogBody').innerHTML = `<div>
      <span class="status ${record.processed ? 'approved' : 'pending'}">${record.processed ? 'Analysed' : 'Not analysed'}</span>
      <p class="meta">${esc(record.type)} · ${esc(record.participantId)} · role ${esc(record.participantRole)} · ${esc(record.date)}</p>
      <dl class="source-metadata-list">${metadata.map(([key, val]) => `<div class="${val === MISSING_SOURCE_VALUE ? 'metadata-missing' : ''}"><dt>${esc(key)}</dt><dd>${esc(val)}</dd>${record.metadataEvidence?.[({Report:'reportStatus',Involvement:'involvement',Animal:'animalType',Location:'location',Incident:'incidentDate',Published:'publicationDate',Outcome:'outcome'})[key]] ? `<small title="Exact source excerpt">Source-backed</small>` : ''}</div>`).join('')}</dl>
      ${record.metadataExtraction?.status === 'unavailable' ? '<div class="notice neutral">Automatic metadata extraction was unavailable when this source was saved. Missing fields are marked for verification.</div>' : ''}
      ${record.surveySummary ? `<div class="notice neutral"><b>${record.surveySummary.responseCount} imported survey response(s)</b><br>Columns: ${esc(record.surveySummary.columns.join(', '))}<br>${esc(record.surveySummary.note)}</div>` : ''}
      ${record.url ? `<p><a href="${esc(record.url)}" target="_blank" rel="noreferrer">Open original webpage ↗</a></p>` : ''}
      ${record.imageData ? `<img class="source-attachment-image" src="${record.imageData}" alt="Imported source attachment">` : ''}
      <div class="source-original">${esc(record.content || 'No text preview.')}</div>
      ${record.updates && record.updates !== 'Unknown' && record.updates !== MISSING_SOURCE_VALUE ? `<section class="source-updates"><b>Comments and updates</b><p>${esc(record.updates)}</p></section>` : ''}
      ${record.fileName ? `<p class="meta">Attachment: ${esc(record.fileName)}</p>` : ''}
      ${record.previousContents?.length ? `<details class="source-revisions"><summary>Previous source revisions (${record.previousContents.length})</summary>${record.previousContents.map(item => `<div><b>${day(item.at)}</b><pre>${esc(item.content)}</pre></div>`).join('')}</details>` : ''}
    </div>`;
    show('#sourceDialog');
    const fieldsToComplete = ['participantRole', 'reportStatus', 'involvement', 'animalType', 'location', 'incidentDate', 'publicationDate', 'outcome', 'updates'].filter(key => isMissingValue(record[key]));
    if (fieldsToComplete.length && record.content && !record.metadataExtraction) {
      const progress = document.createElement('div');
      progress.className = 'notice neutral metadata-progress';
      progress.textContent = 'Reading the source to complete missing metadata…';
      $('#sourceDialogBody').prepend(progress);
      extractMetadataFromSource(record).then(extracted => {
        record.metadataEvidence = extracted.metadataEvidence;
        for (const key of fieldsToComplete) record[key] = extracted[key];
        record.metadataExtraction = { status: 'complete', at: now(), method: 'AI source extraction' };
        save(); render(); openSource(sid);
        toast('Missing metadata checked against the source');
      }).catch(error => {
        for (const key of fieldsToComplete) record[key] = MISSING_SOURCE_VALUE;
        record.metadataExtraction = { status: 'unavailable', at: now(), error: error.message };
        save(); render(); openSource(sid);
        toast('Metadata could not be extracted; missing fields were marked for verification');
      });
    }
  };

  comparePersonas = function () {
    const ids = $$('[data-compare]:checked').map(item => item.dataset.compare);
    if (ids.length < 2) return toast('Select at least two personas');
    const list = ids.map(item => state.personas.find(persona => persona.id === item));
    const rows = [
      ['Role', persona => persona.role], ['Main goal', persona => persona.goal],
      ['Behaviours', persona => (persona.behaviours || []).join(' · ')], ['Motivations', persona => (persona.motivations || []).join(' · ')],
      ['Constraints', persona => (persona.constraints || []).join(' · ')], ['Pain points', persona => (persona.painPoints || []).join(' · ')],
      ['Needs', persona => (persona.needs || []).join(' · ')],
      ['Validation', persona => persona.template ? 'Test template' : persona.status],
      ['Supporting patterns', persona => (persona.patternIds || []).map(patternId => state.patterns.find(pattern => pattern.id === patternId)?.title).filter(Boolean).join(' · ') || 'No linked evidence'],
    ];
    $('#comparisonPanel').innerHTML = `<section class="comparison"><div class="section-label"><h2>Persona comparison</h2><span>${list.length} selected</span></div><div class="compare-table" style="grid-template-columns:150px repeat(${list.length},minmax(190px,1fr))"><b>Attribute</b>${list.map(persona => `<b>${esc(persona.name)}</b>`).join('')}${rows.map(([label, getter]) => `<span>${label}</span>${list.map(persona => `<div>${esc(getter(persona) || 'Insufficient evidence')}</div>`).join('')}`).join('')}</div></section>`;
    $('#comparisonPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  proposals = function () {
    const unclassified = state.observations.filter(observation => observation.status === 'approved' && !state.patterns.some(pattern => pattern.observationIds.includes(observation.id)));
    $('#proposalSummary').innerHTML = `<b>${unclassified.length} unclassified insight(s).</b> The exploratory threshold is ${state.settings.proposalThreshold} independent cases. A threshold creates a review prompt, never a validated persona.`;
    $('#proposalList').innerHTML = state.proposals.length ? state.proposals.map(proposal => {
      const patterns = proposal.patternIds.map(patternId => state.patterns.find(pattern => pattern.id === patternId)).filter(Boolean);
      const evidence = patterns.flatMap(pattern => pattern.observationIds.map(observationId => obs(observationId))).filter(Boolean);
      return `<article class="pattern-card"><span class="status ${proposal.status}">${esc(proposal.status)}</span><div class="card-title">${esc(proposal.title)}</div><p>${esc(proposal.summary)}</p><div class="meta">${proposal.patternIds.length} supporting pattern(s) · ${proposal.sourceCount} independent source(s)</div><details class="proposal-evidence"><summary>Review supporting evidence</summary>${evidence.map(item => `<button data-source="${item.sourceId}">“${esc(item.excerpt)}”</button>`).join('')}</details>${proposal.status === 'pending' ? `<div class="review-actions"><button class="tiny" data-accept-proposal="${proposal.id}">Create editable draft</button><button class="tiny" data-assign-proposal="${proposal.id}">Assign to existing persona</button><button class="tiny" data-reject-proposal="${proposal.id}">Reject</button></div>` : ''}</article>`;
    }).join('') : empty('No proposed personas', 'Suggestions appear only when reviewed evidence crosses the exploratory threshold.');
    bindDynamic();
  };

  async function assignProposalToPersona(proposalId) {
    const candidates = state.personas.filter(persona => !persona.template);
    if (!candidates.length) return toast('Create an evidence-based persona first');
    const answer = await requestText('Assign proposal to persona', `Enter a number: ${candidates.map((persona, index) => `${index + 1}. ${persona.name}`).join(' · ')}`, '1');
    const persona = candidates[Number(answer) - 1];
    const proposal = state.proposals.find(item => item.id === proposalId);
    if (!persona || !proposal) return;
    const previousPatternIds = [...(persona.patternIds || [])];
    persona.patternIds = [...new Set([...previousPatternIds, ...proposal.patternIds])];
    persona.history ??= [];
    persona.history.unshift({ version: persona.version, values: { name: persona.name, role: persona.role, goal: persona.goal, status: persona.status, behaviours: persona.behaviours || [], motivations: persona.motivations || [], constraints: persona.constraints || [], painPoints: persona.painPoints || [], needs: persona.needs || [], patternIds: previousPatternIds }, reason: `Assigned evidence from proposal: ${proposal.title}`, changed: now(), origin: 'proposal review', evidencePatternIds: proposal.patternIds });
    persona.version += 1; proposal.status = 'assigned';
    log(`Assigned proposal evidence to ${persona.name}`); save(); render(); toast('Evidence assigned to the existing persona');
  }

  function relationshipTypeClass(type) {
    return type === 'Shared Pattern' ? 'connection' : type === 'Behavioural Gap' ? 'behaviour-gap' : 'information-gap';
  }

  function relationshipMap() {
    const personas = state.personas;
    const visible = state.gaps.filter(gap => gap.status !== 'rejected');
    const mappedPatternIds = new Set(state.gaps.flatMap(gap => gap.patternIds || []));
    const unmappedPatterns = state.patterns.filter(pattern => pattern.status === 'approved' && !mappedPatternIds.has(pattern.id));
    const personaById = new Map(personas.map(persona => [persona.id, persona]));
    const routes = visible.map(gap => {
      const linked = (gap.personaIds || []).map(personaId => personaById.get(personaId)).filter(Boolean).map(persona => ({ ...persona, role: persona.template ? `Test persona · ${persona.role}` : persona.role }));
      const nodes = linked.length ? linked : [{ name: 'Persona not assigned', role: 'Select a persona in the card' }];
      const destination = nodes.length > 1 ? nodes.slice(1) : [{ name: 'Evidence still needed', role: 'Add another persona or supporting pattern' }];
      const kind = relationshipTypeClass(gap.type);
      const marker = kind === 'connection' ? '✓' : kind === 'information-gap' ? '!' : '≠';
      const stateLabel = kind === 'connection' ? 'Connection' : kind === 'information-gap' ? 'Break in information flow' : 'Different behaviour';
      return `<button class="relationship-route ${kind}" data-gap-focus="${gap.id}"><span class="relationship-node"><span class="relationship-node-icon">◎</span><span><b>${esc(nodes[0].name)}</b><small>${esc(nodes[0].role)}</small></span></span><span class="relationship-connector"><span class="relationship-caption"><b>${esc(stateLabel)}</b><small>${esc(gap.title || 'Not enough information')}</small></span><span class="relationship-line"><i></i><em>${marker}</em><i></i></span></span><span class="relationship-destinations">${destination.map(persona => `<span class="relationship-node"><span class="relationship-node-icon">◎</span><span><b>${esc(persona.name)}</b><small>${esc(persona.role)}</small></span></span>`).join('')}</span></button>`;
    }).join('');
    const updateNotice = unmappedPatterns.length ? `<div class="map-update-notice"><span class="map-update-icon">+</span><span><b>New evidence available</b><small>${unmappedPatterns.length} approved pattern${unmappedPatterns.length===1?' is':'s are'} not yet represented in this diagram. Review the evidence and confirm a relationship before the map changes.</small></span><button class="secondary" type="button" data-map-update>Update map</button></div>` : '';
    $('#gapMap').innerHTML = `<section class="relationship-map"><div class="relationship-map-head"><div><span class="eyebrow">PERSONA RELATIONSHIP FLOW</span><h2>How information and behaviour connect</h2><p>Choose one or more flow types, then follow their arrows between personas. Select any route to inspect the supporting evidence.</p><button class="secondary mobile-flow-toggle" type="button" data-flow-toggle aria-expanded="false">Show flow diagram</button></div></div>${updateNotice}<div class="relationship-map-controls"><button class="flow-overview active" data-flow-filter="all"><b>Overview</b><small>Show every relationship type</small></button><div class="relationship-filter-group"><span>Select one or more</span><div class="relationship-legend" role="group" aria-label="Filter relationship flow"><button class="connection" data-flow-filter="connection" aria-pressed="false">Connections</button><button class="information-gap" data-flow-filter="information-gap" aria-pressed="false">Information gaps</button><button class="behaviour-gap" data-flow-filter="behaviour-gap" aria-pressed="false">Behavioural gaps</button></div></div></div><div class="relationship-flow-canvas">${routes||`<div class="relationship-empty"><b>No relationships mapped yet</b><p>Add a connection or gap to draw the first flow between personas.</p></div>`}<div class="relationship-filter-empty" hidden><b>No arrows of this type yet</b><span>Create a relationship card or choose another flow type.</span></div></div></section>`;
    const mapUpdate = $('[data-map-update]');
    if (mapUpdate) mapUpdate.onclick = () => openGap();
    const flowToggle = $('[data-flow-toggle]');
    if (flowToggle) flowToggle.onclick = () => {
      const map = flowToggle.closest('.relationship-map');
      const expanded = map.classList.toggle('mobile-flow-open');
      flowToggle.setAttribute('aria-expanded', String(expanded));
      flowToggle.textContent = expanded ? 'Hide flow diagram' : 'Show flow diagram';
    };
    const activeFlowFilters = new Set();
    $$('[data-flow-filter]').forEach(filter => filter.onclick = () => {
      const selected = filter.dataset.flowFilter;
      const overview = $('[data-flow-filter="all"]');
      if (selected === 'all') {
        activeFlowFilters.clear();
        overview.classList.add('active');
        $$('.relationship-legend [data-flow-filter]').forEach(item => { item.classList.remove('active'); item.setAttribute('aria-pressed', 'false'); });
      } else {
        if (activeFlowFilters.has(selected)) activeFlowFilters.delete(selected); else activeFlowFilters.add(selected);
        filter.classList.toggle('active', activeFlowFilters.has(selected));
        filter.setAttribute('aria-pressed', String(activeFlowFilters.has(selected)));
        const individualFilters = $$('.relationship-legend [data-flow-filter]');
        if (activeFlowFilters.size === individualFilters.length) {
          activeFlowFilters.clear();
          individualFilters.forEach(item => { item.classList.remove('active'); item.setAttribute('aria-pressed', 'false'); });
          overview.classList.add('active');
        } else {
          overview.classList.toggle('active', activeFlowFilters.size === 0);
        }
      }
      let shown = 0;
      $$('.relationship-route').forEach(route => {
        const visibleForFilter = activeFlowFilters.size === 0 || [...activeFlowFilters].some(type => route.classList.contains(type));
        route.hidden = !visibleForFilter;
        if (visibleForFilter) shown += 1;
      });
      const emptyState = $('.relationship-filter-empty');
      if (emptyState) emptyState.hidden = shown > 0;
    });
    $$('[data-gap-focus]').forEach(button => button.onclick = () => {
      const card = $(`#gap-${button.dataset.gapFocus}`);
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('evidence-pattern-focus');
      setTimeout(() => card.classList.remove('evidence-pattern-focus'), 2200);
    });
  }

  gaps = function () {
    const missing = 'Not enough information';
    $('#gapCount').textContent = state.gaps.length;
    relationshipMap();
    $('#gapList').innerHTML = state.gaps.length ? state.gaps.map(gap => {
      const patterns = (gap.patternIds || []).map(patternId => state.patterns.find(pattern => pattern.id === patternId)).filter(Boolean);
      const personas = (gap.personaIds || []).map(personaId => state.personas.find(persona => persona.id === personaId)).filter(Boolean);
      const evidence = patterns.flatMap(pattern => pattern.observationIds.map(observationId => obs(observationId))).filter(Boolean);
      const title = gap.title || missing;
      const meaning = gap.text || `${missing} — expected: an explanation of how this relationship affects the selected personas or their journey.`;
      const personaText = personas.length ? personas.map(persona => persona.name).join(' · ') : `${missing} — expected: at least one related persona.`;
      const patternText = patterns.length ? patterns.map(pattern => pattern.title).join('; ') : `${missing} — expected: one or more approved grouped patterns.`;
      return `<article class="pattern-card relationship-card ${relationshipTypeClass(gap.type)}" id="gap-${gap.id}"><div class="relationship-card-head"><span class="relationship-type">${esc(gap.type)}</span><span class="status ${gap.status}">${esc(gap.status)}</span></div><div class="relationship-personas"><b>Personas</b><span>${esc(personaText)}</span></div><div class="card-title">${esc(title)}</div><p>${esc(meaning)}</p><div class="relationship-field ${patterns.length?'':'missing-field'}"><b>Supporting grouped patterns</b><span>${esc(patternText)}</span></div>${evidence.length?`<details class="proposal-evidence"><summary>View ${evidence.length} source observation${evidence.length===1?'':'s'}</summary>${evidence.map(item => `<button data-source="${item.sourceId}">“${esc(item.excerpt)}”</button>`).join('')}</details>`:'<p class="relationship-expectation">Expected next: link approved evidence or keep this clearly marked as a manual hypothesis.</p>'}<div class="review-actions">${gap.status === 'pending' ? `<button class="tiny" data-review-gap="${gap.id}" data-result="approved">Approve</button>` : ''}<button class="tiny" data-edit-gap="${gap.id}">Edit</button>${gap.status === 'pending' ? `<button class="tiny" data-review-gap="${gap.id}" data-result="rejected">Reject</button>` : ''}</div></article>`;
    }).join('') : empty('No connections or gaps', 'Add a manual relationship or link approved persona evidence.');
    bindDynamic();
  };

  async function editGap(gapId) {
    openGap(gapId);
  }

  openSolution = function (solutionId = null) {
    const evidence = [
      ...state.patterns.filter(item => item.status === 'approved').map(item => ({ id: `pattern:${item.id}`, label: `Pattern: ${item.title}` })),
      ...state.gaps.filter(item => item.status === 'approved').map(item => ({ id: `gap:${item.id}`, label: `Gap: ${item.title || 'Not enough information'}` }))
    ];
    const solution = solutionId ? state.solutions.find(item => item.id === solutionId) : null;
    $('#solutionForm').reset();
    $('#solutionForm').dataset.id = solutionId || '';
    $('#solutionEvidence').innerHTML = `<option value="">Not enough information — select approved evidence when available</option>${evidence.map(item => `<option value="${item.id}">${esc(item.label)}</option>`).join('')}`;
    if (solution) {
      $('#solutionTitle').value = solution.title || '';
      $('#solutionProblem').value = solution.problem || '';
      $('#solutionText').value = solution.text || '';
      $('#solutionEvidence').value = solution.evidenceId || '';
      $('#solutionStatus').value = solution.status || 'AI Suggestion';
      $('#solutionComment').value = solution.comment || '';
    }
    const selected = new Set(solution?.personaIds || []);
    $('#solutionPersonas').innerHTML = state.personas.map(persona => `<option value="${persona.id}" ${selected.has(persona.id) ? 'selected' : ''}>${persona.template ? '[Test persona] ' : ''}${esc(persona.name)} · ${esc(persona.role)}</option>`).join('');
    show('#solutionDialog');
  };

  saveSolution = function (event) {
    event.preventDefault();
    const evidenceId = $('#solutionEvidence').value;
    const evidenceLabel = evidenceId ? $('#solutionEvidence').selectedOptions[0]?.textContent : '';
    const personaIds = [...$('#solutionPersonas').selectedOptions].map(item => item.value);
    const data = { title: $('#solutionTitle').value.trim(), problem: $('#solutionProblem').value.trim(), text: $('#solutionText').value.trim(), evidenceId, evidenceLabel, personaIds, status: $('#solutionStatus').value, comment: $('#solutionComment').value.trim(), updated: now() };
    const solutionId = event.target.dataset.id;
    if (solutionId) Object.assign(state.solutions.find(item => item.id === solutionId), data);
    else state.solutions.unshift({ id: id('sol'), ...data, created: now() });
    log(`${solutionId ? 'Updated' : 'Added'} solution hypothesis: ${data.title}`); save(); closeDialogs(); render(); toast('Solution hypothesis saved');
  };

  function reviewSolution(solutionId, result) {
    const solution = state.solutions.find(item => item.id === solutionId);
    if (!solution) return toast('This solution hypothesis is no longer available');
    solution.status = result;
    solution.updated = now();
    solution.reviewedAt = now();
    log(`${result === 'Rejected' ? 'Rejected' : 'Approved'} solution hypothesis: ${solution.title || 'Untitled solution'}`);
    save(); render(); go('solutions');
    toast(result === 'Rejected' ? 'Solution moved to Rejected' : 'Solution moved to Approved');
  }

  solutions = function () {
    const missing = 'Not enough information';
    const card = solution => {
      const linkedPersonas = (solution.personaIds || []).map(personaId => state.personas.find(persona => persona.id === personaId)).filter(Boolean);
      const names = linkedPersonas.map(persona => `${persona.template ? '[Test] ' : ''}${persona.name}`);
      const field = (label, value, expectation) => `<div class="solution-field ${value ? '' : 'missing-field'}"><b>${label}</b><span>${esc(value || `${missing} — expected: ${expectation}`)}</span></div>`;
      return `<article class="pattern-card solution-card"><div class="relationship-card-head"><span class="eyebrow">SOLUTION HYPOTHESIS</span><span class="status ${solution.status.toLowerCase().replaceAll(' ', '-')}">${esc(solution.status)}</span></div><div class="card-title">${esc(solution.title || `${missing} — expected: a short solution name`)}</div>${field('Problem or gap', solution.problem, 'the evidence-backed problem this idea addresses.')}${field('Proposed response', solution.text, 'a concise, testable solution hypothesis.')}${field('Relevant personas', names.join(' · '), 'one or more affected personas.')}${field('Supporting evidence', solution.evidenceLabel, 'an approved grouped pattern or connection gap.')}${field('Review note', solution.comment, 'optional context, assumptions or the next validation step.')}<div class="review-actions solution-review-actions"><button class="tiny solution-approve" data-review-solution="${solution.id}" data-result="Approved Idea">Approve</button><button class="tiny solution-reject" data-review-solution="${solution.id}" data-result="Rejected">Reject</button><button class="tiny" data-edit-solution="${solution.id}">Edit</button></div></article>`;
    };
    const groups = [
      { key: 'pending', label: 'Needs review', items: state.solutions.filter(item => !['Approved Idea', 'Testing', 'Validated', 'Rejected'].includes(item.status)) },
      { key: 'approved', label: 'Approved', items: state.solutions.filter(item => ['Approved Idea', 'Testing', 'Validated'].includes(item.status)) },
      { key: 'rejected', label: 'Rejected', items: state.solutions.filter(item => item.status === 'Rejected') },
    ];
    $('#solutionList').innerHTML = state.solutions.length ? groups.map(group => `<details class="review-group review-group-${group.key}" ${group.key === 'rejected' ? '' : 'open'}><summary><span>${group.label}</span><b>${group.items.length}</b></summary><div class="review-group-list">${group.items.length ? group.items.map(card).join('') : '<p class="review-group-empty">No solution hypotheses in this section.</p>'}</div></details>`).join('') : empty('No solution hypotheses', 'Add an idea only after an evidence-backed problem or gap is identified.');
    bindDynamic();
  };

  function explicitRoleFromSource(record) {
    const saved = record?.participantRole;
    if (saved && saved !== 'Unknown' && saved !== MISSING_SOURCE_VALUE) return saved;
    const text = `${record?.title || ''}\n${record?.content || ''}`;
    if (/\b(owner interview|i am (?:the |a )?(?:pet |dog |cat )?owner|my (?:dog|cat|pet)\b)/i.test(text)) return 'Owner';
    if (/\b(finder interview|i found (?:a|the) (?:dog|cat|pet|animal)|i took (?:a|the) (?:dog|cat|pet|animal) (?:home|inside|to))/i.test(text)) return 'Finder';
    if (/\b(spotter interview|i (?:saw|spotted) (?:a|the) (?:dog|cat|pet|animal))/i.test(text)) return 'Spotter';
    return null;
  }

  function personaContextFromPattern(pattern) {
    const evidence = (pattern.observationIds || []).map(observationId => obs(observationId)).filter(Boolean);
    const sourceRecords = [...new Map(evidence.map(item => [item.sourceId, source(item.sourceId)]).filter(([, item]) => item)).values()];
    const roleCounts = new Map();
    sourceRecords.map(explicitRoleFromSource).filter(Boolean).forEach(role => roleCounts.set(role, (roleCounts.get(role) || 0) + 1));
    const role = [...roleCounts].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const explicitGoals = [...new Set(evidence.filter(item => item.dimension === 'Goal').map(item => item.text.trim()).filter(Boolean))];
    const allText = sourceRecords.map(item => `${item.reportStatus || ''}\n${item.content || ''}`).join('\n');
    const lostContext = sourceRecords.some(item => item.reportStatus === 'Lost') || /\b(lost|missing|disappeared|did not return home)\b/i.test(allText);
    const foundContext = sourceRecords.some(item => item.reportStatus === 'Found') || /\b(found (?:a|the) (?:dog|cat|pet|animal))\b/i.test(allText);
    let goal = explicitGoals.join('\n');
    if (!goal && role === 'Owner' && lostContext) goal = 'Find the missing pet and bring them home safely.';
    if (!goal && role === 'Finder' && foundContext) goal = 'Keep the found animal safe and reunite them with their owner.';
    if (!goal && role === 'Spotter') goal = 'Share an accurate, useful sighting so the animal can be safely recovered.';
    const name = role === 'Owner' && lostContext ? 'Searching Owner' : role === 'Finder' ? 'Temporary Finder' : role === 'Spotter' ? 'Sighting Reporter' : pattern.title;
    return { evidence, role, goal, name, goalDerivedFromContext: !explicitGoals.length && Boolean(goal) };
  }

  function renderPersonaEvidenceSelector() {
    const select = $('#personaEvidencePatterns');
    const cards = $('#personaEvidencePatternCards');
    if (!select || !cards) return;
    cards.innerHTML = [...select.options].length ? [...select.options].map(option => {
      const pattern = state.patterns.find(item => item.id === option.value);
      return `<label class="persona-evidence-option"><input type="checkbox" data-persona-evidence-pattern="${option.value}" ${option.selected ? 'checked' : ''}><span><b>${esc(option.textContent)}</b><small>${esc(pattern ? patternDimension(pattern) : 'Unknown')}</small></span></label>`;
    }).join('') : '<p class="missing">No approved patterns are available.</p>';
    $$('[data-persona-evidence-pattern]').forEach(checkbox => checkbox.onchange = () => {
      const option = [...select.options].find(item => item.value === checkbox.dataset.personaEvidencePattern);
      if (option) option.selected = checkbox.checked;
    });
  }

  openPersonaForm = function (pid = null, pattern = null) {
    delete $('#personaForm').dataset.updateId;
    originalOpenPersonaForm(pid, pattern);
    ['#personaBehaviours', '#personaMotivations', '#personaConstraints', '#personaPainPoints', '#personaNeeds'].forEach(selector => {
      const field = $(selector);
      field.value = uniqueStatements(field.value.split(/\n+/)).join('\n');
    });
    const persona = pid ? state.personas.find(item => item.id === pid) : null;
    const selected = new Set([...(persona?.patternIds || []), ...(pattern ? [pattern.id] : [])]);
    $('#personaEvidencePatterns').innerHTML = state.patterns.filter(item => item.status === 'approved').map(item => `<option value="${item.id}" ${selected.has(item.id) ? 'selected' : ''}>${esc(item.title)}</option>`).join('');
    renderPersonaEvidenceSelector();
    if (pattern && !pid) {
      const context = personaContextFromPattern(pattern);
      const evidence = context.evidence;
      const unique = values => [...new Set(values.map(item => item?.trim()).filter(Boolean))];
      const byDimension = dimensions => unique(evidence.filter(item => dimensions.includes(item.dimension)).map(item => item.text));
      const behaviours = byDimension(['Action', 'Decision-making', 'Level of involvement', 'Interaction']);
      const motivations = byDimension(['Motivation']);
      const constraints = byDimension(['Constraint']);
      const painPoints = byDimension(['Problem']);
      const needs = byDimension(['Need']);
      $('#personaDialogTitle').textContent = 'Review evidence-based persona draft';
      $('#personaName').value = context.name;
      $('#personaRole').value = context.role;
      $('#personaGoal').value = context.goal || 'Not enough evidence to define the main goal — please review.';
      $('#personaBehaviours').value = behaviours.join('\n');
      $('#personaMotivations').value = motivations.join('\n');
      $('#personaConstraints').value = constraints.join('\n');
      $('#personaPainPoints').value = painPoints.join('\n');
      $('#personaNeeds').value = needs.join('\n');
      $('#personaStatus').value = 'Unvalidated';
      $('#personaReason').value = `Draft generated from approved pattern: ${pattern.title}`;
      $('#personaHistory').innerHTML = `<div class="notice ok"><b>Draft prefilled from reviewed evidence.</b><br>${evidence.length} source-linked observation${evidence.length === 1 ? '' : 's'} mapped into the relevant persona sections.${context.goalDerivedFromContext ? ' The main goal is a reviewable interpretation derived from the explicit participant role and lost/found situation.' : ''} Review the wording, then save. Empty sections mean this pattern contains no approved evidence for that category.</div>`;
    } else if (pattern && pid) {
      const context = personaContextFromPattern(pattern);
      const evidence = context.evidence;
      const unique = values => [...new Set(values.map(item => item?.trim()).filter(Boolean))];
      const append = (selector, dimensions) => {
        const field = $(selector);
        const existing = field.value.split(/\n+/).map(item => item.trim()).filter(Boolean);
        const additions = evidence.filter(item => dimensions.includes(item.dimension)).map(item => item.text);
        field.value = unique([...existing, ...additions]).join('\n');
      };
      if ((!$('#personaRole').value.trim() || $('#personaRole').value === 'Unknown') && context.role) $('#personaRole').value = context.role;
      if ($('#personaName').value === pattern.title && context.name !== pattern.title) $('#personaName').value = context.name;
      if ((!$('#personaGoal').value.trim() || $('#personaGoal').value === pattern.summary) && context.goal) $('#personaGoal').value = context.goal;
      append('#personaBehaviours', ['Action', 'Decision-making', 'Level of involvement', 'Interaction']);
      append('#personaMotivations', ['Motivation']);
      append('#personaConstraints', ['Constraint']);
      append('#personaPainPoints', ['Problem']);
      append('#personaNeeds', ['Need']);
      $('#personaDialogTitle').textContent = 'Review persona update from approved pattern';
      $('#personaReason').value = `Updated from approved pattern: ${pattern.title}`;
      $('#personaHistory').insertAdjacentHTML('afterbegin', `<div class="notice ok"><b>Approved evidence mapped for review.</b><br>Existing researcher-authored content was preserved. A previous system-generated title or goal was corrected only when it still matched the original pattern summary.${context.goalDerivedFromContext ? ' The proposed main goal is derived from the explicit role and lost/found situation and still requires your confirmation.' : ''}</div>`);
    }
  };

  function confirmPersonaCreation(name, patternCount) {
    return new Promise(resolve => {
      const dialog = $('#lowEvidenceDialog');
      let settled = false;
      $('#personaCreationTitle').textContent = `${name} does not exist yet`;
      $('#lowEvidenceText').textContent = `Create ${name} and add ${patternCount} approved pattern${patternCount === 1 ? '' : 's'} to its review queue?`;
      $('#personaCreationGuidance').innerHTML = patternCount < 3
        ? '<b>Limited evidence</b><p>Fewer than three approved patterns is weak support for creating a separate persona. We recommend collecting more research first.</p>'
        : `<b>Evidence threshold reached</b><p>${patternCount} approved patterns are available. You still need to review the generated persona before saving it.</p>`;
      const finish = value => {
        if (settled) return;
        settled = true;
        $('#createPersonaAnywayBtn').onclick = null;
        dialog.onclose = null;
        if (dialog.open) dialog.close();
        resolve(value);
      };
      $('#createPersonaAnywayBtn').onclick = () => finish(true);
      dialog.onclose = () => finish(false);
      dialog.showModal();
    });
  }

  function queuePatternsForPersona(persona, patternIds) {
    let update = state.personaUpdates.find(item => item.personaId === persona.id && item.status === 'pending');
    if (!update) {
      update = { id: id('update'), personaId: persona.id, patternIds: [], status: 'pending', created: now() };
      state.personaUpdates.unshift(update);
    }
    update.patternIds = [...new Set([...update.patternIds, ...patternIds])];
    update.updated = now();
  }

  personaFromPattern = async function (patternId) {
    const pattern = state.patterns.find(item => item.id === patternId);
    if (!pattern) return;
    const context = personaContextFromPattern(pattern);
    const evidenceBased = state.personas.filter(persona => !persona.template);
    const sameRole = context.role ? evidenceBased.filter(persona => persona.role === context.role) : [];
    const matchingPatterns = state.patterns.filter(candidate => candidate.status === 'approved' && (context.role ? personaContextFromPattern(candidate).role === context.role : candidate.id === pattern.id));
    const patternIds = [...new Set([pattern.id, ...matchingPatterns.map(candidate => candidate.id)])];
    let persona;
    if (sameRole.length) {
      const answer = sameRole.length === 1 ? '1' : await requestText('Add patterns to persona', `Enter a number: ${sameRole.map((candidate, index) => `${index + 1}. ${candidate.name}`).join(' · ')}`, '1');
      persona = sameRole[Number(answer) - 1];
      if (!persona) return;
    } else {
      const personaNames = { Owner: 'Owner', Finder: 'Temporary Carer', Spotter: 'Quick Spotter' };
      const name = personaNames[context.role] || 'Potential New Persona';
      if (!await confirmPersonaCreation(name, patternIds.length)) return;
      persona = { id: id('per'), name, role: context.role || 'Other', goal: context.goal || '', status: 'Unvalidated', version: 1, patternIds: [], template: false, behaviours: [], motivations: [], constraints: [], painPoints: [], needs: [], created: now(), updated: now(), history: [{ version: 1, values: { name, role: context.role || 'Other', goal: context.goal || '', status: 'Unvalidated', behaviours: [], motivations: [], constraints: [], painPoints: [], needs: [], patternIds: [] }, reason: `Created after researcher confirmed ${patternIds.length} approved pattern${patternIds.length === 1 ? '' : 's'}`, changed: now(), origin: 'researcher-confirmed persona creation', evidencePatternIds: patternIds }] };
      state.personas.unshift(persona);
    }
    queuePatternsForPersona(persona, patternIds);
    log(`Queued ${patternIds.length} approved pattern(s) for ${persona.name}`);
    save(); render(); toast(`${patternIds.length} pattern${patternIds.length === 1 ? '' : 's'} added to ${persona.name}'s review queue`);
  };

  async function editPatternAssignment(patternId) {
    const pattern = state.patterns.find(item => item.id === patternId);
    const context = pattern ? personaContextFromPattern(pattern) : {};
    const evidenceBased = state.personas.filter(persona => !persona.template);
    const sameRole = context.role ? evidenceBased.filter(persona => persona.role === context.role) : [];
    const candidates = sameRole.length ? sameRole : evidenceBased;
    const currentUpdates = state.personaUpdates.filter(update => update.status === 'pending' && update.patternIds.includes(patternId));
    if (!candidates.length) return toast('Create an evidence-based persona first');
    const answer = await requestText('Edit pattern assignment', `Enter 0 to remove it from the update queue, or choose a persona: ${candidates.map((persona, index) => `${index + 1}. ${persona.name}`).join(' · ')}`, currentUpdates.length ? String(candidates.findIndex(persona => persona.id === currentUpdates[0].personaId) + 1) : '1');
    if (answer === null) return;
    currentUpdates.forEach(update => { update.patternIds = update.patternIds.filter(id => id !== patternId); });
    state.personaUpdates = state.personaUpdates.filter(update => update.status !== 'pending' || update.patternIds.length);
    if (String(answer).trim() !== '0') {
      const persona = candidates[Number(answer) - 1];
      if (!persona) return toast('Choose a listed persona number or enter 0');
      let update = state.personaUpdates.find(item => item.personaId === persona.id && item.status === 'pending');
      if (!update) { update = { id: id('update'), personaId: persona.id, patternIds: [], status: 'pending', created: now() }; state.personaUpdates.unshift(update); }
      update.patternIds = [...new Set([...update.patternIds, patternId])];
      update.updated = now();
      log(`Reassigned approved pattern to ${persona.name}`);
      save(); render(); toast(`Pattern assigned to ${persona.name}`);
      return;
    }
    log('Removed a pattern from the persona update queue');
    save(); render(); toast('Pattern removed from the persona update queue');
  }

  async function reviewPersonaUpdate(updateId) {
    const update = state.personaUpdates.find(item => item.id === updateId && item.status === 'pending');
    const persona = update && state.personas.find(item => item.id === update.personaId);
    const allPatternIds = update ? [...new Set([...(persona?.patternIds || []), ...update.patternIds])] : [];
    const patterns = allPatternIds.map(patternId => state.patterns.find(item => item.id === patternId)).filter(item => item?.status === 'approved');
    if (!persona || !patterns.length) return toast('This update no longer has available evidence');
    const trigger = $(`[data-review-persona-update="${updateId}"]`);
    if (trigger) { trigger.disabled = true; trigger.textContent = 'Synthesising evidence…'; }
    try {
      const endpoint = String(state.settings.endpoint || PUBLIC_AI_ENDPOINT).replace(/\/api\/analyze\/?$/, '/api/synthesize-persona');
      const evidencePackage = patterns.map(pattern => ({
        id: pattern.id, title: pattern.title, summary: pattern.summary,
        observations: pattern.observationIds.map(observationId => obs(observationId)).filter(Boolean).map(observation => ({ dimension: observation.dimension, text: observation.text, excerpt: observation.excerpt, sourceId: observation.sourceId })),
      }));
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ persona: { name: persona.name, role: persona.role, mainGoal: persona.goal, behaviours: persona.behaviours || [], motivations: persona.motivations || [], constraints: persona.constraints || [], painPoints: persona.painPoints || [], needs: persona.needs || [] }, patterns: evidencePackage }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.persona) throw new Error(data.error || `Synthesis returned ${response.status}`);
      openPersonaForm(persona.id);
      const draft = data.persona;
      if (draft.role) $('#personaRole').value = draft.role;
      $('#personaGoal').value = draft.mainGoal || '';
      $('#personaBehaviours').value = uniqueStatements(draft.behaviours).join('\n');
      $('#personaMotivations').value = uniqueStatements(draft.motivations).join('\n');
      $('#personaConstraints').value = uniqueStatements(draft.constraints).join('\n');
      $('#personaPainPoints').value = uniqueStatements(draft.painPoints).join('\n');
      $('#personaNeeds').value = uniqueStatements(draft.needs).join('\n');
    } catch (error) {
      toast(`Persona synthesis unavailable: ${error.message}`);
      return;
    } finally {
      if (trigger) { trigger.disabled = false; trigger.textContent = 'Synthesize evidence'; }
    }
    patterns.forEach(pattern => { const option = $(`#personaEvidencePatterns option[value="${pattern.id}"]`); if (option) option.selected = true; });
    renderPersonaEvidenceSelector();
    $('#personaDialogTitle').textContent = 'Review proposed persona update';
    $('#personaReason').value = `AI synthesis reviewed from approved evidence: ${patterns.map(pattern => pattern.title).join('; ')}`;
    $('#personaForm').dataset.updateId = update.id;
    $('#personaHistory').insertAdjacentHTML('afterbegin', `<div class="notice neutral"><b>Patterns were merged by meaning; nothing has been applied yet.</b><br>The AI rewrote all sections from the complete approved evidence package. Review every field. Saving creates a new persona version and records the supporting patterns.</div>`);
  }

  personas = function () {
    originalPersonas();
    const pending = state.personaUpdates.filter(item => item.status === 'pending').map(item => ({ ...item, persona: state.personas.find(persona => persona.id === item.personaId) })).filter(item => item.persona);
    $('#personaUpdateQueue').innerHTML = pending.length ? `<section class="persona-update-queue"><h2>New evidence available</h2><p>Approved patterns are waiting to be semantically merged and reviewed before they change a persona.</p>${pending.map(item => `<article class="persona-update-item"><div><b>${esc(item.persona.name)}</b><p>${item.patternIds.length} new approved pattern${item.patternIds.length === 1 ? '' : 's'} ready for full persona re-synthesis.</p></div><button class="primary" data-review-persona-update="${item.id}">Synthesize evidence</button></article>`).join('')}</section>` : '';
    $$('[data-review-persona-update]').forEach(button => button.onclick = () => reviewPersonaUpdate(button.dataset.reviewPersonaUpdate));
  };

  savePersona = function (event) {
    event.preventDefault();
    const pid = $('#personaId').value;
    const evidencePatternIds = [...$('#personaEvidencePatterns').selectedOptions].map(item => item.value);
    const record = {
      name: $('#personaName').value.trim(), role: $('#personaRole').value.trim(), goal: $('#personaGoal').value.trim(),
      behaviours: uniqueStatements(lines($('#personaBehaviours').value)), motivations: uniqueStatements(lines($('#personaMotivations').value)), constraints: uniqueStatements(lines($('#personaConstraints').value)),
      painPoints: uniqueStatements(lines($('#personaPainPoints').value)), needs: uniqueStatements(lines($('#personaNeeds').value)), status: $('#personaStatus').value, patternIds: evidencePatternIds,
    };
    const reason = $('#personaReason').value.trim();
    if (!evidencePatternIds.length && record.status === 'Validated') {
      record.status = 'Unvalidated';
      toast('A persona without approved evidence remains Unvalidated');
    }
    if (pid) {
      const persona = state.personas.find(item => item.id === pid);
      persona.history ??= [];
      persona.history.unshift({ version: persona.version, values: { name: persona.name, role: persona.role, goal: persona.goal, status: persona.status, behaviours: persona.behaviours || [], motivations: persona.motivations || [], constraints: persona.constraints || [], painPoints: persona.painPoints || [], needs: persona.needs || [], patternIds: persona.patternIds || [] }, reason, changed: now(), origin: 'manual', evidencePatternIds });
      Object.assign(persona, record, { template: false, version: persona.version + 1, updated: now() });
      const updateId = event.target.dataset.updateId;
      if (updateId) {
        const update = state.personaUpdates.find(item => item.id === updateId);
        if (update) { update.status = 'applied'; update.appliedAt = now(); update.appliedVersion = persona.version; }
        delete event.target.dataset.updateId;
      }
      log(`Updated persona: ${persona.name}`);
    } else {
      const patternId = event.target.dataset.pattern || null;
      const patternIds = evidencePatternIds.length ? evidencePatternIds : patternId ? [patternId] : [];
      state.personas.unshift({ id: id('per'), ...record, patternIds, template: false, version: 1, history: [{ version: 1, values: { ...record, patternIds }, reason, changed: now(), origin: patternIds.length ? 'approved evidence' : 'manual hypothesis', evidencePatternIds: patternIds }], created: now(), updated: now() });
      log(`Created persona: ${record.name}`);
    }
    save(); closeDialogs(); render(); go('personas'); toast('Persona version saved with provenance');
  };

  function evidenceForPersona(persona) {
    return (persona.patternIds || []).map(patternId => state.patterns.find(pattern => pattern.id === patternId)).filter(Boolean);
  }

  const REVIEW_GROUPS = [
    ['pending', 'Needs review'],
    ['approved', 'Approved'],
    ['edited', 'Edited — needs re-review'],
    ['rejected', 'Rejected'],
  ];

  function reviewGroup(item) {
    return item.reviewState === 'edited' ? 'edited' : item.status === 'approved' ? 'approved' : item.status === 'rejected' ? 'rejected' : 'pending';
  }

  const DIMENSION_ORDER = ['Goal', 'Action', 'Motivation', 'Constraint', 'Problem', 'Need', 'Decision-making', 'Level of involvement', 'Interaction', 'Mixed evidence', 'Unknown'];
  const DIMENSION_LABELS = { Goal: 'Main goals', Action: 'Actions', Motivation: 'Motivations', Constraint: 'Constraints', Problem: 'Pain points', Need: 'Needs', 'Decision-making': 'Decision-making', 'Level of involvement': 'Level of involvement', Interaction: 'Interactions', 'Mixed evidence': 'Mixed evidence', Unknown: 'Unclassified' };

  function patternDimension(pattern) {
    const counts = new Map();
    (pattern.observationIds || []).map(observationId => obs(observationId)?.dimension || 'Unknown').forEach(dimension => counts.set(dimension, (counts.get(dimension) || 0) + 1));
    const ranked = [...counts].sort((a, b) => b[1] - a[1] || DIMENSION_ORDER.indexOf(a[0]) - DIMENSION_ORDER.indexOf(b[0]));
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return 'Mixed evidence';
    return ranked[0]?.[0] || 'Unknown';
  }

  function patternDisplayTitle(pattern) {
    if (pattern.origin === 'researcher-reviewed evidence' && pattern.observationIds?.length === 1) {
      const observation = obs(pattern.observationIds[0]);
      if (observation) return `${DIMENSION_LABELS[observation.dimension] || observation.dimension}: ${observation.text}`;
    }
    return pattern.title || pattern.summary || 'Untitled pattern';
  }

  function personasForPattern(pattern) {
    const ids = new Set();
    state.personas.filter(persona => !persona.template && (persona.patternIds || []).includes(pattern.id)).forEach(persona => ids.add(persona.id));
    state.personaUpdates.filter(update => update.status === 'pending' && (update.patternIds || []).includes(pattern.id)).forEach(update => ids.add(update.personaId));
    return [...ids].map(personaId => state.personas.find(persona => persona.id === personaId)).filter(Boolean);
  }

  function personasForObservation(observation) {
    const personas = new Map();
    state.patterns.filter(pattern => (pattern.observationIds || []).includes(observation.id)).forEach(pattern => personasForPattern(pattern).forEach(persona => personas.set(persona.id, persona)));
    return [...personas.values()];
  }

  function evidenceContext(personas, dimension, sourceRecords) {
    const roles = [...new Set(sourceRecords.map(explicitRoleFromSource).filter(Boolean))];
    const rolePersona = { Owner: 'Owner', Finder: 'Temporary Carer', Spotter: 'Quick Spotter' };
    let personaLabel = personas.length ? personas.map(persona => persona.name).join(', ') : roles.length === 1 && rolePersona[roles[0]] ? rolePersona[roles[0]] : '';
    if (!personaLabel) personaLabel = roles.length > 1 ? 'Mixed roles — needs review' : 'Potential new persona — needs review';
    return `<div class="evidence-context"><span><b>Persona:</b> ${esc(personaLabel)}</span><span><b>Section:</b> ${esc(DIMENSION_LABELS[dimension] || dimension || 'Unclassified')}</span></div>`;
  }

  function focusObservationCard(observationId) {
    const card = $(`[data-observation-card="${observationId}"]`);
    if (!card) return toast('The linked observation is no longer available');
    const reviewSection = card.closest('.review-group');
    if (reviewSection) reviewSection.open = true;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('evidence-observation-focus');
    requestAnimationFrame(() => card.classList.add('evidence-observation-focus'));
    setTimeout(() => card.classList.remove('evidence-observation-focus'), 2400);
  }

  function focusPatternCard(patternId) {
    go('analysis');
    requestAnimationFrame(() => {
      const card = $(`[data-pattern-card="${patternId}"]`);
      if (!card) return toast('The linked grouped pattern is no longer available');
      const reviewSection = card.closest('.review-group');
      if (reviewSection) reviewSection.open = true;
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.remove('evidence-pattern-focus');
      requestAnimationFrame(() => card.classList.add('evidence-pattern-focus'));
      setTimeout(() => card.classList.remove('evidence-pattern-focus'), 2400);
    });
  }

  function dimensionGroupedCards(items, card, dimensionOf) {
    const groups = new Map();
    items.forEach(item => { const dimension = dimensionOf(item) || 'Unknown'; if (!groups.has(dimension)) groups.set(dimension, []); groups.get(dimension).push(item); });
    return [...groups.entries()].sort((a, b) => DIMENSION_ORDER.indexOf(a[0]) - DIMENSION_ORDER.indexOf(b[0])).map(([dimension, group]) => `<section class="dimension-group"><div class="dimension-heading"><b>${esc(DIMENSION_LABELS[dimension] || dimension)}</b><span>${group.length}</span></div><div class="dimension-group-cards">${group.map(card).join('')}</div></section>`).join('');
  }

  function groupedReviewMarkup(items, card, emptyText, dimensionOf = null) {
    return REVIEW_GROUPS.map(([key, label]) => {
      const group = items.filter(item => reviewGroup(item) === key);
      const content = group.length ? dimensionOf ? dimensionGroupedCards(group, card, dimensionOf) : group.map(card).join('') : `<p class="review-group-empty">${esc(emptyText)}</p>`;
      return `<details class="review-group review-group-${key}" ${key === 'rejected' ? '' : 'open'}><summary><span>${label}</span><b>${group.length}</b></summary><div class="review-group-list">${content}</div></details>`;
    }).join('');
  }

  editObservation = function (observationId) {
    const observation = obs(observationId);
    if (!observation) return;
    $('#editObservationId').value = observation.id;
    $('#editObservationDimension').value = observation.dimension;
    $('#editObservationText').value = observation.text;
    $('#editObservationExcerpt').value = observation.excerpt;
    show('#editObservationDialog');
  };

  analysis = function () {
    const observations = state.observations.slice().sort((a, b) => b.created.localeCompare(a.created));
    const patterns = state.patterns.slice().sort((a, b) => b.created.localeCompare(a.created));
    $('#observationCount').textContent = observations.length;
    $('#patternCount').textContent = patterns.length;
    $('#analysisView .analysis-archive-note')?.remove();
    if (state.analysisArchives.length) {
      const latest = state.analysisArchives[0];
      $('#aiConfigNotice').insertAdjacentHTML('afterend', `<div class="notice neutral analysis-archive-note"><b>${state.analysisArchives.length} previous analysis run${state.analysisArchives.length === 1 ? '' : 's'} archived.</b> Latest archive: ${day(latest.archivedAt)} · ${latest.observations.length} observations · ${latest.patterns.length} patterns. Original research was preserved.</div>`);
    }
    $('#observationList').innerHTML = groupedReviewMarkup(observations, observation => {
      const sourceRecord = source(observation.sourceId);
      const editable = reviewGroup(observation) === 'pending' || reviewGroup(observation) === 'edited';
      const suggestedPattern = observation.suggestedPatternId && state.patterns.find(pattern => pattern.id === observation.suggestedPatternId);
      const matchNote = suggestedPattern ? `<div class="pattern-match-note"><b>${observation.patternMatchApplied ? 'Added to existing pattern:' : 'Matches existing pattern:'}</b> ${esc(patternDisplayTitle(suggestedPattern))}${observation.patternMatchApplied ? '' : ' · approve to add'}</div>` : '';
      return `<article class="observation-card" data-observation-card="${observation.id}"><span class="status ${reviewGroup(observation)}">${reviewGroup(observation) === 'edited' ? 'edited' : observation.status}</span>${evidenceContext(personasForObservation(observation), observation.dimension, [sourceRecord])}<div class="card-title">${esc(observation.dimension)}</div><p>${esc(observation.text)}</p>${matchNote}<div class="excerpt">“${esc(observation.excerpt)}”</div><div class="meta">${esc(observation.evidenceType)} · Source: ${esc(sourceRecord?.title || 'Missing source')}</div><div class="review-actions">${editable ? `<button class="tiny" data-review-observation="${observation.id}" data-result="approved">Approve</button><button class="tiny" data-edit-observation="${observation.id}">Edit</button><button class="tiny" data-review-observation="${observation.id}" data-result="rejected">Reject</button>` : observation.status === 'approved' ? `<button class="tiny" data-edit-observation="${observation.id}">Edit</button>` : ''}<button class="tiny" data-source="${observation.sourceId}">Open source</button></div></article>`;
    }, 'No observations in this review state.', observation => observation.dimension);
    $('#patternList').innerHTML = groupedReviewMarkup(patterns, pattern => {
      const editable = reviewGroup(pattern) === 'pending' || reviewGroup(pattern) === 'edited';
      const linkedPersonas = state.personas.filter(persona => !persona.template && (persona.patternIds || []).includes(pattern.id));
      const queuedPersonas = state.personaUpdates.filter(update => update.status === 'pending' && update.patternIds.includes(pattern.id)).map(update => state.personas.find(persona => persona.id === update.personaId)).filter(Boolean);
      const application = pattern.status === 'approved' ? `<div class="pattern-application ${linkedPersonas.length ? 'applied' : 'not-applied'}">${queuedPersonas.length ? `Pattern added to: ${esc(queuedPersonas.map(persona => persona.name).join(', '))} · awaiting persona review` : linkedPersonas.length ? `Applied to: ${esc(linkedPersonas.map(persona => persona.name).join(', '))}` : 'Approved · Not yet assigned to a persona'}</div>` : '';
      const dimension = patternDimension(pattern);
      const patternSources = pattern.observationIds.map(id => obs(id)).filter(Boolean).map(observation => source(observation.sourceId));
      const mergeRecord = (Array.isArray(pattern.history) ? pattern.history : pattern.history ? [pattern.history] : []).find(item => item.action === 'merge');
      const mergedFrom = mergeRecord?.sourceTitles?.length ? `<div class="merged-pattern-origin"><b>Merged from:</b><ul>${mergeRecord.sourceTitles.map(title => `<li>${esc(title)}</li>`).join('')}</ul></div>` : '';
      return `<article class="pattern-card" data-pattern-card="${pattern.id}"><label class="pattern-select"><input type="checkbox" data-pattern-select="${pattern.id}"> Select</label><span class="status ${reviewGroup(pattern)}">${reviewGroup(pattern) === 'edited' ? 'edited' : pattern.status}</span>${evidenceContext(personasForPattern(pattern), dimension, patternSources)}<div class="card-title pattern-full-title">${esc(patternDisplayTitle(pattern))}</div><p class="pattern-full-summary"><b>Pattern meaning:</b> ${esc(pattern.summary)}</p>${mergedFrom}<div class="meta">${pattern.observationIds.length} supporting observation${pattern.observationIds.length === 1 ? '' : 's'} · ${new Set(pattern.observationIds.map(id => obs(id)?.sourceId)).size} independent source(s)</div>${application}<details class="grouped-evidence"><summary>View supporting observations</summary><div class="evidence-proof-list">${pattern.observationIds.map(id => { const observation = obs(id); const sourceRecord = observation && source(observation.sourceId); return observation ? `<button class="evidence-proof" data-focus-observation="${observation.id}"><span class="evidence-proof-head"><b>${esc(DIMENSION_LABELS[observation.dimension] || observation.dimension)}</b><span class="status ${observation.status}">${esc(observation.status)}</span><span class="dimension-chip">${esc(observation.evidenceType)}</span></span><p>${esc(observation.text)}</p><blockquote>“${esc(observation.excerpt)}”</blockquote><small>Source: ${esc(sourceRecord?.title || 'Missing source')} · Open in Evidence observations</small></button>` : ''; }).join('')}</div></details><div class="review-actions">${editable ? `<button class="tiny" data-review-pattern="${pattern.id}" data-result="approved">Approve</button><button class="tiny" data-edit-pattern="${pattern.id}">Edit</button><button class="tiny" data-review-pattern="${pattern.id}" data-result="rejected">Reject</button>` : pattern.status === 'approved' ? `<button class="tiny" data-edit-pattern="${pattern.id}">Edit pattern</button>${queuedPersonas.length ? `<button class="tiny" data-edit-pattern-assignment="${pattern.id}">Edit assignment</button>` : linkedPersonas.length ? '' : `<button class="tiny" data-pattern-persona="${pattern.id}">Add pattern to persona</button>`}` : ''}${pattern.observationIds.length > 1 ? `<button class="tiny" data-split-pattern="${pattern.id}">Split pattern</button>` : ''}</div></article>`;
    }, 'No patterns in this review state.', patternDimension);
    bindDynamic();
  };

  openPersonaDetails = function (pid) {
    originalOpenPersonaDetails(pid);
    $('#deleteTemplateBtn')?.remove();
    $('#validatePersonaBtn')?.remove();
    const persona = state.personas.find(item => item.id === pid);
    const patterns = evidenceForPersona(persona);
    const sheet = $('#personaViewContent .persona-view-sheet');
    const evidenceSections = [
      { label: 'Main goal', dimensions: ['Goal'] },
      { label: 'Behaviours', dimensions: ['Action', 'Decision-making', 'Level of involvement', 'Interaction'] },
      { label: 'Motivations', dimensions: ['Motivation'] },
      { label: 'Constraints', dimensions: ['Constraint'] },
      { label: 'Pain points', dimensions: ['Problem'] },
      { label: 'Needs', dimensions: ['Need'] },
    ];
    [...$('#personaViewContent .persona-view-sections').querySelectorAll('details')].forEach((details, index) => {
      const linked = patterns.filter(pattern => (pattern.observationIds || []).some(observationId => evidenceSections[index]?.dimensions.includes(obs(observationId)?.dimension)));
      if (!linked.length) return;
      details.querySelector('.persona-section-detail').insertAdjacentHTML('beforeend', `<div class="persona-section-patterns"><b>Supporting grouped patterns</b>${linked.map(pattern => `<button type="button" data-open-persona-pattern="${pattern.id}">Open pattern: ${esc(patternDisplayTitle(pattern))}</button>`).join('')}</div>`);
    });
    const groupedResearch = evidenceSections.map(section => {
      const groups = patterns.map(pattern => {
        const observations = (pattern.observationIds || []).map(observationId => obs(observationId)).filter(observation => observation && section.dimensions.includes(observation.dimension));
        if (!observations.length) return '';
        return `<details><summary>${esc(patternDisplayTitle(pattern))} <span>${observations.length} observation${observations.length === 1 ? '' : 's'}</span></summary><div>${observations.map(observation => `<button class="evidence-source-button" data-source="${observation.sourceId}">“${esc(observation.excerpt)}”</button>`).join('')}</div></details>`;
      }).filter(Boolean).join('');
      return groups ? `<section class="persona-provenance-group"><h4>${esc(section.label)}</h4>${groups}</section>` : '';
    }).filter(Boolean).join('');
    sheet.insertAdjacentHTML('beforeend', `
      <section class="persona-provenance">
        <h3>Supporting research evidence</h3>
        <p class="persona-provenance-intro">Evidence is organised in the same order as the persona profile. Open any item to review the original source.</p>
        ${groupedResearch || '<p class="missing">No approved pattern evidence linked to a persona section yet.</p>'}
      </section>
      <section class="persona-version-history">
        <h3>Version history</h3>
        ${persona.history?.length ? persona.history.map(item => `<article><div><b>Version ${item.version}</b><span>${day(item.changed)} · ${esc(item.origin || 'manual')}</span></div><p>${esc(item.reason || 'No change reason recorded')}</p>${item.version < persona.version ? `<button class="tiny" data-restore-persona="${persona.id}" data-history-version="${item.version}">Restore this version</button>` : ''}</article>`).join('') : '<p class="missing">No previous versions.</p>'}
      </section>
    `);
    $$('#personaViewContent [data-source]').forEach(button => button.onclick = () => { closeDialogs(); openSource(button.dataset.source); });
    $$('#personaViewContent [data-open-persona-pattern]').forEach(button => button.onclick = () => { closeDialogs(); focusPatternCard(button.dataset.openPersonaPattern); });
    $$('#personaViewContent [data-restore-persona]').forEach(button => button.onclick = () => restorePersonaVersion(button.dataset.restorePersona, Number(button.dataset.historyVersion)));
    $('#editPersonaBtn').className = 'secondary';
    if (!persona.template && persona.status !== 'Validated') {
      $('#editPersonaBtn').insertAdjacentHTML('beforebegin', '<button type="button" class="primary" id="validatePersonaBtn">Validate persona</button>');
      $('#validatePersonaBtn').onclick = () => validatePersona(persona.id);
    }
    if (persona.template) {
      $('#editPersonaBtn').insertAdjacentHTML('beforebegin', `<button type="button" class="secondary template-delete-button" id="deleteTemplateBtn">Delete test persona</button>`);
      $('#deleteTemplateBtn').onclick = () => {
        templatePendingDeletion = persona.id;
        $('#deleteTemplateText').textContent = `Delete “${persona.name}” and all of its demonstration content?`;
        closeDialogs(); show('#deleteTemplateDialog');
      };
    }
  };

  function restorePersonaVersion(pid, version) {
    const persona = state.personas.find(item => item.id === pid);
    const snapshot = persona?.history?.find(item => item.version === version);
    if (!persona || !snapshot) return;
    persona.history.unshift({ version: persona.version, values: { name: persona.name, role: persona.role, goal: persona.goal, status: persona.status, behaviours: persona.behaviours || [], motivations: persona.motivations || [], constraints: persona.constraints || [], painPoints: persona.painPoints || [], needs: persona.needs || [], patternIds: persona.patternIds || [] }, reason: `Snapshot before restoring version ${version}`, changed: now(), origin: 'restore', evidencePatternIds: persona.patternIds || [] });
    Object.assign(persona, clone(snapshot.values), { version: persona.version + 1, updated: now(), template: false });
    log(`Restored ${persona.name} from version ${version}`);
    save(); closeDialogs(); render(); openPersonaDetails(pid); toast(`Version ${version} restored as a new version`);
  }

  function validatePersona(personaId) {
    const persona = state.personas.find(item => item.id === personaId && !item.template);
    if (!persona) return toast('This persona is no longer available');
    const approvedPatterns = evidenceForPersona(persona).filter(pattern => pattern.status === 'approved');
    if (!approvedPatterns.length) return toast('Link at least one approved grouped pattern before validating this persona');
    persona.history ??= [];
    persona.history.unshift({
      version: persona.version,
      values: { name: persona.name, role: persona.role, goal: persona.goal, status: persona.status, behaviours: persona.behaviours || [], motivations: persona.motivations || [], constraints: persona.constraints || [], painPoints: persona.painPoints || [], needs: persona.needs || [], patternIds: persona.patternIds || [] },
      reason: `Validated after reviewing ${approvedPatterns.length} approved supporting pattern${approvedPatterns.length === 1 ? '' : 's'}`,
      changed: now(), origin: 'researcher validation', evidencePatternIds: approvedPatterns.map(pattern => pattern.id),
    });
    persona.status = 'Validated';
    persona.version += 1;
    persona.updated = now();
    log(`Validated persona: ${persona.name}`);
    save(); render(); openPersonaDetails(persona.id); toast('Persona validated');
  }

  bindDynamic = function () {
    originalBindDynamic();
    $$('[data-edit-source]').forEach(button => button.onclick = () => editSource(button.dataset.editSource));
    $$('[data-source]').forEach(button => button.onclick = () => openSource(button.dataset.source));
    $$('[data-persona]').forEach(button => button.onclick = () => openPersonaDetails(button.dataset.persona));
    $$('[data-assign-proposal]').forEach(button => button.onclick = () => assignProposalToPersona(button.dataset.assignProposal));
    $$('[data-edit-gap]').forEach(button => button.onclick = () => editGap(button.dataset.editGap));
    $$('[data-review-persona-update]').forEach(button => button.onclick = () => reviewPersonaUpdate(button.dataset.reviewPersonaUpdate));
    $$('[data-edit-pattern-assignment]').forEach(button => button.onclick = () => editPatternAssignment(button.dataset.editPatternAssignment));
    $$('[data-focus-observation]').forEach(button => button.onclick = () => focusObservationCard(button.dataset.focusObservation));
    $$('[data-open-persona-pattern]').forEach(button => button.onclick = () => { closeDialogs(); focusPatternCard(button.dataset.openPersonaPattern); });
    $$('[data-review-solution]').forEach(button => button.onclick = () => reviewSolution(button.dataset.reviewSolution, button.dataset.result));
  };

  $('#researchForm').onsubmit = saveResearch;
  $('#sourceFile').onchange = event => { $('#sourceFileName').textContent = event.target.files[0]?.name || 'No file selected'; };
  $('#sourceImage').onchange = event => { $('#sourceImageName').textContent = event.target.files[0]?.name || 'No file selected'; };
  $('#personaForm').onsubmit = savePersona;
  $('#observationForm').onsubmit = saveObservation;
  $('#editObservationForm').onsubmit = event => {
    event.preventDefault();
    const observation = obs($('#editObservationId').value);
    if (!observation) return toast('Observation could not be found');
    const text = $('#editObservationText').value.trim();
    if (!text) return toast('Add an evidence-based observation');
    const previousDimension = observation.dimension;
    observation.dimension = $('#editObservationDimension').value;
    observation.text = text;
    observation.status = 'pending';
    observation.reviewState = 'edited';
    observation.updated = now();
    observation.editHistory ??= [];
    observation.editHistory.unshift({ at: now(), previousDimension, newDimension: observation.dimension });
    log(`Reclassified observation from ${previousDimension} to ${observation.dimension}`);
    save(); closeDialogs(); render(); go('analysis'); toast('Observation updated and moved to re-review');
  };
  $('#solutionForm').onsubmit = saveSolution;
  $('#personaViewDialog').addEventListener('click', event => {
    if (event.target === $('#personaViewDialog')) closeDialogs();
  });
  $('#addResearchBtn').onclick = () => openResearch();
  $('#quickAdd').onclick = () => openResearch();
  $('#newPersonaBtn').onclick = () => openPersonaForm();
  $('#compareBtn').onclick = comparePersonas;
  $('#clearPersonaSelectionBtn').onclick = () => {
    $$('#personaGrid [data-compare]').forEach(box => { box.checked = false; });
    $('#comparisonPanel').innerHTML = '';
    updatePersonaSelection();
  };
  $('#reanalyseBtn').onclick = () => {
    if (!state.research.length) return toast('Add research before starting a new analysis run');
    $('#confirmReanalysis').checked = false;
    show('#reanalyseDialog');
  };
  $('#reanalyseForm').onsubmit = async event => {
    event.preventDefault();
    if (!$('#confirmReanalysis').checked) return toast('Confirm that derived patterns will be archived and rebuilt');
    const archivedAt = now();
    state.analysisArchives.unshift({
      id: id('run'), archivedAt,
      observations: clone(state.observations), patterns: clone(state.patterns),
      proposals: clone(state.proposals), gaps: clone(state.gaps),
      personaEvidenceLinks: state.personas.filter(persona => !persona.template).map(persona => ({ personaId: persona.id, patternIds: clone(persona.patternIds || []) })),
    });
    for (const persona of state.personas.filter(item => !item.template)) {
      persona.history ??= [];
      persona.history.unshift({
        version: persona.version,
        values: { name: persona.name, role: persona.role, goal: persona.goal, status: persona.status, behaviours: persona.behaviours || [], motivations: persona.motivations || [], constraints: persona.constraints || [], painPoints: persona.painPoints || [], needs: persona.needs || [], patternIds: persona.patternIds || [] },
        reason: 'Evidence links archived before a complete reanalysis', changed: archivedAt, origin: 'analysis reset', evidencePatternIds: clone(persona.patternIds || []),
      });
      persona.patternIds = [];
      persona.status = 'Unvalidated';
      persona.updated = archivedAt;
    }
    state.observations = state.observations.filter(observation => observation.status === 'approved');
    state.patterns = [];
    state.proposals = [];
    state.gaps = [];
    state.research.forEach(record => { record.processed = false; record.reanalysisRequestedAt = archivedAt; });
    log(`Preserved approved observations, archived derived patterns and queued ${state.research.length} source(s) for regrouping`);
    save(); closeDialogs(); render(); go('analysis');
    toast('Approved observations preserved. Rebuilding semantic patterns…');
    await analyse();
  };
  $('#deleteTemplateForm').onsubmit = event => {
    event.preventDefault();
    const persona = state.personas.find(item => item.id === templatePendingDeletion && item.template);
    if (!persona) return closeDialogs();
    state.deletedTemplateIds ??= [];
    state.deletedTemplateIds = [...new Set([...state.deletedTemplateIds, persona.id])];
    state.personas = state.personas.filter(item => item.id !== persona.id);
    purgePersonaArtifacts(persona.id, persona.name);
    activePersona = null;
    $('#comparisonPanel').innerHTML = '';
    log('Deleted a test persona and its derived references');
    templatePendingDeletion = null;
    save(); closeDialogs(); render(); go('personas'); toast('Test persona deleted');
  };

  analyse = async function () {
    const pending = state.research.filter(record => !record.processed);
    if (!pending.length) return toast('No unprocessed research sources');
    const endpoint = state.settings.endpoint;
    if (!endpoint) return toast('Configure an analysis backend in Settings');
    const existingPatterns = state.patterns.filter(pattern => pattern.status !== 'rejected').map(pattern => {
      const evidence = (pattern.observationIds || []).map(observationId => obs(observationId)).filter(Boolean);
      const sourceRecords = evidence.map(observation => source(observation.sourceId)).filter(Boolean);
      return { id: pattern.id, title: patternDisplayTitle(pattern), summary: pattern.summary, dimension: patternDimension(pattern), participantRoles: [...new Set(sourceRecords.map(explicitRoleFromSource).filter(Boolean))] };
    });
    $('#analyseBtn').disabled = true;
    $('#analyseBtn').textContent = 'Analysing…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const startupNotice = setTimeout(() => {
      $('#analyseBtn').textContent = 'Starting analysis service…';
      $('#aiConfigNotice').className = 'notice neutral';
      $('#aiConfigNotice').innerHTML = '<b>The secure analysis service is starting.</b> This can take up to one minute after a period of inactivity.';
    }, 8000);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ project: { name: 'Lost & Found Pets', location: 'Lisbon, Portugal' }, provider: state.settings.provider, model: state.settings.model, sources: pending.map(({ fileData, ...record }) => record), existingPatterns }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Backend returned ${response.status}`);
      if (!Array.isArray(data.observations)) throw new Error('Backend response did not include observations');
      const keyToId = new Map();
      const matchedPatternByKey = new Map();
      for (const raw of data.observations) {
        const sourceRecord = source(raw.sourceId);
        if (!sourceRecord || !raw.excerpt || !sourceRecord.content.includes(raw.excerpt)) continue;
        const existingObservation = state.observations.find(observation => observation.sourceId === sourceRecord.id && observation.dimension === (raw.dimension || 'Unknown') && observation.excerpt === raw.excerpt);
        const observationId = existingObservation?.id || id('obs');
        keyToId.set(raw.key, observationId);
        const matchedPattern = state.patterns.find(pattern => pattern.id === raw.existingPatternId && pattern.status !== 'rejected');
        if (matchedPattern) matchedPatternByKey.set(raw.key, matchedPattern.id);
        if (!existingObservation) state.observations.unshift({ id: observationId, sourceId: sourceRecord.id, dimension: raw.dimension || 'Unknown', text: raw.text, excerpt: raw.excerpt, evidenceType: raw.evidenceType === 'Interpretation' ? 'Interpretation' : 'Direct observation', status: 'pending', origin: 'AI', created: now(), reviewNote: '', suggestedPatternId: matchedPattern?.id || null });
      }
      for (const proposed of data.patterns || []) {
        const unmatchedKeys = (proposed.observationKeys || []).filter(key => !matchedPatternByKey.has(key));
        const observationIds = unmatchedKeys.map(key => keyToId.get(key)).filter(Boolean);
        const counterEvidenceIds = (proposed.counterEvidenceKeys || []).map(key => keyToId.get(key)).filter(Boolean);
        const independentSources = new Set(observationIds.map(observationId => obs(observationId)?.sourceId));
        if (observationIds.length >= 2 && independentSources.size >= 2) state.patterns.unshift({ id: id('pat'), title: proposed.title, summary: proposed.summary, observationIds, counterEvidenceIds, status: 'pending', created: now(), origin: 'AI grouping', history: [{ action: 'AI grouping', at: now(), observationIds: [...observationIds] }] });
      }
      pending.forEach(record => { record.processed = true; });
      log(`AI analysed ${pending.length} source(s), compared them with ${existingPatterns.length} existing pattern(s), and proposed ${keyToId.size} observation(s)`);
      save(); render(); toast('New evidence was compared with existing patterns and is ready for review');
    } catch (error) {
      const message = error.name === 'AbortError' ? 'The analysis service did not respond within 60 seconds. No findings were changed. Please try again after the backend has restarted.' : error.message;
      toast(`Analysis unavailable: ${message}`);
      $('#aiConfigNotice').className = 'notice';
      $('#aiConfigNotice').innerHTML = `<b>Analysis stopped safely—no findings were created.</b> ${esc(message)}`;
    } finally {
      clearTimeout(timeout);
      clearTimeout(startupNotice);
      $('#analyseBtn').disabled = false;
      $('#analyseBtn').textContent = '✦ Analyse unprocessed research';
    }
  };
  $('#analyseBtn').onclick = analyse;
  $('#exportBackupBtn').onclick = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: now(), schemaVersion: 2, data: state }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `persona-builder-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href);
  };
  $('#importBackupFile').onchange = async event => {
    try {
      const backup = JSON.parse(await event.target.files[0].text());
      if (!backup?.data?.research || !Array.isArray(backup.data.personas)) throw new Error('Unsupported backup format');
      state = { ...clone(EMPTY), ...backup.data, settings: { ...EMPTY.settings, ...backup.data.settings }, refresh: { ...EMPTY.refresh, ...backup.data.refresh } };
      save(); closeDialogs(); render(); toast('Research repository restored from backup');
    } catch (error) { toast(`Backup import failed: ${error.message}`); }
  };

  // Prevent browser-localised validation bubbles (for example Safari showing
  // Russian UI text) and keep all validation feedback inside the English app UI.
  $$('form').forEach(form => {
    form.noValidate = true;
    form.addEventListener('submit', event => {
      const missing = [...form.querySelectorAll('[required]')].find(field => {
        if (field.type === 'checkbox' || field.type === 'radio') return !field.checked;
        if (field.multiple) return !field.selectedOptions.length;
        return !field.value.trim();
      });
      if (!missing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const label = missing.closest('label')?.childNodes[0]?.textContent?.trim() || 'required field';
      toast(`Complete the ${label.toLowerCase()} field`);
      missing.focus();
    }, true);
  });

  render();
})();
