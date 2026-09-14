import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.join(here, '..', 'src', 'main.js');
let source = fs.readFileSync(mainPath, 'utf8');

const replacements = [
  [
    "async function connect() { const config = await fetch('/api/config').then(r => r.json()); let profile;",
    "async function connect() { const config = await fetch('/api/config').then(r => r.json()); let profile, auth;"
  ],
  [
    "state:crypto.randomUUID(),prompt:'none',scope:['identify']",
    "state:'',prompt:'none',scope:['identify','guilds','applications.commands']"
  ],
  [
    "const sdk = new DiscordSDK(config.clientId); await sdk.ready(); guildId = sdk.guildId || ''; const {code} = await sdk.commands.authorize",
    "const sdk = new DiscordSDK(config.clientId); $('connection').textContent = 'Connecting to Discord…'; await sdk.ready(); $('connection').textContent = 'Authorizing with Discord…'; guildId = sdk.guildId || ''; const {code} = await sdk.commands.authorize"
  ],
  [
    "const auth = await api('/api/token',{code}); session = auth.session; await sdk.commands.authenticate({access_token:auth.accessToken}); profile = auth.user;",
    "$('connection').textContent = 'Signing in…'; auth = await Promise.race([api('/api/token',{code}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Discord sign-in timed out. Close Spin Empire and run /casino again.')),10000))]); session = auth.session; profile = auth.user; sdk.commands.authenticate({access_token:auth.accessToken}).catch(()=>{});"
  ],
  [
    "$('connection').textContent = 'Signing in…'; auth = await api('/api/token',{code}); session = auth.session; const discordAuth = await sdk.commands.authenticate({access_token:auth.accessToken}); if (!discordAuth) throw new Error('Discord login failed. Close Spin Empire and open it again.'); profile = discordAuth.user || auth.user;",
    "$('connection').textContent = 'Signing in…'; auth = await Promise.race([api('/api/token',{code}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Discord sign-in timed out. Close Spin Empire and run /casino again.')),10000))]); session = auth.session; profile = auth.user; sdk.commands.authenticate({access_token:auth.accessToken}).catch(()=>{});"
  ],
  [
    "$('connection').textContent = 'Signing in…'; auth = await Promise.race([api('/api/token',{code}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Discord sign-in timed out. Close Spin Empire and run /casino again.')),10000))]); session = auth.session; const discordAuth = await sdk.commands.authenticate({access_token:auth.accessToken}); if (!discordAuth) throw new Error('Discord login failed. Close Spin Empire and open it again.'); profile = discordAuth.user || auth.user;",
    "$('connection').textContent = 'Signing in…'; auth = await Promise.race([api('/api/token',{code}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Discord sign-in timed out. Close Spin Empire and run /casino again.')),10000))]); session = auth.session; profile = auth.user; sdk.commands.authenticate({access_token:auth.accessToken}).catch(()=>{});"
  ],
  [
    "} state = await api('/api/games'); $('side-name').textContent = profile.username;",
    "} $('connection').textContent = 'Loading games…'; state = auth?.state || await Promise.race([api('/api/games'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Game data timed out. Please reopen Spin Empire.')),8000))]); $('side-name').textContent = profile.username;"
  ],
  [
    "} $('connection').textContent = 'Loading games…'; state = await api('/api/games'); $('side-name').textContent = profile.username;",
    "} $('connection').textContent = 'Loading games…'; state = auth?.state || await Promise.race([api('/api/games'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Game data timed out. Please reopen Spin Empire.')),8000))]); $('side-name').textContent = profile.username;"
  ]
];

let changed = false;
for (const [from, to] of replacements) {
  if (source.includes(from)) {
    source = source.replace(from, to);
    changed = true;
  }
}

if (!source.includes("scope:['identify','guilds','applications.commands']")) throw new Error('Auth patch could not find the Discord authorize call in src/main.js.');
if (!source.includes("profile = auth.user; sdk.commands.authenticate({access_token:auth.accessToken}).catch(()=>{});")) throw new Error('Non-blocking Discord authenticate patch was not applied correctly.');
if (!source.includes('let profile, auth;') || !source.includes("Promise.race([api('/api/token',{code})")) throw new Error('Auth timeout patch was not applied correctly.');

if (changed) {
  fs.writeFileSync(mainPath, source);
  console.log('Patched Discord Activity authentication flow without blocking on SDK authenticate.');
} else {
  console.log('Discord Activity authentication flow is already patched.');
}
