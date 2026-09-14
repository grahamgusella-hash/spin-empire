import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(here, '..', 'server.js');
let source = fs.readFileSync(serverPath, 'utf8');

if (source.includes("app.use(express.static(path.join(__dirname, 'dist')));")) {
  source = source.replace(
    "app.use(express.static(path.join(__dirname, 'dist')));",
    "app.use((req,res,next) => { if (req.path === '/' || req.path === '/index.html' || req.path.startsWith('/assets/')) { res.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate'); res.set('Pragma','no-cache'); res.set('Expires','0'); } next(); });\napp.use(express.static(path.join(__dirname, 'dist'), { etag: false, maxAge: 0 }));"
  );
}

source = source.replace(
  "import { startAdminBot, validateGrant, hasOwnerRole } from './admin.js';",
  "import { startAdminBot, validateGrant, hasOwnerRole, consumeActivityLaunch } from './admin.js';"
);
source = source.replace("import nodeFetch from 'node-fetch';\n", '');

const oldPingStart = source.indexOf("app.post('/api/login-ping'");
if (oldPingStart !== -1) {
  const oldPingEnd = source.indexOf("app.post('/api/token'", oldPingStart);
  if (oldPingEnd === -1) throw new Error('Could not locate login-ping route boundary.');
  source = source.slice(0, oldPingStart) + source.slice(oldPingEnd);
}

const routeStart = source.indexOf("app.post('/api/token'");
const routeEnd = source.indexOf("app.get('/api/community'", routeStart);
if (routeStart === -1 || routeEnd === -1) throw new Error('Could not locate login route boundaries.');

const loginRoute = `app.post('/api/login-ping', (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const instanceId = String(req.body?.instanceId || '');
    const guildId = String(req.body?.guildId || '');
    if (!instanceId) return res.status(400).json({ ok:false, marker:'server-1912', error:'Activity instance ID is missing. Close Spin Empire and run /casino again.' });

    const launch = consumeActivityLaunch(instanceId, guildId);
    if (!launch) {
      console.error('No pending /casino launch matched Activity instance/guild:', instanceId, guildId);
      return res.status(401).json({ ok:false, marker:'server-1912', error:'No recent /casino launch matched this Activity. Close Spin Empire and run /casino again.' });
    }

    const user = ensureUser(launch.user);
    const session = crypto.randomBytes(32).toString('hex');
    sessions.set(session, user.id);
    setTimeout(() => sessions.delete(session), 12 * 60 * 60 * 1000).unref();
    const now = Date.now();
    return res.json({
      ok:true,
      marker:'server-1912',
      session,
      user: cleanUser(user),
      guildId: launch.guildId,
      state: { ...gameState(user, now), games: GAMES, items: ITEMS, plinko: PLINKO, plinkoTables: PLINKO_TABLES }
    });
  } catch (error) {
    console.error('Activity launch login failed:', error?.message || error);
    return res.status(500).json({ ok:false, marker:'server-1912', error:'Spin Empire login failed: ' + (error?.message || 'unknown error') });
  }
});

// Kept only for compatibility with old cached Activity bundles.
app.post('/api/token', (req, res) => res.status(410).json({ error:'This Spin Empire build is outdated. Close the Activity and launch /casino again.' }));

`;

source = source.slice(0, routeStart) + loginRoute + source.slice(routeEnd);

if (!source.includes('consumeActivityLaunch(instanceId, guildId)')) throw new Error('Activity launch verifier was not applied.');
if (!source.includes("marker:'server-1912'")) throw new Error('Server marker update was not applied.');
if (!source.includes("app.post('/api/login-ping'")) throw new Error('Combined login route was not applied.');

fs.writeFileSync(serverPath, source);
console.log('Patched server to authenticate through the working login-ping route (server-1912).');
