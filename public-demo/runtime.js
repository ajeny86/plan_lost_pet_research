/* Public classroom mode: isolated local data and no outbound API requests. */
(() => {
  const message = 'Public demo: sample results are preloaded. Live AI and cloud writes are disabled.';
  window.fetch = async () => { throw new Error(message); };
  state.settings.endpoint = '';
  state.settings.model = 'Live AI disabled';
  state.settings.provider = 'Public classroom demo';
  EvidenceIntegrity.normalise(state);
  const banner = document.createElement('section');
  banner.className = 'classroom-banner';
  banner.innerHTML = '<div><b>PUBLIC CLASSROOM DEMO</b><span>All interviews, patterns and personas are synthetic examples. Changes stay in your browser. No live AI calls.</span></div><button type="button" id="resetClassroomDemo">Reset my demo</button>';
  document.querySelector('main').prepend(banner);
  const baseRender = render;
  function applyDemoState() {
    $('#aiConfigNotice').className = 'notice neutral';
    $('#aiConfigNotice').textContent = message;
    $('#analyseBtn').disabled = true;
    $('#analyseBtn').textContent = 'Sample analysis preloaded';
    $('#reanalyseBtn').disabled = true;
    $('#reanalyseBtn').title = 'Reanalysis requires the private workspace and an authorised backend.';
    $('#quickRefresh').disabled = true;
    $('#quickRefresh').title = 'External source refresh is disabled in the public demo.';
    $$('[data-review-persona-update]').forEach(button => {
      button.disabled = true; button.textContent = 'Live AI synthesis disabled in demo';
    });
    $('#workflowGuideSummary').textContent = 'Explore the complete sample workflow: research → evidence review → personas → connections → solution hypotheses.';
    $('#cloudSyncStatus').textContent = 'Public demo · saved in this browser only';
    $('#cloudSyncStatus').dataset.state = 'local';
    $('#workflowStepGrid').innerHTML = [
      ['Research Data', 'Six fictional interviews: two examples per participant role.', 'research'],
      ['AI Analysis', 'Inspect prepared sample observations, approve a pending pattern and follow its sources.', 'analysis'],
      ['Personas', 'Open three sample profiles, inspect section evidence and compare cards.', 'personas'],
      ['Connections & Gaps', 'Explore example relationships and filter their arrows.', 'gaps'],
      ['Proposed Solutions', 'Approve, edit or reject a clearly marked solution hypothesis.', 'solutions'],
    ].map(([title, text, target], index) => `<article class="workflow-step"><span class="workflow-step-number">${index + 1}</span><h3>${title}</h3><p>${text}</p><button type="button" data-demo-go="${target}">Explore</button></article>`).join('');
    $$('[data-demo-go]').forEach(button => button.onclick = () => go(button.dataset.demoGo));
  }
  render = function () { baseRender(); applyDemoState(); };
  $('#resetClassroomDemo').onclick = () => {
    // This key is dedicated to synthetic demo data; private keys are untouched.
    localStorage.removeItem('persona-builder-public-classroom-demo-v1');
    location.reload();
  };
  $('#settingsBtn').onclick = () => toast('Demo changes are saved only in this browser. Use Reset my demo to reload the examples.');
  $('#helpBtn').onclick = () => {
    go('dashboard'); toast('Start with the Research workflow cards. Every finding in this demo is a synthetic example.');
  };
  const rawSave = save;
  save = function () { state.demo = true; rawSave(); };
  render(); save();
})();
