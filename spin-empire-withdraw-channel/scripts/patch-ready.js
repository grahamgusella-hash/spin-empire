import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES, ITEMS, PLINKO, PLINKO_TABLES } from '../games.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.join(here, '..', 'src', 'main.js');
let source = fs.readFileSync(mainPath, 'utf8');

const BUILD_MARKER = 'v0914-1952';
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
const response = await fetch(loginUrl, { method:'GET', cache:'no-store' });
$('connection').textContent = 'Login response received… ${BUILD_MARKER}';
const headerPayload = response.headers.get('x-spin-login');
if (!response.ok || !headerPayload) throw new Error(response.headers.get('x-spin-error') || ('Spin Empire sign-in failed (HTTP ' + response.status + ').'));
let data;
try { data = JSON.parse(decodeURIComponent(headerPayload)); }
catch { throw new Error('Spin Empire received invalid login data.'); }
$('connection').textContent = 'Login data parsed… ${BUILD_MARKER}';
session = data.session;
profile = data.user;
state = Object.assign({ balance:0, round:null, inventory:[] }, data.state || {}, ${STATIC_STATE});
state.games = Array.isArray(state.games) ? state.games : [];
state.items = Array.isArray(state.items) ? state.items : [];
state.inventory = Array.isArray(state.inventory) ? state.inventory : [];
state.plinko = state.plinko || {};
state.plinkoTables = state.plinkoTables || {};
if (data.guildId) guildId = data.guildId;
if (!session || !profile) throw new Error('Spin Empire received incomplete login data.');
$('connection').textContent = 'Starting Spin Empire… ${BUILD_MARKER}';`;

const starts = [
  "const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK… v0914-1944';",
  "const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK… v0914-1936';",
  "const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK… v0914-1930';",
  "const sdk = new DiscordSDK(config.clientId);\n$('connection').textContent = 'Connecting to Discord SDK…';"
];
if (source.includes(original)) source = source.replace(original, patched);
else {
  let start = -1;
  for (const pattern of starts) { start = source.indexOf(pattern); if (start !== -1) break; }
  if (start === -1) { if (!source.includes(BUILD_MARKER)) throw new Error('Could not find Discord login sequence in src/main.js.'); }
  else {
    const sideMarker = "$('side-name').textContent = profile.username;";
    const end = source.indexOf(sideMarker, start);
    if (end === -1) throw new Error('Could not locate end of Discord login sequence.');
    source = source.slice(0,start) + patched + source.slice(end);
  }
}

const plainGamesLoad = "} state = await api('/api/games'); $('side-name').textContent = profile.username;";
if (source.includes(plainGamesLoad)) source = source.replace(plainGamesLoad, "} $('side-name').textContent = profile.username;");

if (!source.includes("response.headers.get('x-spin-login')")) throw new Error('Header login transport was not applied.');
if (!source.includes(BUILD_MARKER)) throw new Error('Visible build marker was not applied.');
fs.writeFileSync(mainPath, source);
console.log(`Patched client to use compact header login transport (${BUILD_MARKER}).`);
