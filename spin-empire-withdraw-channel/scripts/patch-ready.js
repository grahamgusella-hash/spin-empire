import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.join(here, '..', 'src', 'main.js');
let source = fs.readFileSync(mainPath, 'utf8');

const BUILD_MARKER = 'v0914-1912';
const original = "const sdk = new DiscordSDK(config.clientId); await sdk.ready(); guildId = sdk.guildId || ''; const {code} = await sdk.commands.authorize({client_id:config.clientId,response_type:'code',state:crypto.randomUUID(),prompt:'none',scope:['identify']}); const auth = await api('/api/token',{code}); session = auth.session; await sdk.commands.authenticate({access_token:auth.accessToken}); profile = auth.user;";

const patched = `const sdk = new DiscordSDK(config.clientId);
$('connection').textContent = 'Connecting to Discord SDK… ${BUILD_MARKER}';
await sdk.ready();
guildId = sdk.guildId || '';
const activityInstanceId = String(sdk.instanceId || '');
if (!activityInstanceId) throw new Error('Discord did not provide an Activity instance ID. Close Spin Empire and run /casino again.');
$('connection').textContent = 'Verifying /casino launch… ${BUILD_MARKER}';
const response = await fetch('/api/login-ping', {
  method:'POST',
  headers:{'Content-Type':'application/json','Accept':'application/json'},
  body:JSON.stringify({instanceId:activityInstanceId,guildId})
});
const raw = await response.text();
let data;
try { data = raw ? JSON.parse(raw) : {}; }
catch {
  const preview = raw.replace(/\\s+/g,' ').trim().slice(0,160);
  throw new Error('Login returned HTTP ' + response.status + ', not JSON: ' + (preview || '(empty response)'));
}
if (!response.ok || !data.ok) throw new Error(data.error || ('Spin Empire sign-in failed (HTTP ' + response.status + ').'));
$('connection').textContent = 'Verified by ' + (data.marker || 'server') + ' · starting Spin Empire… ${BUILD_MARKER}';
session = data.session;
profile = data.user;
state = data.state;
if (data.guildId) guildId = data.guildId;
if (!session || !profile || !state) throw new Error('Spin Empire received an incomplete login response.');`;

if (source.includes(original)) {
  source = source.replace(original, patched);
} else {
  const starts = [
    "const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK… v0914-1904';",
    "const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK… v0914-1855';",
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

if (!source.includes("fetch('/api/login-ping'")) throw new Error('Combined Activity login request was not applied.');
if (source.includes("fetch('/api/token'")) throw new Error('Old second login request is still present.');
if (source.includes('sdk.commands.authorize(')) throw new Error('Old Discord OAuth authorize call is still present.');
if (!source.includes(BUILD_MARKER)) throw new Error('Visible build marker was not applied.');

fs.writeFileSync(mainPath, source);
console.log(`Patched client to use one Activity login request (${BUILD_MARKER}).`);
