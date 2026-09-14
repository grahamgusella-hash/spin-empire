import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.join(here, '..', 'src', 'main.js');
let source = fs.readFileSync(mainPath, 'utf8');

const BUILD_MARKER = 'v0914-1627';
const original = "const sdk = new DiscordSDK(config.clientId); await sdk.ready(); guildId = sdk.guildId || ''; const {code} = await sdk.commands.authorize({client_id:config.clientId,response_type:'code',state:crypto.randomUUID(),prompt:'none',scope:['identify']}); const auth = await api('/api/token',{code}); session = auth.session; await sdk.commands.authenticate({access_token:auth.accessToken}); profile = auth.user;";

const patched = `const sdk = new DiscordSDK(config.clientId);
$('connection').textContent = 'Connecting to Discord SDK… ${BUILD_MARKER}';
await Promise.race([
  sdk.ready(),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error('Discord SDK connection timed out after 8 seconds.')),8000))
]);
guildId = sdk.guildId || '';
$('connection').textContent = 'Requesting Discord authorization… ${BUILD_MARKER}';
const {code} = await Promise.race([
  sdk.commands.authorize({client_id:config.clientId,response_type:'code',state:crypto.randomUUID(),prompt:'none',scope:['identify']}),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error('Discord authorization timed out after 10 seconds.')),10000))
]);
let secondsLeft = 10;
$('connection').textContent = \`Exchanging Discord login… ${BUILD_MARKER} (\${secondsLeft}s)\`;
const countdown = setInterval(() => {
  secondsLeft -= 1;
  if (secondsLeft >= 0) $('connection').textContent = \`Exchanging Discord login… ${BUILD_MARKER} (\${secondsLeft}s)\`;
},1000);
const controller = new AbortController();
let auth;
try {
  auth = await Promise.race([
    (async () => {
      const response = await fetch('/api/token', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({code}),
        signal:controller.signal
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Discord sign-in failed.');
      return data;
    })(),
    new Promise((_,reject)=>setTimeout(() => {
      controller.abort();
      reject(new Error('Spin Empire login server timed out after 10 seconds.'));
    },10000))
  ]);
} finally {
  clearInterval(countdown);
}
session = auth.session;
profile = auth.user;
state = auth.state;
if (!state) throw new Error('Spin Empire did not receive its startup game data.');
$('connection').textContent = 'Starting Spin Empire… ${BUILD_MARKER}';`;

if (source.includes(original)) {
  source = source.replace(original, patched);
} else {
  const start = source.indexOf("const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK…';");
  if (start !== -1) {
    const marker = "$('connection').textContent = 'Loading game data…';";
    const end = source.indexOf(marker, start);
    if (end === -1) throw new Error('Could not locate end of Discord login sequence.');
    source = source.slice(0,start) + patched + source.slice(end + marker.length);
  } else if (!source.includes("$('connection').textContent = 'Starting Spin Empire…';")) {
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
console.log(`Patched startup with visible build marker ${BUILD_MARKER} and hard client login deadline.`);
