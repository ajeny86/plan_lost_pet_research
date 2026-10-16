/* Time-bounded requests, accurate queues and role-based proposal review. */
(() => {
  // iOS can scroll the document behind a native dialog. Lock the document,
  // preserving its position until the last modal closes (including nested ones).
  let modalScrollPosition = null;
  let previousBodyTop = '';
  function syncModalScrollLock() {
    const modalOpen = !!document.querySelector('dialog[open]');
    if (modalOpen && modalScrollPosition === null) {
      modalScrollPosition = window.scrollY;
      previousBodyTop = document.body.style.top;
      document.body.style.top = `-${modalScrollPosition}px`;
      document.documentElement.classList.add('modal-scroll-locked');
      document.body.classList.add('modal-scroll-locked');
    } else if (!modalOpen && modalScrollPosition !== null) {
      const restorePosition = modalScrollPosition;
      modalScrollPosition = null;
      document.documentElement.classList.remove('modal-scroll-locked');
      document.body.classList.remove('modal-scroll-locked');
      document.body.style.top = previousBodyTop;
      window.scrollTo({ top: restorePosition, behavior: 'instant' });
    }
  }
  const modalScrollObserver = new MutationObserver(syncModalScrollLock);
  document.querySelectorAll('dialog').forEach(dialog => {
    modalScrollObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    dialog.addEventListener('close', syncModalScrollLock);
  });
  syncModalScrollLock();
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
    let continuation = $('#dashboardContinuation');
    if (!continuation) {
      continuation = document.createElement('div');
      continuation.id = 'dashboardContinuation';
      continuation.className = 'dashboard-continuation span-3';
      $('#dashboardView .dashboard-grid').append(continuation);
    }
    const proposed = state.proposals.filter(item => ['pending', 'drafted', 'assigned'].includes(item.status));
    const preview = (title, target, label, records, describe, missing) => `<section class="panel dashboard-overview-section"><div class="panel-head"><div><span class="eyebrow">${label}</span><h2>${title}</h2></div><button type="button" class="link-btn" data-dashboard-section="${target}">View all →</button></div><div class="dashboard-preview-grid">${records.length ? records.slice(0, 3).map(item => `<button type="button" class="dashboard-preview-card" data-dashboard-section="${target}"><span class="dashboard-preview-status">${esc(item.status || 'Needs review')}</span><b>${esc(item.title || 'Untitled')}</b><span>${esc(describe(item))}</span><small>Open ${title} →</small></button>`).join('') : `<div class="dashboard-preview-empty"><b>${missing[0]}</b><p>${missing[1]}</p><button type="button" class="tiny" data-dashboard-section="${target}">Open ${title} →</button></div>`}</div></section>`;
    continuation.innerHTML = [
      preview('Proposed Personas', 'proposed', 'POTENTIAL NEW PROFILES', proposed, item => item.summary || 'Review the evidence before creating a new persona.', ['No proposed personas yet', 'Potential new profiles appear here when evidence supports a distinct additional role.']),
      preview('Connections & Gaps', 'gaps', 'RELATIONSHIPS AND MISSING INFORMATION', state.gaps.filter(item => item.status !== 'rejected'), item => item.text || 'Review how these personas and their evidence connect.', ['No connections or gaps yet', 'Map relationships between personas once you have reviewed their supporting evidence.']),
      preview('Proposed Solutions', 'solutions', 'EVIDENCE-LINKED HYPOTHESES', state.solutions.filter(item => item.status !== 'Rejected'), item => item.text || item.problem || 'Review this solution hypothesis and its supporting evidence.', ['No solution hypotheses yet', 'Propose a response to a reviewed need, pattern or gap.']),
    ].join('');
    continuation.querySelectorAll('[data-dashboard-section]').forEach(button => button.onclick = () => { go(button.dataset.dashboardSection); window.scrollTo({ top: 0, behavior: 'instant' }); });
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
  const navigation = $('#nav');
  navigation.insertAdjacentHTML('afterend', '<div class="nav-scroll-tools" hidden><button type="button" class="nav-scroll-arrow" id="navScrollPrevious" aria-label="Scroll sections left">‹</button><div class="nav-scroll-guidance"><span>Swipe to see all sections</span><div class="nav-scroll-track" aria-hidden="true"><span id="navScrollThumb"></span></div></div><button type="button" class="nav-scroll-arrow" id="navScrollNext" aria-label="Scroll sections right">›</button></div>');
  const menuTools = navigation.nextElementSibling;
  function updateMenuScroll() {
    const maximum = navigation.scrollWidth - navigation.clientWidth;
    menuTools.hidden = maximum < 3;
    $('#navScrollPrevious').disabled = navigation.scrollLeft < 2;
    $('#navScrollNext').disabled = navigation.scrollLeft > maximum - 2;
    const fraction = Math.min(100, Math.max(18, navigation.clientWidth / Math.max(navigation.scrollWidth, 1) * 100));
    $('#navScrollThumb').style.width = `${fraction}%`;
    $('#navScrollThumb').style.left = `${maximum > 0 ? Math.max(0, Math.min(1, navigation.scrollLeft / maximum)) * (100 - fraction) : 0}%`;
  }
  $('#navScrollPrevious').onclick = () => navigation.scrollBy({ left: -Math.max(180, navigation.clientWidth * .75), behavior: 'smooth' });
  $('#navScrollNext').onclick = () => navigation.scrollBy({ left: Math.max(180, navigation.clientWidth * .75), behavior: 'smooth' });
  navigation.addEventListener('scroll', updateMenuScroll, { passive: true });
  window.addEventListener('resize', updateMenuScroll);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updateMenuScroll).observe(navigation);
  requestAnimationFrame(updateMenuScroll);
  for (const [metric, target, label] of [
    ['metricResearch', 'research', 'Open Research Data'],
    ['metricPatterns', 'analysis', 'Open AI Analysis patterns'],
    ['metricPersonas', 'personas', 'Open Personas'],
    ['metricSuggestions', 'analysis', 'Open AI Analysis for review'],
  ]) {
    const card = document.getElementById(metric)?.closest('article');
    if (!card) continue;
    card.classList.add('metric-link');
    card.setAttribute('role', 'link'); card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', label); card.title = label;
    card.onclick = () => go(target);
    card.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); go(target); }
    };
  }
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
