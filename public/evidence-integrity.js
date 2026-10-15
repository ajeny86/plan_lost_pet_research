/* Pure provenance checks shared by analysis, migration and review. */
const EvidenceIntegrity = (() => {
  const names = { Owner: 'Owner', Finder: 'Temporary Carer', Spotter: 'Quick Spotter' };
  function role(record) {
    const saved = record?.participantRole;
    if (['Owner', 'Finder', 'Spotter', 'Volunteer', 'Other'].includes(saved)) return saved;
    const title = record?.title || '';
    if (/owner interview/i.test(title)) return 'Owner';
    if (/finder interview/i.test(title)) return 'Finder';
    if (/spotter interview/i.test(title)) return 'Spotter';
    return null;
  }
  function evidence(repo, pattern) {
    return (pattern.observationIds || []).map(id => repo.observations.find(o => o.id === id)).filter(Boolean);
  }
  function sourceRole(repo, observation) { return role(repo.research.find(s => s.id === observation.sourceId)); }
  function roles(repo, pattern) { return [...new Set(evidence(repo, pattern).map(o => sourceRole(repo, o) || 'Unknown'))]; }
  function compatible(repo, observation, pattern) {
    const expected = sourceRole(repo, observation), items = evidence(repo, pattern);
    return !!expected && !!items.length && items.every(item => sourceRole(repo, item) === expected && item.dimension === observation.dimension);
  }
  function normalise(repo) {
    repo.personaUpdates ||= [];
    const at = new Date().toISOString();
    let changed = false;
    const dirty = new Set();
    const deleted = new Set(repo.deletedTemplateIds || []);
    const kept = repo.personas.filter(persona => !deleted.has(persona.id));
    if (kept.length !== repo.personas.length) { repo.personas = kept; changed = true; }
    for (const key of ['personaUpdates', 'gaps', 'solutions', 'proposals']) {
      if (!repo[key]) continue;
      const retained = repo[key].filter(item => !deleted.has(item.personaId) && !(item.personaIds || []).some(id => deleted.has(id)));
      if (retained.length !== repo[key].length) { repo[key] = retained; changed = true; }
    }
    for (const observation of repo.observations) {
      // A stated reason for choosing a channel is a decision, not an internal driver.
      if (observation.dimension === 'Motivation' && /facebook|whatsapp|instagram|online group/i.test(observation.text) && /first (?:place|choice)|many (?:local )?people|widely used|chose|selected|because.*use/i.test(observation.text)) {
        observation.classificationHistory ||= [];
        observation.classificationHistory.push({ at, previousDimension: 'Motivation', dimension: 'Decision-making', reason: 'Channel selection belongs to behaviours; review required.' });
        observation.dimension = 'Decision-making'; observation.reviewState = 'edited'; observation.updated = at;
        changed = true;
      }
      const match = repo.patterns.find(p => p.id === observation.suggestedPatternId);
      if (match && !compatible(repo, observation, match)) {
        observation.suggestedPatternId = null; observation.patternMatchApplied = false; changed = true;
      }
    }
    const rebuilt = [];
    for (const pattern of repo.patterns) {
      const groups = new Map();
      for (const item of evidence(repo, pattern)) {
        const key = `${sourceRole(repo, item) || 'Unknown'}:${item.dimension}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      }
      const edited = evidence(repo, pattern).some(o => o.classificationHistory?.some(h => h.reason === 'Channel selection belongs to behaviours; review required.'));
      if (groups.size > 1 && pattern.integrityVersion !== 1) {
        const partitions = [...groups.values()];
        const linkedRoles = repo.personas.filter(p => !p.template && p.patternIds?.includes(pattern.id)).map(p => p.role);
        partitions.sort((a, b) => Number(linkedRoles.includes(sourceRole(repo, b[0]))) - Number(linkedRoles.includes(sourceRole(repo, a[0]))));
        partitions.forEach((items, index) => {
          const copy = JSON.parse(JSON.stringify(pattern));
          copy.id = index ? `pat-${crypto.randomUUID()}` : pattern.id;
          copy.observationIds = items.map(o => o.id);
          copy.counterEvidenceIds = (copy.counterEvidenceIds || []).filter(id => repo.observations.some(o => o.id === id && sourceRole(repo, o) === sourceRole(repo, items[0])));
          copy.summary = [...new Set(items.map(o => o.text.trim().replace(/[.!?]*$/, '.')))].join(' ');
          copy.title = copy.summary;
          copy.integrityVersion = 1; copy.reviewState = 'edited'; copy.status = 'pending'; copy.updated = at;
          copy.history = [...(Array.isArray(pattern.history) ? pattern.history : []), { at, action: 'Separated incompatible source roles or categories; review required', originalPatternId: pattern.id }];
          rebuilt.push(copy); dirty.add(copy.id);
        });
        changed = true;
      } else {
        if (edited && pattern.classificationVersion !== 1) {
          pattern.reviewState = 'edited'; pattern.classificationVersion = 1; pattern.updated = at; dirty.add(pattern.id); changed = true;
        }
        rebuilt.push(pattern);
      }
    }
    repo.patterns = rebuilt;
    for (const persona of repo.personas.filter(p => !p.template)) {
      const valid = (persona.patternIds || []).filter(id => {
        const pattern = repo.patterns.find(p => p.id === id);
        return pattern && roles(repo, pattern).every(role => role === persona.role);
      });
      const affected = valid.filter(id => dirty.has(id));
      if (valid.length !== (persona.patternIds || []).length || affected.length) {
        persona.patternIds = valid; persona.status = 'Unvalidated'; persona.updated = at;
        let update = repo.personaUpdates.find(u => u.personaId === persona.id && u.status === 'pending');
        if (!update) { update = { id: `update-${crypto.randomUUID()}`, personaId: persona.id, status: 'pending', created: at, patternIds: [] }; repo.personaUpdates.push(update); }
        update.patternIds = [...new Set([...update.patternIds, ...valid])];
        update.reason = 'Evidence roles or categories corrected. Review patterns, then synthesise again.';
        changed = true;
      }
    }
    for (const proposal of repo.proposals || []) {
      if (proposal.status !== 'pending') continue;
      const supported = (proposal.patternIds || []).map(id => repo.patterns.find(p => p.id === id)).filter(Boolean);
      if (supported.length && supported.every(p => roles(repo, p).every(r => names[r]))) {
        proposal.status = 'superseded'; proposal.reviewNote = 'Evidence belongs to an existing role; a shared need alone does not establish a new persona.'; changed = true;
      }
    }
    if (repo.settings?.model === 'gpt-6.1-sol') { repo.settings.model = 'gpt-4.1-mini'; changed = true; }
    return changed;
  }
  return { role, sourceRole, roles, compatible, normalise, names };
})();
