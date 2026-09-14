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

if (!source.includes("import https from 'node:https';")) {
  source = source.replace("import path from 'node:path';", "import path from 'node:path';\nimport https from 'node:https';");
}

const oauthHelper = `
function discordHttpsRequest({ method = 'GET', path: requestPath, headers = {}, body = '' }) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(new Error('Discord request timed out.')), 7000);
    const req = https.request({
      hostname: 'discord.com',
      port: 443,
      path: requestPath,
      method,
      headers: { ...headers, Connection: 'close' },
      agent: false,
      signal: controller.signal
    }, response => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => {
        clearTimeout(deadline);
        let data;
        try { data = raw ? JSON.parse(raw) : {}; }
        catch { return reject(new Error('Discord returned an invalid response.')); }
        resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode, data });
      });
    });
    req.on('error', error => {
      clearTimeout(deadline);
      if (error?.name === 'AbortError' || controller.signal.aborted) reject(new Error('Discord request timed out.'));
      else reject(error);
    });
    if (body) req.write(body);
    req.end();
  });
}
`;

if (!source.includes('function discordHttpsRequest(')) {
  const insertAt = source.indexOf("app.post('/api/token'");
  if (insertAt === -1) throw new Error('Could not locate /api/token route.');
  source = source.slice(0, insertAt) + oauthHelper + '\n' + source.slice(insertAt);
}

if (!source.includes("app.post('/api/login-ping'")) {
  const insertAt = source.indexOf("app.post('/api/token'");
  source = source.slice(0, insertAt) + "app.post('/api/login-ping', (req,res) => { res.set('Cache-Control','no-store'); res.json({ ok:true, marker:'server-1639' }); });\n\n" + source.slice(insertAt);
}

const routeStart = source.indexOf("app.post('/api/token'");
const routeEnd = source.indexOf("app.get('/api/community'", routeStart);
if (routeStart === -1 || routeEnd === -1) throw new Error('Could not locate Discord token route boundaries.');

const tokenRoute = `app.post('/api/token', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const code = String(req.body?.code || '');
    if (!code) return res.status(400).json({ error: 'Discord authorization code is missing.' });

    const form = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID || '',
      client_secret: process.env.DISCORD_CLIENT_SECRET || '',
      grant_type: 'authorization_code',
      code
    }).toString();

    const tokenResult = await discordHttpsRequest({
      method: 'POST',
      path: '/api/v10/oauth2/token',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(form)
      },
      body: form
    });
    if (!tokenResult.ok || !tokenResult.data?.access_token) {
      console.error('Discord token exchange failed:', tokenResult.status, tokenResult.data?.error || tokenResult.data?.error_description || 'unknown');
      return res.status(401).json({ error: 'Discord authorization failed. Close Spin Empire and run /casino again.' });
    }

    const meResult = await discordHttpsRequest({
      path: '/api/v10/users/@me',
      headers: { Authorization: \`Bearer \${tokenResult.data.access_token}\` }
    });
    if (!meResult.ok || !meResult.data?.id) {
      console.error('Discord profile lookup failed:', meResult.status);
      return res.status(401).json({ error: 'Could not read your Discord profile.' });
    }

    const user = ensureUser(meResult.data);
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
    console.error('Discord login route failed:', error?.message || error);
    const timedOut = /timed out|abort/i.test(String(error?.message || error?.name || ''));
    if (!res.headersSent) return res.status(timedOut ? 504 : 500).json({ error: timedOut ? 'Discord login timed out while Render was connecting to Discord.' : 'Discord sign-in failed. Please try /casino again.' });
  }
});

`;

source = source.slice(0, routeStart) + tokenRoute + source.slice(routeEnd);

if (!source.includes("app.post('/api/login-ping'")) throw new Error('Login ping route was not applied.');
if (!source.includes("signal: controller.signal")) throw new Error('Hard Discord connect abort was not applied.');
if (!source.includes("state: { ...gameState(user, now)")) throw new Error('Bootstrap game state is missing from login response.');

fs.writeFileSync(serverPath, source);
console.log('Patched Discord OAuth plus login reachability probe server-1639.');
