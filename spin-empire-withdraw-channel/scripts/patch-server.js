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

if (!source.includes("app.post('/api/login-ping'")) {
  const insertAt = source.indexOf("app.post('/api/token'");
  source = source.slice(0, insertAt) + "app.post('/api/login-ping', (req,res) => { res.set('Cache-Control','no-store'); res.json({ ok:true, marker:'server-1647' }); });\n\n" + source.slice(insertAt);
} else {
  source = source.replace("marker:'server-1639'", "marker:'server-1647'");
}

const routeStart = source.indexOf("app.post('/api/token'");
const routeEnd = source.indexOf("app.get('/api/community'", routeStart);
if (routeStart === -1 || routeEnd === -1) throw new Error('Could not locate Discord token route boundaries.');

const tokenRoute = `app.post('/api/token', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const code = String(req.body?.code || '');
    if (!code) return res.status(400).json({ error: 'Discord authorization code is missing.' });

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID || '',
        client_secret: process.env.DISCORD_CLIENT_SECRET || '',
        grant_type: 'authorization_code',
        code
      }),
      signal: AbortSignal.timeout(10000)
    });

    const oauth = await tokenResponse.json();
    if (!tokenResponse.ok || !oauth?.access_token) {
      console.error('Discord token exchange failed:', tokenResponse.status, oauth?.error || oauth?.error_description || 'unknown');
      return res.status(401).json({ error: 'Discord authorization failed. Verify the Discord Client ID/Secret and relaunch /casino.' });
    }

    const meResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: \`Bearer \${oauth.access_token}\` },
      signal: AbortSignal.timeout(10000)
    });
    const profile = await meResponse.json();
    if (!meResponse.ok || !profile?.id) {
      console.error('Discord profile lookup failed:', meResponse.status);
      return res.status(401).json({ error: 'Could not read your Discord profile.' });
    }

    const user = ensureUser(profile);
    const session = crypto.randomBytes(32).toString('hex');
    sessions.set(session, user.id);
    setTimeout(() => sessions.delete(session), 12 * 60 * 60 * 1000).unref();
    const now = Date.now();
    return res.json({
      session,
      user: cleanUser(user),
      state: { ...gameState(user, now), games: GAMES, items: ITEMS, plinko: PLINKO, plinkoTables: PLINKO_TABLES }
    });
  } catch (error) {
    console.error('Discord login route failed:', error?.name || '', error?.message || error);
    const timedOut = error?.name === 'TimeoutError' || /timed out|abort/i.test(String(error?.message || ''));
    return res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'Discord OAuth request timed out on the server.' : `Discord sign-in failed: ${error?.message || 'unknown server error'}`
    });
  }
});

`;

source = source.slice(0, routeStart) + tokenRoute + source.slice(routeEnd);

// Remove the temporary native HTTPS helper/import from earlier diagnostics if present.
source = source.replace("import https from 'node:https';\n", '');
const helperStart = source.indexOf('function discordHttpsRequest(');
if (helperStart !== -1) {
  const helperEnd = source.indexOf("app.post('/api/login-ping'", helperStart);
  if (helperEnd !== -1) source = source.slice(0, helperStart) + source.slice(helperEnd);
}

if (!source.includes("fetch('https://discord.com/api/oauth2/token'")) throw new Error('Official Discord token exchange was not applied.');
if (!source.includes("marker:'server-1647'")) throw new Error('Server marker update was not applied.');
if (!source.includes("state: { ...gameState(user, now)")) throw new Error('Bootstrap game state is missing from login response.');

fs.writeFileSync(serverPath, source);
console.log('Patched server to Discord official Activity OAuth exchange (server-1647).');
