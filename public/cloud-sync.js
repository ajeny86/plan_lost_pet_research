/* Shared D1 persistence plus evidence-workflow guidance. */
(() => {
  const localSave = save;
  const ARRAY_KEYS = ['research', 'observations', 'patterns', 'personas', 'proposals', 'gaps', 'solutions', 'activity', 'analysisArchives', 'personaUpdates'];
  let cloudRevision = null;
  let cloudReady = false;
  let cloudSaving = false;
  let cloudDirty = false;
  let saveTimer = null;
  let cloudState = 'working';
  let cloudMessage = 'Connecting to cloud storage…';

  function status(message, mode = 'working') {
    cloudMessage = message;
    cloudState = mode;
    const badge = document.querySelector('#cloudSyncStatus');
    if (badge) {
      badge.textContent = message;
      badge.dataset.state = mode;
    }
  }

  function recordTime(record = {}) {
    return Date.parse(record.updated || record.imported || record.reviewed || record.created || record.changed || 0) || 0;
  }

  function mergeCollection(remote = [], local = []) {
    const records = new Map();
    for (const item of [...remote, ...local]) {
      if (!item || !item.id) continue;
      const existing = records.get(item.id);
      if (!existing || recordTime(item) > recordTime(existing)) records.set(item.id, item);
    }
    return [...records.values()];
  }

  function mergeRepositories(remote, local) {
    const merged = {
      ...clone(EMPTY),
      ...remote,
      settings: { ...EMPTY.settings, ...(remote.settings || {}) },
      refresh: { ...EMPTY.refresh, ...(remote.refresh || {}) },
    };
    for (const key of ARRAY_KEYS) merged[key] = mergeCollection(remote[key], local[key]);
    merged.deletedTemplateIds = [...new Set([...(remote.deletedTemplateIds || []), ...(local.deletedTemplateIds || [])])];
    merged.personas = merged.personas.filter(persona => !merged.deletedTemplateIds.includes(persona.id));
    return merged;
  }

  function hasResearchWork(repository) {
    return Boolean(repository.research?.length || repository.observations?.length || repository.patterns?.length || repository.personas?.some(persona => !persona.template));
  }

  async function pushCloudState() {
    if (!cloudReady || cloudSaving) return;
    cloudSaving = true;
    clearTimeout(saveTimer);
    try {
      while (cloudDirty) {
        cloudDirty = false;
        status('Saving to cloud…', 'working');
        const response = await fetch('/api/state', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ state, revision: cloudRevision }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 409) {
            status('Cloud changed elsewhere — reload required', 'error');
            toast('Cloud data changed on another device. Reload this page before making more changes.');
          } else {
            status('Saved on this device only', 'local');
            toast(data.error || 'Cloud sync is temporarily unavailable');
          }
          cloudDirty = false;
          return;
        }
        cloudRevision = data.revision;
        localStorage.setItem(`${KEY}-cloud-revision`, String(cloudRevision));
        status('Saved to shared cloud database', 'saved');
      }
    } catch {
      status('Saved on this device only', 'local');
    } finally {
      cloudSaving = false;
      renderWorkflowGuide();
    }
  }

  function scheduleCloudSave(immediate = false) {
    if (!cloudReady) return;
    cloudDirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushCloudState, immediate ? 0 : 450);
  }

  save = function () {
    localSave();
    scheduleCloudSave();
  };

  function step(number, title, message, label, target, action) {
    return `<article class="workflow-step" data-status="${action ? 'action' : 'done'}"><div class="workflow-step-top"><span class="workflow-step-number">${number}</span><span class="workflow-step-state">${action ? 'Needs attention' : 'Up to date'}</span></div><h3>${esc(title)}</h3><p>${esc(message)}</p><button type="button" data-workflow-go="${target}">${esc(label)}</button></article>`;
  }

  function renderWorkflowGuide() {
    const grid = document.querySelector('#workflowStepGrid');
    if (!grid) return;
    const unprocessed = state.research.filter(item => !item.processed).length;
    const pendingEvidence = state.observations.filter(item => item.status === 'pending' || item.reviewState === 'edited').length;
    const pendingPatterns = state.patterns.filter(item => item.status === 'pending' || item.reviewState === 'edited').length;
    const approvedPatterns = state.patterns.filter(item => item.status === 'approved');
    const linkedPatterns = new Set(state.personas.flatMap(persona => persona.patternIds || []));
    const patternsReadyForPersonas = approvedPatterns.filter(pattern => !linkedPatterns.has(pattern.id)).length;
    const pendingPersonaUpdates = (state.personaUpdates || []).filter(item => item.status === 'pending').length;
    const pendingProposals = state.proposals.filter(item => item.status === 'pending').length;
    const unvalidatedPersonas = state.personas.filter(item => !item.template && item.status !== 'Validated').length;
    const pendingGaps = state.gaps.filter(item => item.status === 'pending').length;
    const activePersonas = state.personas.filter(item => !item.template).length;
    const pendingSolutions = state.solutions.filter(item => !['Approved Idea', 'Validated', 'Rejected'].includes(item.status)).length;

    const researchAction = unprocessed > 0;
    const analysisAction = pendingEvidence + pendingPatterns > 0;
    const personaAction = patternsReadyForPersonas + pendingPersonaUpdates + pendingProposals + unvalidatedPersonas > 0;
    const gapAction = pendingGaps > 0 || (activePersonas >= 2 && state.gaps.length === 0);
    const solutionAction = pendingSolutions > 0 || (state.solutions.length === 0 && (approvedPatterns.length > 0 || state.gaps.some(item => item.status === 'approved')));

    grid.innerHTML = [
      step(1, 'Research Data', researchAction ? `${unprocessed} new source${unprocessed === 1 ? '' : 's'} must be analysed.` : `${state.research.length} source${state.research.length === 1 ? '' : 's'} stored; nothing is waiting for analysis.`, researchAction ? 'Go to AI Analysis' : 'Review research', researchAction ? 'analysis' : 'research', researchAction),
      step(2, 'AI Analysis', analysisAction ? `${pendingEvidence} observation${pendingEvidence === 1 ? '' : 's'} and ${pendingPatterns} pattern${pendingPatterns === 1 ? '' : 's'} still need review.` : patternsReadyForPersonas ? `${patternsReadyForPersonas} approved pattern${patternsReadyForPersonas === 1 ? '' : 's'} can now update a persona.` : 'All current observations and grouped patterns have been reviewed.', analysisAction ? 'Continue review' : patternsReadyForPersonas ? 'Use approved patterns' : 'Open analysis', analysisAction ? 'analysis' : patternsReadyForPersonas ? 'personas' : 'analysis', analysisAction || patternsReadyForPersonas > 0),
      step(3, 'Personas', pendingPersonaUpdates ? `${pendingPersonaUpdates} evidence update${pendingPersonaUpdates === 1 ? '' : 's'} must be synthesised and approved.` : pendingProposals ? `${pendingProposals} possible new persona${pendingProposals === 1 ? '' : 's'} must be reviewed.` : unvalidatedPersonas ? `${unvalidatedPersonas} research persona${unvalidatedPersonas === 1 ? '' : 's'} still need validation.` : activePersonas ? 'Current research personas are validated and ready for relationship mapping.' : 'No research persona has been created yet.', pendingProposals ? 'Review proposed personas' : 'Open personas', pendingProposals ? 'proposed' : 'personas', personaAction),
      step(4, 'Connections & Gaps', pendingGaps ? `${pendingGaps} relationship${pendingGaps === 1 ? '' : 's'} need review before they can guide solutions.` : activePersonas >= 2 && !state.gaps.length ? 'The personas are ready, but their connections and gaps have not been mapped yet.' : state.gaps.length ? 'The current relationship map has no pending review items.' : 'More than one research persona is needed to build a meaningful map.', pendingGaps ? 'Review relationships' : 'Open relationship map', 'gaps', gapAction),
      step(5, 'Proposed Solutions', pendingSolutions ? `${pendingSolutions} solution hypothes${pendingSolutions === 1 ? 'is' : 'es'} ${pendingSolutions === 1 ? 'needs' : 'need'} an individual approve, edit or reject decision.` : state.solutions.length ? 'All current solution hypotheses have been reviewed.' : 'No evidence-linked solution hypotheses have been proposed yet.', pendingSolutions ? 'Review solutions' : 'Open solutions', 'solutions', solutionAction),
    ].join('');

    const firstAction = [
      researchAction && `${unprocessed} source${unprocessed === 1 ? '' : 's'} ready for AI analysis`,
      !researchAction && analysisAction && `${pendingEvidence + pendingPatterns} AI item${pendingEvidence + pendingPatterns === 1 ? '' : 's'} awaiting review`,
      !researchAction && !analysisAction && personaAction && 'approved evidence ready for persona work',
      !researchAction && !analysisAction && !personaAction && gapAction && 'persona relationships ready for review',
      !researchAction && !analysisAction && !personaAction && !gapAction && solutionAction && 'solution hypotheses ready for review',
    ].find(Boolean);
    document.querySelector('#workflowGuideSummary').textContent = firstAction ? `Next recommended step: ${firstAction}.` : 'The current workflow is complete. Add new research when it becomes available.';
    status(cloudMessage, cloudState);
    grid.querySelectorAll('[data-workflow-go]').forEach(button => button.onclick = () => go(button.dataset.workflowGo));
  }

  const baseRender = render;
  render = function () {
    baseRender();
    renderWorkflowGuide();
  };

  async function initialiseCloud() {
    status('Connecting to cloud storage…', 'working');
    try {
      const response = await fetch('/api/state', { headers: { accept: 'application/json' }, cache: 'no-store' });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) throw new Error('Cloud API is not available on this host');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Cloud returned ${response.status}`);
      cloudRevision = data.revision;
      if (data.state) {
        const merged = mergeRepositories(data.state, state);
        const changed = JSON.stringify(merged) !== JSON.stringify(data.state);
        state = merged;
        localSave();
        cloudReady = true;
        if (changed && hasResearchWork(state)) scheduleCloudSave(true);
        else status('Loaded from shared cloud database', 'saved');
      } else {
        cloudReady = true;
        scheduleCloudSave(true);
      }
      render();
    } catch {
      cloudReady = false;
      status('Saved on this device only', 'local');
      renderWorkflowGuide();
    }
  }

  render();
  initialiseCloud();
})();
