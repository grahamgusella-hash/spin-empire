import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.join(here, '..', 'src', 'main.js');
let source = fs.readFileSync(mainPath, 'utf8');

const BUILD_MARKER = 'v0914-1655';
const original = "const sdk = new DiscordSDK(config.clientId); await sdk.ready(); guildId = sdk.guildId || ''; const {code} = await sdk.commands.authorize({client_id:config.clientId,response_type:'code',state:crypto.randomUUID(),prompt:'none',scope:['identify']}); const auth = await api('/api/token',{code}); session = auth.session; await sdk.commands.authenticate({access_token:auth.accessToken}); profile = auth.user;";

const patched = `const sdk = new DiscordSDK(config.clientId);
$('connection').textContent = 'Connecting to Discord SDK… ${BUILD_MARKER}';
await sdk.ready();
guildId = sdk.guildId || '';
$('connection').textContent = 'Requesting Discord authorization… ${BUILD_MARKER}';
const {code} = await sdk.commands.authorize({
  client_id:config.clientId,
  response_type:'code',
  state:'',
  prompt:'none',
  scope:['identify','guilds','applications.commands']
});
$('connection').textContent = 'Checking Spin Empire server… ${BUILD_MARKER}';
const pingResponse = await fetch('/api/login-ping', { method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, body:'{}' });
const pingData = await pingResponse.json();
if (!pingResponse.ok || !pingData.ok) throw new Error(pingData.error || ('Server probe failed (HTTP ' + pingResponse.status + ').'));
$('connection').textContent = 'Server reached: ' + (pingData.marker || 'ok') + ' · exchanging Discord login… ${BUILD_MARKER}';
const response = await fetch('/api/token', {
  method:'POST',
  headers:{'Content-Type':'application/json','Accept':'application/json'},
  body:JSON.stringify({code})
});
const raw = await response.text();
let data;
try { data = raw ? JSON.parse(raw) : {}; }
catch {
  const preview = raw.replace(/\\s+/g,' ').trim().slice(0,160);
  throw new Error('Login returned HTTP ' + response.status + ', not JSON: ' + (preview || '(empty response)'));
}
if (!response.ok) throw new Error(data.error || ('Discord sign-in failed (HTTP ' + response.status + ').'));
session = data.session;
profile = data.user;
state = data.state;
if (!session || !profile || !state) throw new Error('Spin Empire received an incomplete login response.');
$('connection').textContent = 'Starting Spin Empire… ${BUILD_MARKER}';`;

if (source.includes(original)) {
  source = source.replace(original, patched);
} else {
  const starts = [
    "const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK… v0914-1647';",
    "const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK… v0914-1640';",
    "const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK… v0914-1636';",
    "const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK…';"
  ];
  let start = -1;
  for (const pattern of starts) { start = source.indexOf(pattern); if (start !== -1) break; }
  if (start === -1) {
    if (!source.includes(BUILD_MARKER)) throw new Error('Could not find Discord login sequence in src/main.js.');
  } else {
    const sideMarker = "$('side-name').textContent = profile.username;";
    const end = source.indexOf(sideMarker, start);
    if (end === -1) throw new Error('Could not locate end of Discord login sequence.');
    source = source.slice(0,start) + patched + source.slice(end);
  }
}

const plainGamesLoad = "} state = await api('/api/games'); $('side-name').textContent = profile.username;";
if (source.includes(plainGamesLoad)) source = source.replace(plainGamesLoad, "} $('side-name').textContent = profile.username;");
if (!source.includes("scope:['identify','guilds','applications.commands']")) throw new Error('Official Discord Activity scopes were not applied.');
if (!source.includes("state:''")) throw new Error('Official Discord Activity state value was not applied.');
if (!source.includes(BUILD_MARKER)) throw new Error('Visible build marker was not applied.');

fs.writeFileSync(mainPath, source);
console.log(`Patched client to Discord official Activity OAuth pattern (${BUILD_MARKER}).`);
