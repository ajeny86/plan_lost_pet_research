/* Requirements upgrade: structured source metadata, fuller provenance and persona version control. */
(() => {
  const MISSING_SOURCE_VALUE = 'Not found in source — please verify';
  const originalBindDynamic = bindDynamic;
  const originalOpenPersonaDetails = openPersonaDetails;
  const originalOpenPersonaForm = openPersonaForm;
  const originalPersonas = personas;

  state.analysisArchives ??= [];
  state.personaUpdates ??= [];
  let templatePendingDeletion = null;

  // Approved observations remain evidence observations. Only the AI analysis
  // creates cross-source patterns; approval must never create a one-item pattern.
  groupApprovedObservations = function () {};

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
    <label>Supporting approved patterns<select id="personaEvidencePatterns" multiple size="4"></select></label>
  `);

  $('#solutionStatus').closest('label').insertAdjacentHTML('afterend', `
    <label>Relevant personas<select id="solutionPersonas" multiple size="4"></select></label>
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
      ['Needs', persona => (persona.needs || []).join(' · ')], ['Validation', persona => persona.template ? 'Test template' : persona.status],
      ['Supporting patterns', persona => (persona.patternIds || []).map(patternId => state.patterns.find(pattern => pattern.id === patternId)?.title).filter(Boolean).join(' · ') || 'No linked evidence'],
    ];
    $('#comparisonPanel').innerHTML = `<section class="comparison"><div class="section-label"><h2>Persona comparison</h2><span>${list.length} selected</span></div><div class="compare-table" style="grid-template-columns:150px repeat(${list.length},minmax(190px,1fr))"><b>Attribute</b>${list.map(persona => `<b>${esc(persona.name)}</b>`).join('')}${rows.map(([label, getter]) => `<span>${label}</span>${list.map(persona => `<div>${esc(getter(persona) || 'Insufficient evidence')}</div>`).join('')}`).join('')}</div></section>`;
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

  gaps = function () {
    $('#gapList').innerHTML = state.gaps.length ? state.gaps.map(gap => {
      const patterns = gap.patternIds.map(patternId => state.patterns.find(pattern => pattern.id === patternId)).filter(Boolean);
      const evidence = patterns.flatMap(pattern => pattern.observationIds.map(observationId => obs(observationId))).filter(Boolean);
      return `<article class="pattern-card"><span class="status ${gap.status}">${esc(gap.status)}</span><div class="card-title">${esc(gap.type)} · ${esc(gap.title)}</div><p>${esc(gap.text)}</p><div class="meta">Supporting patterns: ${patterns.map(pattern => esc(pattern.title)).join('; ')}</div><details class="proposal-evidence"><summary>View source evidence</summary>${evidence.map(item => `<button data-source="${item.sourceId}">“${esc(item.excerpt)}”</button>`).join('')}</details>${gap.status === 'pending' ? `<div class="review-actions"><button class="tiny" data-review-gap="${gap.id}" data-result="approved">Approve</button><button class="tiny" data-edit-gap="${gap.id}">Edit</button><button class="tiny" data-review-gap="${gap.id}" data-result="rejected">Reject</button></div>` : ''}</article>`;
    }).join('') : empty('No connections or gaps', 'Add one only when approved patterns provide supporting evidence.');
    bindDynamic();
  };

  async function editGap(gapId) {
    const gap = state.gaps.find(item => item.id === gapId);
    const text = await requestText('Edit connection or gap', 'Evidence-linked interpretation', gap.text);
    if (!text?.trim()) return;
    gap.text = text.trim(); gap.status = 'pending'; gap.updated = now();
    log(`Edited connection or gap: ${gap.title}`); save(); render();
  }

  const originalOpenSolution = openSolution;
  openSolution = function (solutionId = null) {
    originalOpenSolution(solutionId);
    const solution = solutionId ? state.solutions.find(item => item.id === solutionId) : null;
    const selected = new Set(solution?.personaIds || []);
    $('#solutionPersonas').innerHTML = state.personas.filter(persona => !persona.template).map(persona => `<option value="${persona.id}" ${selected.has(persona.id) ? 'selected' : ''}>${esc(persona.name)}</option>`).join('');
  };

  saveSolution = function (event) {
    event.preventDefault();
    const evidenceId = $('#solutionEvidence').value;
    const evidenceLabel = $('#solutionEvidence').selectedOptions[0]?.textContent || 'Unknown evidence';
    const personaIds = [...$('#solutionPersonas').selectedOptions].map(item => item.value);
    const data = { title: $('#solutionTitle').value.trim(), problem: $('#solutionProblem').value.trim(), text: $('#solutionText').value.trim(), evidenceId, evidenceLabel, personaIds, status: $('#solutionStatus').value, comment: $('#solutionComment').value.trim(), updated: now() };
    const solutionId = event.target.dataset.id;
    if (solutionId) Object.assign(state.solutions.find(item => item.id === solutionId), data);
    else state.solutions.unshift({ id: id('sol'), ...data, created: now() });
    log(`${solutionId ? 'Updated' : 'Added'} solution hypothesis: ${data.title}`); save(); closeDialogs(); render(); toast('Solution hypothesis saved');
  };

  solutions = function () {
    $('#solutionList').innerHTML = state.solutions.length ? state.solutions.map(solution => {
      const names = (solution.personaIds || []).map(personaId => state.personas.find(persona => persona.id === personaId)?.name).filter(Boolean);
      return `<article class="pattern-card"><span class="status ${solution.status.toLowerCase().replaceAll(' ', '-')}">${esc(solution.status)}</span><div class="card-title">${esc(solution.title)}</div><p><b>Problem:</b> ${esc(solution.problem)}</p><p><b>Hypothesis:</b> ${esc(solution.text)}</p><div class="meta">Evidence: ${esc(solution.evidenceLabel)}${names.length ? ` · Personas: ${esc(names.join(', '))}` : ''}${solution.comment ? ` · Comment: ${esc(solution.comment)}` : ''}</div><div class="review-actions"><button class="tiny" data-edit-solution="${solution.id}">Edit / update status</button></div></article>`;
    }).join('') : empty('No solution hypotheses', 'Add an idea only after an evidence-backed problem or gap is identified.');
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

  openPersonaForm = function (pid = null, pattern = null) {
    delete $('#personaForm').dataset.updateId;
    originalOpenPersonaForm(pid, pattern);
    const persona = pid ? state.personas.find(item => item.id === pid) : null;
    const selected = new Set([...(persona?.patternIds || []), ...(pattern ? [pattern.id] : [])]);
    $('#personaEvidencePatterns').innerHTML = state.patterns.filter(item => item.status === 'approved').map(item => `<option value="${item.id}" ${selected.has(item.id) ? 'selected' : ''}>${esc(item.title)}</option>`).join('');
    if (pattern && !pid) {
      const context = personaContextFromPattern(pattern);
      const evidence = context.evidence;
      const unique = values => [...new Set(values.map(item => item?.trim()).filter(Boolean))];
      const byDimension = dimensions => unique(evidence.filter(item => dimensions.includes(item.dimension)).map(item => item.text));
      const behaviours = byDimension(['Action', 'Decision-making', 'Interaction', 'Level of involvement']);
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
      append('#personaBehaviours', ['Action', 'Decision-making', 'Interaction', 'Level of involvement']);
      append('#personaMotivations', ['Motivation']);
      append('#personaConstraints', ['Constraint']);
      append('#personaPainPoints', ['Problem']);
      append('#personaNeeds', ['Need']);
      $('#personaDialogTitle').textContent = 'Review persona update from approved pattern';
      $('#personaReason').value = `Updated from approved pattern: ${pattern.title}`;
      $('#personaHistory').insertAdjacentHTML('afterbegin', `<div class="notice ok"><b>Approved evidence mapped for review.</b><br>Existing researcher-authored content was preserved. A previous system-generated title or goal was corrected only when it still matched the original pattern summary.${context.goalDerivedFromContext ? ' The proposed main goal is derived from the explicit role and lost/found situation and still requires your confirmation.' : ''}</div>`);
    }
  };

  personaFromPattern = async function (patternId) {
    const pattern = state.patterns.find(item => item.id === patternId);
    if (!pattern) return;
    const context = personaContextFromPattern(pattern);
    const evidenceBased = state.personas.filter(persona => !persona.template);
    const sameRole = context.role ? evidenceBased.filter(persona => persona.role === context.role) : [];
    const candidates = sameRole.length ? sameRole : evidenceBased;
    if (!candidates.length) return toast('Create an empty proto-persona first, then add this pattern to it');
    const answer = candidates.length === 1 ? '1' : await requestText('Add pattern to persona', `Enter a number: ${candidates.map((persona, index) => `${index + 1}. ${persona.name}`).join(' · ')}`, '1');
    const persona = candidates[Number(answer) - 1];
    if (!persona) return;
    let update = state.personaUpdates.find(item => item.personaId === persona.id && item.status === 'pending');
    if (!update) {
      update = { id: id('update'), personaId: persona.id, patternIds: [], status: 'pending', created: now() };
      state.personaUpdates.unshift(update);
    }
    update.patternIds = [...new Set([...update.patternIds, patternId])];
    update.updated = now();
    log(`Queued approved evidence for ${persona.name}`);
    save(); render(); toast(`Pattern added to ${persona.name}'s update queue`);
  };

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
      $('#personaBehaviours').value = (draft.behaviours || []).join('\n');
      $('#personaMotivations').value = (draft.motivations || []).join('\n');
      $('#personaConstraints').value = (draft.constraints || []).join('\n');
      $('#personaPainPoints').value = (draft.painPoints || []).join('\n');
      $('#personaNeeds').value = (draft.needs || []).join('\n');
    } catch (error) {
      toast(`Persona synthesis unavailable: ${error.message}`);
      if (trigger) { trigger.disabled = false; trigger.textContent = 'Review proposed update'; }
      return;
    }
    patterns.forEach(pattern => { const option = $(`#personaEvidencePatterns option[value="${pattern.id}"]`); if (option) option.selected = true; });
    $('#personaDialogTitle').textContent = 'Review proposed persona update';
    $('#personaReason').value = `AI synthesis reviewed from approved evidence: ${patterns.map(pattern => pattern.title).join('; ')}`;
    $('#personaForm').dataset.updateId = update.id;
    $('#personaHistory').insertAdjacentHTML('afterbegin', `<div class="notice neutral"><b>Patterns were merged by meaning; nothing has been applied yet.</b><br>The AI rewrote all sections from the complete approved evidence package. Review every field. Saving creates a new persona version and records the supporting patterns.</div>`);
  }

  personas = function () {
    originalPersonas();
    const pending = state.personaUpdates.filter(item => item.status === 'pending').map(item => ({ ...item, persona: state.personas.find(persona => persona.id === item.personaId) })).filter(item => item.persona);
    $('#personaUpdateQueue').innerHTML = pending.length ? `<section class="persona-update-queue"><h2>New evidence available</h2><p>Approved patterns are waiting to be semantically merged and reviewed before they change a persona.</p>${pending.map(item => `<article class="persona-update-item"><div><b>${esc(item.persona.name)}</b><p>${item.patternIds.length} new approved pattern${item.patternIds.length === 1 ? '' : 's'} ready for full persona re-synthesis.</p></div><button class="primary" data-review-persona-update="${item.id}">Review proposed update</button></article>`).join('')}</section>` : '';
    $$('[data-review-persona-update]').forEach(button => button.onclick = () => reviewPersonaUpdate(button.dataset.reviewPersonaUpdate));
  };

  savePersona = function (event) {
    event.preventDefault();
    const pid = $('#personaId').value;
    const evidencePatternIds = [...$('#personaEvidencePatterns').selectedOptions].map(item => item.value);
    const record = {
      name: $('#personaName').value.trim(), role: $('#personaRole').value.trim(), goal: $('#personaGoal').value.trim(),
      behaviours: lines($('#personaBehaviours').value), motivations: lines($('#personaMotivations').value), constraints: lines($('#personaConstraints').value),
      painPoints: lines($('#personaPainPoints').value), needs: lines($('#personaNeeds').value), status: $('#personaStatus').value, patternIds: evidencePatternIds,
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
      return `<article class="observation-card"><span class="status ${reviewGroup(observation)}">${reviewGroup(observation) === 'edited' ? 'edited' : observation.status}</span><div class="card-title">${esc(observation.dimension)}</div><p>${esc(observation.text)}</p><div class="excerpt">“${esc(observation.excerpt)}”</div><div class="meta">${esc(observation.evidenceType)} · Source: ${esc(sourceRecord?.title || 'Missing source')}</div><div class="review-actions">${editable ? `<button class="tiny" data-review-observation="${observation.id}" data-result="approved">Approve</button><button class="tiny" data-edit-observation="${observation.id}">Edit</button><button class="tiny" data-review-observation="${observation.id}" data-result="rejected">Reject</button>` : observation.status === 'approved' ? `<button class="tiny" data-edit-observation="${observation.id}">Edit</button>` : ''}<button class="tiny" data-source="${observation.sourceId}">Open source</button></div></article>`;
    }, 'No observations in this review state.', observation => observation.dimension);
    $('#patternList').innerHTML = groupedReviewMarkup(patterns, pattern => {
      const editable = reviewGroup(pattern) === 'pending' || reviewGroup(pattern) === 'edited';
      const linkedPersonas = state.personas.filter(persona => !persona.template && (persona.patternIds || []).includes(pattern.id));
      const queuedPersonas = state.personaUpdates.filter(update => update.status === 'pending' && update.patternIds.includes(pattern.id)).map(update => state.personas.find(persona => persona.id === update.personaId)).filter(Boolean);
      const application = pattern.status === 'approved' ? `<div class="pattern-application ${linkedPersonas.length ? 'applied' : 'not-applied'}">${queuedPersonas.length ? `Queued for review: ${esc(queuedPersonas.map(persona => persona.name).join(', '))}` : linkedPersonas.length ? `Applied to: ${esc(linkedPersonas.map(persona => persona.name).join(', '))}` : 'Approved · Not yet assigned to a persona'}</div>` : '';
      const dimension = patternDimension(pattern);
      return `<article class="pattern-card"><label class="pattern-select"><input type="checkbox" data-pattern-select="${pattern.id}"> Select</label><span class="status ${reviewGroup(pattern)}">${reviewGroup(pattern) === 'edited' ? 'edited' : pattern.status}</span><span class="dimension-chip">${esc(DIMENSION_LABELS[dimension] || dimension)}</span><div class="card-title pattern-full-title">${esc(patternDisplayTitle(pattern))}</div><p class="pattern-full-summary"><b>Pattern meaning:</b> ${esc(pattern.summary)}</p><div class="meta">${pattern.observationIds.length} observation${pattern.observationIds.length === 1 ? '' : 's'} · ${new Set(pattern.observationIds.map(id => obs(id)?.sourceId)).size} independent source(s)</div>${application}<details class="grouped-evidence"><summary>View supporting evidence</summary><div class="evidence-proof-list">${pattern.observationIds.map(id => { const observation = obs(id); const sourceRecord = observation && source(observation.sourceId); return observation ? `<button class="evidence-proof" data-source="${observation.sourceId}"><span class="evidence-proof-head"><b>${esc(DIMENSION_LABELS[observation.dimension] || observation.dimension)}</b><span class="dimension-chip">${esc(observation.evidenceType)}</span></span><p>${esc(observation.text)}</p><blockquote>“${esc(observation.excerpt)}”</blockquote><small>Source: ${esc(sourceRecord?.title || 'Missing source')}</small></button>` : ''; }).join('')}</div></details><div class="review-actions">${editable ? `<button class="tiny" data-review-pattern="${pattern.id}" data-result="approved">Approve</button><button class="tiny" data-edit-pattern="${pattern.id}">Edit</button><button class="tiny" data-review-pattern="${pattern.id}" data-result="rejected">Reject</button>` : pattern.status === 'approved' ? `<button class="tiny" data-edit-pattern="${pattern.id}">Edit</button><button class="tiny" data-pattern-persona="${pattern.id}" ${queuedPersonas.length ? 'disabled' : ''}>${queuedPersonas.length ? 'Added to persona update queue' : 'Add pattern to persona'}</button>` : ''}${pattern.observationIds.length > 1 ? `<button class="tiny" data-split-pattern="${pattern.id}">Split pattern</button>` : ''}</div></article>`;
    }, 'No patterns in this review state.', patternDimension);
    bindDynamic();
  };

  openPersonaDetails = function (pid) {
    originalOpenPersonaDetails(pid);
    $('#deleteTemplateBtn')?.remove();
    const persona = state.personas.find(item => item.id === pid);
    const patterns = evidenceForPersona(persona);
    const sheet = $('#personaViewContent .persona-view-sheet');
    sheet.insertAdjacentHTML('beforeend', `
      <section class="persona-provenance">
        <h3>Supporting research evidence</h3>
        ${patterns.length ? patterns.map(pattern => `<details><summary>${esc(pattern.title)} <span>${pattern.observationIds.length} observation(s)</span></summary><div>${pattern.observationIds.map(observationId => { const observation = obs(observationId); return observation ? `<button class="evidence-source-button" data-source="${observation.sourceId}">“${esc(observation.excerpt)}”</button>` : ''; }).join('')}</div></details>`).join('') : '<p class="missing">No approved pattern evidence linked yet.</p>'}
      </section>
      <section class="persona-version-history">
        <h3>Version history</h3>
        ${persona.history?.length ? persona.history.map(item => `<article><div><b>Version ${item.version}</b><span>${day(item.changed)} · ${esc(item.origin || 'manual')}</span></div><p>${esc(item.reason || 'No change reason recorded')}</p>${item.version < persona.version ? `<button class="tiny" data-restore-persona="${persona.id}" data-history-version="${item.version}">Restore this version</button>` : ''}</article>`).join('') : '<p class="missing">No previous versions.</p>'}
      </section>
    `);
    $$('#personaViewContent [data-source]').forEach(button => button.onclick = () => { closeDialogs(); openSource(button.dataset.source); });
    $$('#personaViewContent [data-restore-persona]').forEach(button => button.onclick = () => restorePersonaVersion(button.dataset.restorePersona, Number(button.dataset.historyVersion)));
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

  bindDynamic = function () {
    originalBindDynamic();
    $$('[data-edit-source]').forEach(button => button.onclick = () => editSource(button.dataset.editSource));
    $$('[data-source]').forEach(button => button.onclick = () => openSource(button.dataset.source));
    $$('[data-persona]').forEach(button => button.onclick = () => openPersonaDetails(button.dataset.persona));
    $$('[data-assign-proposal]').forEach(button => button.onclick = () => assignProposalToPersona(button.dataset.assignProposal));
    $$('[data-edit-gap]').forEach(button => button.onclick = () => editGap(button.dataset.editGap));
    $$('[data-review-persona-update]').forEach(button => button.onclick = () => reviewPersonaUpdate(button.dataset.reviewPersonaUpdate));
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
  $('#addResearchBtn').onclick = () => openResearch();
  $('#quickAdd').onclick = () => openResearch();
  $('#newPersonaBtn').onclick = () => openPersonaForm();
  $('#compareBtn').onclick = comparePersonas;
  $('#reanalyseBtn').onclick = () => {
    if (!state.research.length) return toast('Add research before starting a new analysis run');
    $('#confirmReanalysis').checked = false;
    show('#reanalyseDialog');
  };
  $('#reanalyseForm').onsubmit = async event => {
    event.preventDefault();
    if (!$('#confirmReanalysis').checked) return toast('Confirm that previous approvals will be archived');
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
    state.observations = [];
    state.patterns = [];
    state.proposals = [];
    state.gaps = [];
    state.research.forEach(record => { record.processed = false; record.reanalysisRequestedAt = archivedAt; });
    log(`Archived the previous analysis and queued ${state.research.length} source(s) for reanalysis`);
    save(); closeDialogs(); render(); go('analysis');
    toast('Previous analysis archived. Starting a new analysis run…');
    await analyse();
  };
  $('#deleteTemplateForm').onsubmit = event => {
    event.preventDefault();
    const persona = state.personas.find(item => item.id === templatePendingDeletion && item.template);
    if (!persona) return closeDialogs();
    state.personas = state.personas.filter(item => item.id !== persona.id);
    state.personaUpdates = state.personaUpdates.filter(item => item.personaId !== persona.id);
    log(`Deleted test persona: ${persona.name}`);
    templatePendingDeletion = null;
    save(); closeDialogs(); render(); go('personas'); toast('Test persona deleted');
  };
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
