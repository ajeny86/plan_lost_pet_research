/* Public classroom mode: isolated local data plus real server-side AI. */
(() => {
  const apiOrigin = 'https://plan-lost-pet-research.onrender.com';
  const apiPaths = new Set(['/api/analyze', '/api/synthesize-persona', '/api/merge-patterns', '/api/extract-metadata', '/api/import-url']);
  const liveFetch = window.fetch.bind(window);
  const message = 'Live AI is available through the secure backend (GPT-4.1 mini). Sample results are preloaded; new AI output must be reviewed.';
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== apiOrigin || !apiPaths.has(url.pathname)) throw new Error('This demo saves work only in your browser. The private workspace database is not connected.');
    return liveFetch(input, options);
  };
  state.settings.endpoint = `${apiOrigin}/api/analyze`;
  state.settings.model = 'gpt-4.1-mini';
  state.settings.provider = 'OpenAI';
  EvidenceIntegrity.normalise(state);
  const banner = document.createElement('section');
  banner.className = 'classroom-banner';
  banner.innerHTML = '<div><b>PUBLIC CLASSROOM DEMO · LIVE AI</b><span>Preloaded interviews, patterns and personas are synthetic examples. Real AI analysis is available. Changes stay in your browser.</span></div><button type="button" id="resetClassroomDemo">Reset my demo</button>';
  document.querySelector('main').prepend(banner);
  const baseRender = render;
  function applyDemoState() {
    $('#aiConfigNotice').className = 'notice neutral';
    $('#aiConfigNotice').textContent = message;
    $('#reanalyseBtn').disabled = false;
    $('#reanalyseBtn').title = 'Run live AI analysis on the research saved in your demo.';
    $('#workflowGuideSummary').textContent = 'Explore the complete sample workflow: research → evidence review → personas → connections → solution hypotheses.';
    $('#cloudSyncStatus').textContent = 'Public demo · saved in this browser only';
    $('#cloudSyncStatus').dataset.state = 'local';
    $('#workflowStepGrid').innerHTML = [
      ['Research Data', 'Six fictional interviews: two examples per participant role.', 'research'],
      ['AI Analysis', 'Inspect sample evidence or use Reanalyse all research to run real AI analysis.', 'analysis'],
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
