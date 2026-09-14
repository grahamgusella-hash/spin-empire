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

if (!source.includes("import nodeFetch from 'node-fetch';")) {
  source = source.replace("import express from 'express';", "import express from 'express';\nimport nodeFetch from 'node-fetch';");
}
if (!source.includes("import https from 'node:https';")) {
  source = source.replace("import path from 'node:path';", "import path from 'node:path';\nimport https from 'node:https';");
}

if (!source.includes('const discordAgent = new https.Agent')) {
  const insertAt = source.indexOf("app.post('/api/login-ping'");
  const agentCode = "const discordAgent = new https.Agent({ family: 4, keepAlive: false });\n\n";
  if (insertAt !== -1) source = source.slice(0, insertAt) + agentCode + source.slice(insertAt);
  else {
    const tokenAt = source.indexOf("app.post('/api/token'");
    if (tokenAt === -1) throw new Error('Could not locate Discord token route.');
    source = source.slice(0, tokenAt) + agentCode + source.slice(tokenAt);
  }
}

if (!source.includes("app.post('/api/login-ping'")) {
  const insertAt = source.indexOf("app.post('/api/token'");
  source = source.slice(0, insertAt) + "app.post('/api/login-ping', (req,res) => { res.set('Cache-Control','no-store'); res.json({ ok:true, marker:'server-1706' }); });\n\n" + source.slice(insertAt);
} else {
  source = source.replace(/marker:'server-[^']+'/g, "marker:'server-1706'");
}

const routeStart = source.indexOf("app.post('/api/token'");
const routeEnd = source.indexOf("app.get('/api/community'", routeStart);
if (routeStart === -1 || routeEnd === -1) throw new Error('Could not locate Discord token route boundaries.');

const tokenRoute = `app.post('/api/token', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const code = String(req.body?.code || '');
    if (!code) return res.status(400).json({ error: 'Discord authorization code is missing.' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let tokenResponse;
    try {
      tokenResponse = await nodeFetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID || '',
          client_secret: process.env.DISCORD_CLIENT_SECRET || '',
          grant_type: 'authorization_code',
          code
        }),
        signal: controller.signal,
        agent: discordAgent
      });
    } finally {
      clearTimeout(timeout);
    }

    const oauth = await tokenResponse.json();
    if (!tokenResponse.ok || !oauth?.access_token) {
      console.error('Discord token exchange failed:', tokenResponse.status, oauth?.error || oauth?.error_description || 'unknown');
      return res.status(401).json({ error: 'Discord authorization failed. Verify the Discord Client ID/Secret and relaunch /casino.' });
    }

    const profileController = new AbortController();
    const profileTimeout = setTimeout(() => profileController.abort(), 10000);
    let meResponse;
    try {
      meResponse = await nodeFetch('https://discord.com/api/users/@me', {
        headers: { Authorization: 'Bearer ' + oauth.access_token },
        signal: profileController.signal,
        agent: discordAgent
      });
    } finally {
      clearTimeout(profileTimeout);
    }

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
      accessToken: oauth.access_token,
      user: cleanUser(user),
      state: { ...gameState(user, now), games: GAMES, items: ITEMS, plinko: PLINKO, plinkoTables: PLINKO_TABLES }
    });
  } catch (error) {
    console.error('Discord login route failed:', error?.name || '', error?.message || error);
    const timedOut = error?.name === 'AbortError' || /timed out|abort/i.test(String(error?.message || ''));
    return res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'Discord OAuth request timed out on the server.' : ('Discord sign-in failed: ' + (error?.message || 'unknown server error'))
    });
  }
});

`;

source = source.slice(0, routeStart) + tokenRoute + source.slice(routeEnd);

if (!source.includes("import nodeFetch from 'node-fetch';")) throw new Error('node-fetch import was not applied.');
if (!source.includes("import https from 'node:https';")) throw new Error('HTTPS import was not applied.');
if (!source.includes('family: 4')) throw new Error('IPv4-only Discord agent was not applied.');
if (!source.includes('agent: discordAgent')) throw new Error('Discord requests are not using the IPv4 agent.');
if (!source.includes("marker:'server-1706'")) throw new Error('Server marker update was not applied.');

fs.writeFileSync(serverPath, source);
console.log('Patched Discord OAuth to force IPv4 on Render (server-1706).');
