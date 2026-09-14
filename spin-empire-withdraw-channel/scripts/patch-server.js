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

if (!source.includes("app.post('/api/login-ping'")) {
  const insertAt = source.indexOf("app.post('/api/token'");
  source = source.slice(0, insertAt) + "app.post('/api/login-ping', (req,res) => { res.set('Cache-Control','no-store'); res.json({ ok:true, marker:'server-1855' }); });\n\n" + source.slice(insertAt);
} else {
  source = source.replace(/marker:'server-[^']+'/g, "marker:'server-1855'");
}

const routeStart = source.indexOf("app.post('/api/token'");
const routeEnd = source.indexOf("app.get('/api/community'", routeStart);
if (routeStart === -1 || routeEnd === -1) throw new Error('Could not locate login route boundaries.');

const tokenRoute = `app.post('/api/token', (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const instanceId = String(req.body?.instanceId || '');
    if (!instanceId) return res.status(400).json({ error: 'Activity instance ID is missing. Relaunch with /casino.' });

    const launch = consumeActivityLaunch(instanceId);
    if (!launch) {
      console.error('No pending /casino launch matched Activity instance:', instanceId);
      return res.status(401).json({ error: 'No matching /casino launch was found for Activity instance ' + instanceId + '. Close Spin Empire and run /casino again.' });
    }

    const user = ensureUser(launch.user);
    const session = crypto.randomBytes(32).toString('hex');
    sessions.set(session, user.id);
    setTimeout(() => sessions.delete(session), 12 * 60 * 60 * 1000).unref();
    const now = Date.now();
    return res.json({
      session,
      user: cleanUser(user),
      guildId: launch.guildId,
      state: { ...gameState(user, now), games: GAMES, items: ITEMS, plinko: PLINKO, plinkoTables: PLINKO_TABLES }
    });
  } catch (error) {
    console.error('Activity instance login failed:', error?.message || error);
    return res.status(500).json({ error: 'Spin Empire login failed: ' + (error?.message || 'unknown error') });
  }
});

`;

source = source.slice(0, routeStart) + tokenRoute + source.slice(routeEnd);

if (!source.includes('consumeActivityLaunch')) throw new Error('Activity launch verifier import was not applied.');
if (!source.includes("marker:'server-1855'")) throw new Error('Server marker update was not applied.');
if (!source.includes('req.body?.instanceId')) throw new Error('Instance ID login route was not applied.');
if (source.includes("discord.com/api/oauth2/token")) throw new Error('Old Discord OAuth exchange is still present.');

fs.writeFileSync(serverPath, source);
console.log('Patched server with immediate Activity instance verification (server-1855).');
