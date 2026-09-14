import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.join(here, '..', 'src', 'main.js');
let source = fs.readFileSync(mainPath, 'utf8');

const BUILD_MARKER = 'v0914-1632';
const original = "const sdk = new DiscordSDK(config.clientId); await sdk.ready(); guildId = sdk.guildId || ''; const {code} = await sdk.commands.authorize({client_id:config.clientId,response_type:'code',state:crypto.randomUUID(),prompt:'none',scope:['identify']}); const auth = await api('/api/token',{code}); session = auth.session; await sdk.commands.authenticate({access_token:auth.accessToken}); profile = auth.user;";

const patched = `const sdk = new DiscordSDK(config.clientId);
$('connection').textContent = 'Connecting to Discord SDK… ${BUILD_MARKER}';
await sdk.ready();
guildId = sdk.guildId || '';
$('connection').textContent = 'Requesting Discord authorization… ${BUILD_MARKER}';
const {code} = await sdk.commands.authorize({client_id:config.clientId,response_type:'code',state:crypto.randomUUID(),prompt:'none',scope:['identify']});
$('connection').textContent = 'Exchanging Discord login… ${BUILD_MARKER}';
let auth;
const response = await fetch('/api/token', {
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({code})
});
$('connection').textContent = 'Discord login response received… ${BUILD_MARKER}';
const raw = await response.text();
let data;
try { data = raw ? JSON.parse(raw) : {}; }
catch { throw new Error('Spin Empire received an invalid login response from the server.'); }
if (!response.ok) throw new Error(data.error || 'Discord sign-in failed.');
auth = data;
session = auth.session;
profile = auth.user;
state = auth.state;
if (!state) throw new Error('Spin Empire did not receive its startup game data.');
$('connection').textContent = 'Starting Spin Empire… ${BUILD_MARKER}';`;

const startPatterns = [
  "const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK… v0914-1627';",
  "const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK…';"
];

if (source.includes(original)) {
  source = source.replace(original, patched);
} else {
  let start = -1;
  for (const pattern of startPatterns) {
    start = source.indexOf(pattern);
    if (start !== -1) break;
  }
  if (start !== -1) {
    const endMarker = "$('connection').textContent = 'Starting Spin Empire… v0914-1627';";
    let end = source.indexOf(endMarker, start);
    if (end !== -1) {
      end += endMarker.length;
      source = source.slice(0,start) + patched + source.slice(end);
    } else {
      const profileMarker = "profile = auth.user;";
      end = source.indexOf(profileMarker, start);
      if (end === -1) throw new Error('Could not locate end of Discord login sequence.');
      end += profileMarker.length;
      source = source.slice(0,start) + patched + source.slice(end);
    }
  } else if (!source.includes(BUILD_MARKER)) {
    throw new Error('Could not find Discord login sequence in src/main.js.');
  }
}

const plainGamesLoad = "} state = await api('/api/games'); $('side-name').textContent = profile.username;";
const timedGamesLoad = "} $('connection').textContent = 'Loading game data…'; state = await Promise.race([api('/api/games'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Game data timed out after 8 seconds.')),8000))]); $('side-name').textContent = profile.username;";
const oldFallback = "} if (!state) { $('connection').textContent = 'Loading game data…'; state = await Promise.race([api('/api/games'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Game data timed out after 8 seconds.')),8000))]); } $('side-name').textContent = profile.username;";
const noGamesLoad = "} $('side-name').textContent = profile.username;";
if (source.includes(plainGamesLoad)) source = source.replace(plainGamesLoad, noGamesLoad);
if (source.includes(timedGamesLoad)) source = source.replace(timedGamesLoad, noGamesLoad);
if (source.includes(oldFallback)) source = source.replace(oldFallback, noGamesLoad);

if (!source.includes('state = auth.state;')) throw new Error('Bootstrap state patch was not applied.');
if (!source.includes(BUILD_MARKER)) throw new Error('Visible build marker was not applied.');
if (source.includes("state = await api('/api/games')")) throw new Error('Blocking startup game request is still present.');
if (source.includes('sdk.commands.authenticate({access_token:auth.accessToken})')) throw new Error('SDK authenticate call is still present.');

fs.writeFileSync(mainPath, source);
console.log(`Patched startup for Discord Activity timer throttling with marker ${BUILD_MARKER}.`);
