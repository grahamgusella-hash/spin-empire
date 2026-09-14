import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.join(here, '..', 'src', 'main.js');
let source = fs.readFileSync(mainPath, 'utf8');

const original = "const sdk = new DiscordSDK(config.clientId); await sdk.ready(); guildId = sdk.guildId || ''; const {code} = await sdk.commands.authorize({client_id:config.clientId,response_type:'code',state:crypto.randomUUID(),prompt:'none',scope:['identify']}); const auth = await api('/api/token',{code}); session = auth.session; await sdk.commands.authenticate({access_token:auth.accessToken}); profile = auth.user;";

const patched = `const sdk = new DiscordSDK(config.clientId);
$('connection').textContent = 'Connecting to Discord SDK…';
await Promise.race([
  sdk.ready(),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error('Discord SDK connection timed out after 8 seconds.')),8000))
]);
guildId = sdk.guildId || '';
$('connection').textContent = 'Requesting Discord authorization…';
const {code} = await Promise.race([
  sdk.commands.authorize({client_id:config.clientId,response_type:'code',state:crypto.randomUUID(),prompt:'none',scope:['identify']}),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error('Discord authorization timed out after 10 seconds.')),10000))
]);
$('connection').textContent = 'Exchanging Discord login…';
const controller = new AbortController();
const loginTimer = setTimeout(()=>controller.abort(),10000);
let auth;
try {
  const response = await fetch('/api/token', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({code}),
    signal:controller.signal
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Discord sign-in failed.');
  auth = data;
} catch (error) {
  if (error?.name === 'AbortError') throw new Error('Spin Empire login server timed out after 10 seconds.');
  throw error;
} finally {
  clearTimeout(loginTimer);
}
session = auth.session;
profile = auth.user;
$('connection').textContent = 'Loading game data…';`;

const knownPrefixes = [
  "const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK…';",
  original
];

if (source.includes(original)) {
  source = source.replace(original, patched);
} else {
  const start = source.indexOf("const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK…';");
  if (start !== -1) {
    const marker = "profile = auth.user;";
    const end = source.indexOf(marker, start);
    if (end === -1) throw new Error('Could not locate end of Discord login sequence.');
    let replaceEnd = end + marker.length;
    const after = source.slice(replaceEnd);
    const extras = [
      "\nif (auth.state) state = auth.state;",
      "\n$('connection').textContent = 'Loading Spin Empire…';\n// The server has already authenticated this user with Discord and returns the initial game state.\n// Do not block startup on Discord's optional SDK authenticate RPC.\nsdk.commands.authenticate({access_token:auth.accessToken}).catch(() => {});",
      "\n$('connection').textContent = 'Loading Spin Empire…';\n// Discord's authenticate RPC can hang in some Activity launches even after OAuth succeeds.\n// The server session above is already authenticated from the same Discord access token,\n// so do not block the game UI on this optional SDK-side handshake.\nsdk.commands.authenticate({access_token:auth.accessToken}).catch(() => {});"
    ];
    for (const extra of extras) {
      if (source.startsWith(extra, replaceEnd)) replaceEnd += extra.length;
    }
    source = source.slice(0,start) + patched + source.slice(replaceEnd);
  } else if (!source.includes("$('connection').textContent = 'Loading game data…';")) {
    throw new Error('Could not find Discord login sequence in src/main.js.');
  }
}

const plainGamesLoad = "} state = await api('/api/games'); $('side-name').textContent = profile.username;";
const oldFallback = "} if (!state) { $('connection').textContent = 'Loading game data…'; state = await Promise.race([api('/api/games'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Game data timed out after 8 seconds.')),8000))]); } $('side-name').textContent = profile.username;";
const gamesLoadPatched = "} $('connection').textContent = 'Loading game data…'; state = await Promise.race([api('/api/games'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Game data timed out after 8 seconds.')),8000))]); $('side-name').textContent = profile.username;";
if (source.includes(plainGamesLoad)) source = source.replace(plainGamesLoad, gamesLoadPatched);
if (source.includes(oldFallback)) source = source.replace(oldFallback, gamesLoadPatched);

if (!source.includes("const controller = new AbortController();")) throw new Error('Login AbortController patch was not applied.');
if (!source.includes("$('connection').textContent = 'Loading game data…'; state = await Promise.race([api('/api/games')")) throw new Error('Game data timeout patch was not applied.');
if (source.includes('sdk.commands.authenticate({access_token:auth.accessToken})')) throw new Error('Blocking/background SDK authenticate call is still present.');

fs.writeFileSync(mainPath, source);
console.log('Patched Discord login with abortable token exchange and removed SDK authenticate RPC entirely.');
