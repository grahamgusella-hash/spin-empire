import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(here, '..', 'server.js');
let source = fs.readFileSync(serverPath, 'utf8');

const from = "res.json({ session, accessToken: oauth.access_token, user: cleanUser(user) });";
const to = "res.json({ session, accessToken: oauth.access_token, user: cleanUser(user), state: { ...gameState(user,Date.now()), games: GAMES, items: ITEMS, plinko: PLINKO, plinkoTables: PLINKO_TABLES } });";

if (source.includes(from)) {
  source = source.replace(from, to);
  fs.writeFileSync(serverPath, source);
  console.log('Patched login bootstrap state.');
} else if (source.includes('state: { ...gameState(user,Date.now())')) {
  console.log('Login bootstrap state is already patched.');
} else {
  throw new Error('Could not patch server login response.');
}
