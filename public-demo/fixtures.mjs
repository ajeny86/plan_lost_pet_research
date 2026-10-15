// Intentionally authored synthetic examples. Never read a private workspace.
export const DEMO_KEY = 'persona-builder-public-classroom-demo-v1';
export function demoFixture() {
  const at = '2026-10-15T10:00:00.000Z';
  const sections = ['Goal', 'Action', 'Motivation', 'Constraint', 'Problem', 'Need'];
  const scenarios = [
    { role: 'Owner', name: 'Owner', statements: [
      ['I wanted to find my missing dog and bring him home safely.', 'I wanted to find my missing cat and bring her home safely.'],
      ['I posted a photograph in a local Facebook group and searched the nearby streets.', 'I shared a photograph in two local groups and searched near my building.'],
      ['I was worried about his safety and wanted him home with our family.', 'Her safety mattered most to me; I wanted her back home with us.'],
      ['I had to return to work, so I could only search outside in the evening.', 'My working hours limited the time I could spend searching outside.'],
      ['I had to update the same information separately in several groups.', 'Repeating the same updates in different groups took time away from searching.'],
      ['I needed one place to update the search information and check recent sightings.', 'I needed a single, current record of updates and sightings.'],
    ], summaries: ['Recover the missing pet and bring them home safely.', 'Share photo reports through local groups and search nearby streets.', 'Protect the pet and reunite them with their family.', 'Working hours limit time available for physical searches.', 'Repeating updates across groups takes time away from searching.', 'A single current record of search updates and sightings.'] },
    { role: 'Finder', name: 'Temporary Carer', statements: [
      ['I wanted to keep the found dog safe until I could locate the owner.', 'I wanted to keep the found cat safe while looking for the owner.'],
      ['I took the dog to a veterinary clinic to check for a microchip.', 'I contacted a veterinary clinic and took the cat there for a microchip check.'],
      ['I was concerned the dog might be injured near the road.', 'I wanted to protect the cat from passing traffic.'],
      ['My landlord would only let me keep the dog overnight.', 'I could not keep the cat for more than one night because of my housing rules.'],
      ['I did not know which services could help with a found animal at night.', 'It was difficult to find a service that was open that evening.'],
      ['I needed clear information about after-hours services and temporary care.', 'I needed a list of services open at night and guidance for keeping the cat temporarily.'],
    ], summaries: ['Keep the found animal safe while locating its owner.', 'Contact a veterinary clinic and arrange a microchip check.', 'Protect an animal from the risk of traffic injury.', 'Housing rules limit how long temporary care is possible.', 'Finding available help outside normal hours is difficult.', 'Clear after-hours contacts and short-term care guidance.'] },
    { role: 'Spotter', name: 'Quick Spotter', statements: [
      ['I wanted my sighting to reach someone searching for the animal.', 'I wanted the person looking for the pet to receive a useful sighting.'],
      ['I took a photograph and noted the street and time before sharing the sighting.', 'I recorded the location and time and shared a photograph in a local group.'],
      ['I wanted to help the pet get home even though I could not take it with me.', 'I wanted to help reunite the pet with its owner despite being unable to stop for long.'],
      ['I was on my way to work and could not stay with the animal.', 'I had to collect my child and could only stop briefly.'],
      ['I was not sure which group would reach the person searching.', 'I could not tell where to report the sighting so the owner would see it.'],
      ['I needed a quick way to share a photo, location, time and direction of travel.', 'I needed a short sighting form with prompts for the useful details.'],
    ], summaries: ['Deliver a useful sighting to someone searching for the pet.', 'Record a photo, location and time, then share the sighting.', 'Help reunite a pet with its owner without taking custody.', 'Existing commitments allow only a brief stop.', 'It is unclear which reporting channel will reach the owner.', 'A quick sighting report with prompts for useful details.'] },
  ];
  const data = { research: [], observations: [], patterns: [], personas: [], proposals: [], gaps: [], solutions: [], activity: [], analysisArchives: [], personaUpdates: [], deletedTemplateIds: [], refresh: { lastSuccess: null, errors: [] }, settings: { endpoint: '', provider: 'Public demo — sample results', model: 'Live AI disabled', proposalThreshold: 3 } };
  scenarios.forEach((scenario, index) => {
    const roleId = scenario.role.toLowerCase();
    for (let caseIndex = 0; caseIndex < 2; caseIndex++) {
      const sourceId = `demo-${roleId}-${caseIndex + 1}`;
      const content = 'SYNTHETIC CLASSROOM DEMO — NOT REAL RESEARCH\n\n' + scenario.statements.map((pair, sectionIndex) => `Researcher: ${['What was your main goal?', 'What did you do?', 'What mattered to you?', 'What limited what you could do?', 'What was difficult?', 'What support did you need?'][sectionIndex]}\nParticipant: ${pair[caseIndex]}`).join('\n\n');
      data.research.push({ id: sourceId, type: 'Interview', title: `DEMO — ${scenario.name} interview ${caseIndex + 1}`, participantId: `DEMO-${roleId.toUpperCase()}-${caseIndex + 1}`, participantRole: scenario.role, date: '2026-10-15', imported: at, content, processed: true, duplicateStatus: 'unchecked', url: '', reportStatus: scenario.role === 'Owner' ? 'Lost' : scenario.role === 'Finder' ? 'Found' : 'Sighted', animalType: caseIndex ? 'cat' : 'dog', location: 'Lisbon — fictional scenario', involvement: scenario.role === 'Finder' ? 'Temporary Care' : 'Unknown', outcome: 'Not stated in this synthetic example', updates: '', demo: true });
      scenario.statements.forEach((pair, sectionIndex) => data.observations.push({ id: `demo-obs-${roleId}-${sectionIndex}-${caseIndex}`, sourceId, dimension: sections[sectionIndex], text: pair[caseIndex], excerpt: pair[caseIndex], evidenceType: 'Direct observation', status: 'approved', reviewState: 'approved', origin: 'Authored synthetic demo fixture', created: at, demo: true }));
    }
    const patternIds = [];
    scenario.summaries.forEach((summary, sectionIndex) => {
      const pending = scenario.role === 'Spotter' && sectionIndex === 5;
      const patternId = `demo-pattern-${roleId}-${sectionIndex}`;
      if (!pending) patternIds.push(patternId);
      data.patterns.push({ id: patternId, title: summary, summary, observationIds: [0, 1].map(caseIndex => `demo-obs-${roleId}-${sectionIndex}-${caseIndex}`), counterEvidenceIds: [], status: pending ? 'pending' : 'approved', reviewState: pending ? 'pending' : 'approved', created: at, origin: 'Authored synthetic demo fixture', history: [{ action: 'Prepared example grouping — not a live AI result', at }], demo: true });
    });
    const persona = { id: `demo-persona-${roleId}`, name: scenario.name, role: scenario.role, goal: scenario.summaries[0], behaviours: [scenario.summaries[1]], motivations: [scenario.summaries[2]], constraints: [scenario.summaries[3]], painPoints: [scenario.summaries[4]], needs: scenario.role === 'Spotter' ? [] : [scenario.summaries[5]], patternIds, status: 'Unvalidated', template: false, version: 1, created: at, updated: at, demo: true };
    persona.history = [{ version: 1, values: { ...persona }, reason: 'Synthetic demonstration profile; not a validated research finding.', changed: at, origin: 'classroom demo', evidencePatternIds: patternIds }];
    data.personas.push(persona);
  });
  data.gaps.push({ id: 'demo-gap-reporting', type: 'Information Gap', title: 'Useful sightings may not reach the searching owner.', text: 'The synthetic owner cases need current sightings, while the spotter cases describe uncertainty about the reporting channel. This is a hypothesis to test, not a verified finding.', personaIds: ['demo-persona-owner', 'demo-persona-spotter'], patternIds: ['demo-pattern-owner-5', 'demo-pattern-spotter-4'], status: 'pending', created: at, updated: at, demo: true });
  data.gaps.push({ id: 'demo-connection-safety', type: 'Shared Pattern', title: 'Both owners and carers seek a safe recovery.', text: 'The two example roles approach recovery from different positions. These synthetic goals suggest a possible coordination point.', personaIds: ['demo-persona-owner', 'demo-persona-finder'], patternIds: ['demo-pattern-owner-0', 'demo-pattern-finder-0'], status: 'approved', created: at, updated: at, demo: true });
  data.solutions.push({ id: 'demo-solution-sighting', title: 'Structured sighting reports', problem: 'An owner needs useful sightings, while a spotter is unsure where to report.', text: 'Hypothesis: a brief report with location, time, direction and photo may make sightings easier to follow up. Test with users before accepting it.', evidenceId: 'gap:demo-gap-reporting', evidenceLabel: 'Gap: Useful sightings may not reach the searching owner.', personaIds: ['demo-persona-owner', 'demo-persona-spotter'], status: 'Proposed', comment: 'Synthetic solution hypothesis prepared for classroom review.', created: at, updated: at, demo: true });
  data.research.forEach(record => { record.metadataExtraction = { status: 'complete', at, method: 'Authored synthetic demo metadata; missing fields remain unknown' }; });
  data.activity.push({ id: 'demo-activity', action: 'Loaded synthetic classroom examples. No live AI analysis has been performed.', time: at });
  return data;
}
