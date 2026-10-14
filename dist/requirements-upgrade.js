/* Requirements upgrade: structured source metadata, fuller provenance and persona version control. */
(() => {
  const MISSING_SOURCE_VALUE = 'Not found in source — please verify';
  const originalBindDynamic = bindDynamic;
  const originalOpenPersonaDetails = openPersonaDetails;
  const originalOpenPersonaForm = openPersonaForm;

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

  function assignProposalToPersona(proposalId) {
    const candidates = state.personas.filter(persona => !persona.template);
    if (!candidates.length) return toast('Create an evidence-based persona first');
    const answer = prompt(`Assign to persona:\n${candidates.map((persona, index) => `${index + 1}. ${persona.name}`).join('\n')}`, '1');
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

  function editGap(gapId) {
    const gap = state.gaps.find(item => item.id === gapId);
    const text = prompt('Edit the evidence-linked interpretation.', gap.text);
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

  openPersonaForm = function (pid = null, pattern = null) {
    originalOpenPersonaForm(pid, pattern);
    const persona = pid ? state.personas.find(item => item.id === pid) : null;
    const selected = new Set(persona?.patternIds || (pattern ? [pattern.id] : []));
    $('#personaEvidencePatterns').innerHTML = state.patterns.filter(item => item.status === 'approved').map(item => `<option value="${item.id}" ${selected.has(item.id) ? 'selected' : ''}>${esc(item.title)}</option>`).join('');
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

  openPersonaDetails = function (pid) {
    originalOpenPersonaDetails(pid);
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
  };

  $('#researchForm').onsubmit = saveResearch;
  $('#sourceFile').onchange = event => { $('#sourceFileName').textContent = event.target.files[0]?.name || 'No file selected'; };
  $('#sourceImage').onchange = event => { $('#sourceImageName').textContent = event.target.files[0]?.name || 'No file selected'; };
  $('#personaForm').onsubmit = savePersona;
  $('#observationForm').onsubmit = saveObservation;
  $('#solutionForm').onsubmit = saveSolution;
  $('#addResearchBtn').onclick = () => openResearch();
  $('#quickAdd').onclick = () => openResearch();
  $('#newPersonaBtn').onclick = () => openPersonaForm();
  $('#compareBtn').onclick = comparePersonas;
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

  render();
})();
