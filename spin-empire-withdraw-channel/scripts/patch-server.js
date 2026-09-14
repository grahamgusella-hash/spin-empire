import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(here, '..', 'server.js');
let source = fs.readFileSync(serverPath, 'utf8');

const replacements = [
  [
    "res.json({ session, accessToken: oauth.access_token, user: cleanUser(user) });",
    "res.json({ session, accessToken: oauth.access_token, user: cleanUser(user), state: { ...gameState(user,Date.now()), games: GAMES, items: ITEMS, plinko: PLINKO, plinkoTables: PLINKO_TABLES } });"
  ],
  [
    "const response = await fetch('https://discord.com/api/oauth2/token', {",
    "const response = await fetch('https://discord.com/api/oauth2/token', { signal: AbortSignal.timeout(8000),"
  ],
  [
    "const meResponse = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${oauth.access_token}` } });",
    "const meResponse = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${oauth.access_token}` }, signal: AbortSignal.timeout(8000) });"
  ],
  [
    "res.status(500).json({ error: error.message });",
    "res.status(error?.name === 'TimeoutError' ? 504 : 500).json({ error: error?.name === 'TimeoutError' ? 'Discord sign-in timed out. Please close Spin Empire and try /casino again.' : (error.message || 'Discord sign-in failed.') });"
  ]
];

let changed = false;
for (const [from,to] of replacements) {
  if (source.includes(from)) {
    source = source.replace(from,to);
    changed = true;
  }
}

if (!source.includes('state: { ...gameState(user,Date.now())')) throw new Error('Could not patch login bootstrap state.');
if (!source.includes("AbortSignal.timeout(8000)")) throw new Error('Could not patch Discord OAuth timeout.');

if (changed) {
  fs.writeFileSync(serverPath, source);
  console.log('Patched login bootstrap and Discord OAuth timeouts.');
} else {
  console.log('Server login patches are already applied.');
}
