import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES, ITEMS, PLINKO, PLINKO_TABLES } from '../games.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.join(here, '..', 'src', 'main.js');
let source = fs.readFileSync(mainPath, 'utf8');

const BUILD_MARKER = 'v0914-1936';
const STATIC_STATE = JSON.stringify({ games:GAMES, items:ITEMS, plinko:PLINKO, plinkoTables:PLINKO_TABLES });
const original = "const sdk = new DiscordSDK(config.clientId); await sdk.ready(); guildId = sdk.guildId || ''; const {code} = await sdk.commands.authorize({client_id:config.clientId,response_type:'code',state:crypto.randomUUID(),prompt:'none',scope:['identify']}); const auth = await api('/api/token',{code}); session = auth.session; await sdk.commands.authenticate({access_token:auth.accessToken}); profile = auth.user;";

const patched = `const sdk = new DiscordSDK(config.clientId);
$('connection').textContent = 'Connecting to Discord SDK… ${BUILD_MARKER}';
await sdk.ready();
guildId = sdk.guildId || '';
const activityInstanceId = String(sdk.instanceId || '');
if (!activityInstanceId) throw new Error('Discord did not provide an Activity instance ID. Close Spin Empire and run /casino again.');
$('connection').textContent = 'Verifying /casino launch… ${BUILD_MARKER}';
const loginUrl = '/api/activity-login?instanceId=' + encodeURIComponent(activityInstanceId) + '&guildId=' + encodeURIComponent(guildId);
const response = await fetch(loginUrl, { method:'GET', headers:{'Accept':'application/json'}, cache:'no-store' });
$('connection').textContent = 'Login response received… ${BUILD_MARKER}';
let data;
try { data = await response.json(); }
catch { throw new Error('Spin Empire received an invalid login response.'); }
$('connection').textContent = 'Login data parsed… ${BUILD_MARKER}';
if (!response.ok || !data.ok) throw new Error(data.error || ('Spin Empire sign-in failed (HTTP ' + response.status + ').'));
session = data.session;
profile = data.user;
state = Object.assign({}, data.state || {}, ${STATIC_STATE});
if (data.guildId) guildId = data.guildId;
if (!session || !profile || !state) throw new Error('Spin Empire received an incomplete login response.');
$('connection').textContent = 'Starting Spin Empire… ${BUILD_MARKER}';`;

if (source.includes(original)) {
  source = source.replace(original, patched);
} else {
  const starts = [
    "const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK… v0914-1930';",
    "const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK… v0914-1920';",
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

if (!source.includes('Login data parsed… v0914-1936')) throw new Error('Parsed-login stage was not applied.');
if (!source.includes('Object.assign({}, data.state || {}')) throw new Error('Static game catalog bootstrap was not applied.');
if (!source.includes(BUILD_MARKER)) throw new Error('Visible build marker was not applied.');

fs.writeFileSync(mainPath, source);
console.log(`Patched client to use a small login response with embedded game catalog (${BUILD_MARKER}).`);
