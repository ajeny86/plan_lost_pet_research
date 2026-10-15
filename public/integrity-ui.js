/* Time-bounded requests, accurate queues and role-based proposal review. */
(() => {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, options = {}) {
    const url = typeof input === 'string' ? input : input.url;
    if (!/\/api\/(analyze|synthesize-persona|merge-patterns|extract-metadata|import-url|state)(?:$|\?)/.test(url)) return nativeFetch(input, options);
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timer = setTimeout(abort, 60000);
    try { return await nativeFetch(input, { ...options, signal: controller.signal }); }
    catch (error) {
      if (error.name === 'AbortError') throw new Error('The service did not respond within 60 seconds. Please try again. Your saved data is unchanged.');
      throw error;
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
  };
  const baseCounts = counts, baseDashboard = dashboard;
  function tasks() {
    const items = [];
    for (const item of state.observations) if (item.status === 'pending' || item.reviewState === 'edited') items.push({ title: 'Observation needs review', text: item.text, target: 'analysis' });
    for (const item of state.patterns) if (item.status === 'pending' || item.reviewState === 'edited') items.push({ title: 'Pattern needs review', text: item.title, target: 'analysis' });
    for (const item of state.proposals) if (item.status === 'pending') items.push({ title: 'Proposed persona needs review', text: item.title, target: 'proposed' });
    for (const item of state.personaUpdates || []) if (item.status === 'pending') items.push({ title: 'Persona evidence update', text: state.personas.find(p => p.id === item.personaId)?.name || 'Review evidence', target: 'personas' });
    for (const item of state.gaps) if (item.status === 'pending') items.push({ title: 'Relationship needs review', text: item.title, target: 'gaps' });
    for (const item of state.solutions) if (!['Approved Idea', 'Testing', 'Validated', 'Rejected'].includes(item.status)) items.push({ title: 'Solution needs review', text: item.title, target: 'solutions' });
    return items;
  }
  counts = function () {
    baseCounts();
    // This badge describes cards visible in Personas, including labelled tests.
    const badge = $('#navPersonas');
    if (badge) { badge.textContent = state.personas.length || ''; badge.hidden = !state.personas.length; badge.title = 'All visible persona cards, including test templates'; }
    $('#metricPersonas').textContent = state.personas.length;
    const pending = tasks().length;
    $('#metricSuggestions').textContent = pending;
    $('#pendingPill').textContent = `${pending} pending`;
    const analysis = [...state.observations, ...state.patterns].filter(item => item.status === 'pending' || item.reviewState === 'edited').length;
    $('#navSuggestions').textContent = analysis || ''; $('#navSuggestions').hidden = !analysis;
  };
  dashboard = function () {
    baseDashboard();
    const list = tasks(), container = $('#dashboardSuggestions');
    container.innerHTML = list.length ? list.slice(0, 6).map((item, i) => `<div class="suggestion-row"><b>${esc(item.title)}</b><small>${esc(item.text)}</small><button type="button" class="tiny" data-queue-task="${i}">Review</button></div>`).join('') : empty('No pending review tasks', 'All current review queues are up to date.');
    container.querySelectorAll('[data-queue-task]').forEach(button => button.onclick = () => go(list[Number(button.dataset.queueTask)].target));
    const pending = container.parentElement.querySelector('.pending-count, .pending-badge');
    if (pending) pending.textContent = `${list.length} pending`;
  };
  assessProposals = function () {
    const threshold = Number(state.settings.proposalThreshold) || 3;
    const buckets = new Map();
    state.patterns.filter(p => p.status === 'approved' && p.reviewState !== 'edited').forEach(pattern => {
      const roles = EvidenceIntegrity.roles(state, pattern);
      if (roles.length !== 1 || EvidenceIntegrity.names[roles[0]] || roles[0] === 'Unknown') return;
      if (state.personas.some(p => !p.template && p.role === roles[0])) return;
      if (!buckets.has(roles[0])) buckets.set(roles[0], []);
      buckets.get(roles[0]).push(pattern);
    });
    for (const [role, patterns] of buckets) {
      const sources = new Set(patterns.flatMap(p => p.observationIds).map(id => obs(id)?.sourceId).filter(Boolean));
      if (sources.size < threshold || state.proposals.some(p => p.status === 'pending' && p.candidateRole === role)) continue;
      state.proposals.push({ id: id('prop'), title: `Potential persona: ${role}`, candidateRole: role, summary: 'Recurring evidence from an additional participant role requires researcher review.', patternIds: patterns.map(p => p.id), sourceCount: sources.size, status: 'pending', created: now() });
    }
    save(); render(); toast('Role-based evidence assessed. A shared need alone does not create a new persona.');
  };
  $('#assessProposalsBtn').onclick = assessProposals;
  const previousMerge = mergePatterns;
  mergePatterns = async function () {
    const selected = $$('[data-pattern-select]:checked').map(box => state.patterns.find(p => p.id === box.dataset.patternSelect)).filter(Boolean);
    const keys = new Set(selected.flatMap(pattern => (pattern.observationIds || []).map(id => obs(id)).filter(Boolean).map(observation => `${EvidenceIntegrity.sourceRole(state, observation) || 'Unknown'}:${observation.dimension}`)));
    if (keys.size !== 1 || [...keys][0]?.startsWith('Unknown:')) return toast('Select patterns from the same participant role and evidence category.');
    return previousMerge();
  };
  $('#mergePatternsBtn').onclick = mergePatterns;
  $('#mergePatternsSelectedBtn').onclick = mergePatterns;
})();
