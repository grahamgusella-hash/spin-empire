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
const auth = await Promise.race([
  api('/api/token',{code}),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error('Spin Empire login server timed out after 10 seconds.')),10000))
]);
session = auth.session;
profile = auth.user;
$('connection').textContent = 'Loading Spin Empire…';
// Discord's authenticate RPC can hang in some Activity launches even after OAuth succeeds.
// The server session above is already authenticated from the same Discord access token,
// so do not block the game UI on this optional SDK-side handshake.
sdk.commands.authenticate({access_token:auth.accessToken}).catch(() => {});`;

const stagedBlocking = `const sdk = new DiscordSDK(config.clientId);
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
const auth = await Promise.race([
  api('/api/token',{code}),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error('Spin Empire login server timed out after 10 seconds.')),10000))
]);
session = auth.session;
$('connection').textContent = 'Authenticating Discord session…';
await Promise.race([
  sdk.commands.authenticate({access_token:auth.accessToken}),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error('Discord session authentication timed out after 8 seconds.')),8000))
]);
profile = auth.user;`;

if (source.includes(original)) {
  source = source.replace(original, patched);
  fs.writeFileSync(mainPath, source);
  console.log('Patched Discord login without blocking on authenticate RPC.');
} else if (source.includes(stagedBlocking)) {
  source = source.replace(stagedBlocking, patched);
  fs.writeFileSync(mainPath, source);
  console.log('Replaced blocking Discord authenticate RPC with background handshake.');
} else if (source.includes("$('connection').textContent = 'Loading Spin Empire…'") && source.includes("sdk.commands.authenticate({access_token:auth.accessToken}).catch(() => {});")) {
  console.log('Non-blocking Discord authenticate flow is already patched.');
} else {
  throw new Error('Could not find the Discord login sequence in src/main.js.');
}
