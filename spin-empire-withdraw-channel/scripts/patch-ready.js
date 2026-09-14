import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.join(here, '..', 'src', 'main.js');
let source = fs.readFileSync(mainPath, 'utf8');

const BUILD_MARKER = 'v0914-1636';
const original = "const sdk = new DiscordSDK(config.clientId); await sdk.ready(); guildId = sdk.guildId || ''; const {code} = await sdk.commands.authorize({client_id:config.clientId,response_type:'code',state:crypto.randomUUID(),prompt:'none',scope:['identify']}); const auth = await api('/api/token',{code}); session = auth.session; await sdk.commands.authenticate({access_token:auth.accessToken}); profile = auth.user;";

const patched = `const sdk = new DiscordSDK(config.clientId);
$('connection').textContent = 'Connecting to Discord SDK… ${BUILD_MARKER}';
await sdk.ready();
guildId = sdk.guildId || '';
$('connection').textContent = 'Requesting Discord authorization… ${BUILD_MARKER}';
const {code} = await sdk.commands.authorize({client_id:config.clientId,response_type:'code',state:crypto.randomUUID(),prompt:'none',scope:['identify']});
$('connection').textContent = 'Exchanging Discord login… ${BUILD_MARKER}';
const response = await fetch('/api/token', { method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, body:JSON.stringify({code}) });
const raw = await response.text();
$('connection').textContent = \`Login response: HTTP \${response.status} · \${response.headers.get('content-type') || 'no content-type'} · ${BUILD_MARKER}\`;
let data;
try { data = raw ? JSON.parse(raw) : {}; }
catch {
  const preview = raw.replace(/\\s+/g,' ').trim().slice(0,160);
  throw new Error(\`Login returned HTTP \${response.status}, not JSON: \${preview || '(empty response)'}\`);
}
if (!response.ok) throw new Error(data.error || \`Discord sign-in failed (HTTP \${response.status}).\`);
const auth = data;
session = auth.session;
profile = auth.user;
state = auth.state;
if (!state) throw new Error('Spin Empire did not receive its startup game data.');
$('connection').textContent = 'Starting Spin Empire… ${BUILD_MARKER}';`;

const starts = [
  "const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK… v0914-1632';",
  "const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK… v0914-1627';",
  "const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK…';"
];
if (source.includes(original)) source = source.replace(original, patched);
else {
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
if (!source.includes('state = auth.state;')) throw new Error('Bootstrap state patch was not applied.');
if (!source.includes(BUILD_MARKER)) throw new Error('Visible build marker was not applied.');
if (source.includes('sdk.commands.authenticate({access_token:auth.accessToken})')) throw new Error('SDK authenticate call is still present.');

fs.writeFileSync(mainPath, source);
console.log(`Patched startup to expose HTTP/content-type/body details for login failures (${BUILD_MARKER}).`);
