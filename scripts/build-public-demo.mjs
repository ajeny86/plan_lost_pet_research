import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { demoFixture, DEMO_KEY } from '../public-demo/fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'github-pages/demo');
mkdirSync(path.join(output, 'assets'), { recursive: true });
for (const name of ['styles.css', 'enhancements.css', 'persona-profile.css', 'requirements-upgrade.js', 'evidence-integrity.js', 'integrity-ui.js']) cpSync(path.join(root, 'public', name), path.join(output, name));
for (const name of ['active-owner-user.png', 'temporary-carer-user-v2.png', 'quick-spotter-user.png', 'dashboard-hero-illustrated.png', 'project-thumbnail-illustrated.png', 'sidebar-dog-illustrated.png', 'temporary-finder.png']) cpSync(path.join(root, 'public/assets', name), path.join(output, 'assets', name));
let app = readFileSync(path.join(root, 'public/app.js'), 'utf8');
app = app.replace("const KEY='persona-builder-priority1-v1';", `const KEY=${JSON.stringify(DEMO_KEY)};`)
  .replace(/const PUBLIC_AI_ENDPOINT=.*?;/, "const PUBLIC_AI_ENDPOINT='';")
  .replace(/const TEST_PERSONAS=\[[\s\S]*?\n\];/, 'const TEST_PERSONAS=[];');
if (app.includes("const KEY='persona-builder-priority1-v1'")) throw new Error('Demo storage isolation failed');
writeFileSync(path.join(output, 'app.js'), app);
const data = demoFixture();
writeFileSync(path.join(output, 'demo-data.js'), `/* Authored synthetic classroom examples; no private workspace data. */\nif (!localStorage.getItem(${JSON.stringify(DEMO_KEY)})) localStorage.setItem(${JSON.stringify(DEMO_KEY)}, ${JSON.stringify(JSON.stringify(data))});\n`);
cpSync(path.join(root, 'public-demo/runtime.js'), path.join(output, 'demo-runtime.js'));
cpSync(path.join(root, 'public-demo/demo.css'), path.join(output, 'demo.css'));
let html = readFileSync(path.join(root, 'public/index.html'), 'utf8');
html = html.replace('<title>Persona Builder</title>', '<title>Persona Builder — Public Classroom Demo</title>')
  .replace('</head>', '<link rel="stylesheet" href="demo.css"></head>')
  .replace(/<script src="app.js[^\"]*"><\/script>/, '<script src="demo-data.js"></script><script src="app.js?v=demo1"></script>')
  .replace(/<script src="cloud-sync.js[^\"]*"><\/script>/, '<script src="demo-runtime.js?v=2"></script>');
if (html.includes('cloud-sync.js')) throw new Error('Cloud synchronisation must not ship in the public demo');
writeFileSync(path.join(output, 'index.html'), html);
console.log(`Built public demo: ${data.research.length} synthetic sources, ${data.observations.length} observations, ${data.patterns.length} patterns and ${data.personas.length} personas.`);
