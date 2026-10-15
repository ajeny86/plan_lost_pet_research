export const LOCAL_KEY = 'persona-builder-priority1-v1';
export const WORKSPACE = 'https://persona-atlas.rightotter16.chatgpt.site/';
const VIEWS = new Set(['dashboard', 'research', 'analysis', 'personas', 'proposed', 'gaps', 'solutions']);

export function destination(hash) {
  const view = String(hash || '').replace(/^#/, '');
  return `${WORKSPACE}#${VIEWS.has(view) ? view : 'dashboard'}`;
}

export function inspectLocal(storage) {
  let raw;
  try {
    raw = storage.getItem(LOCAL_KEY);
    if (!raw) return { hasWork: false };
    const data = JSON.parse(raw);
    const hasWork = ['research', 'observations', 'patterns', 'proposals', 'gaps', 'solutions', 'analysisArchives', 'personaUpdates'].some(key => Array.isArray(data[key]) && data[key].length > 0)
      || (data.personas || []).some(persona => !persona.template);
    return { hasWork, data, raw, research: data.research?.length || 0, personas: data.personas?.filter(persona => !persona.template).length || 0 };
  } catch {
    // An unreadable copy or restricted storage must never cause a silent redirect.
    return { hasWork: true, unreadable: true, raw };
  }
}

export function backup(local, now = new Date()) {
  return local.unreadable ? local.raw || '{}' : JSON.stringify({ exportedAt: now.toISOString(), schemaVersion: 2, data: local.data }, null, 2);
}

if (typeof document !== 'undefined') {
  let storage;
  try { storage = window.localStorage; } catch { storage = { getItem() { throw new Error('Storage access unavailable'); } }; }
  const local = inspectLocal(storage);
  const target = destination(window.location.hash);
  document.querySelector('#openWorkspace').href = target;
  if (local.hasWork) {
    document.querySelector('#status').textContent = 'Persona Builder now uses one shared workspace. Recover any older local work before continuing.';
    document.querySelector('#localData').hidden = false;
    document.querySelector('#localSummary').textContent = local.unreadable ? 'The older local copy could not be read automatically. Keep this browser’s site data and download a recovery copy if available.' : `${local.research} research source(s) and ${local.personas} research persona(s), plus any saved analysis and review history.`;
    const button = document.querySelector('#downloadBackup');
    button.hidden = !local.raw;
    button.onclick = () => {
      const url = URL.createObjectURL(new Blob([backup(local)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = `persona-builder-github-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  } else if (!new URLSearchParams(window.location.search).has('stay')) {
    window.location.replace(target);
  } else {
    document.querySelector('#status').textContent = 'Continue to the shared research workspace. Sign in with your authorised account to see the same project on every device.';
  }
}
