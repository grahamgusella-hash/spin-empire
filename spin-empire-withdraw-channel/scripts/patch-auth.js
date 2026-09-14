import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.join(here, '..', 'src', 'main.js');
let source = fs.readFileSync(mainPath, 'utf8');

const replacements = [
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
    "$('connection').textContent = 'Signing in…'; const auth = await api('/api/token',{code}); session = auth.session; const discordAuth = await sdk.commands.authenticate({access_token:auth.accessToken}); if (!discordAuth) throw new Error('Discord login failed. Close Spin Empire and open it again.'); profile = discordAuth.user || auth.user;"
  ],
  [
    "} state = await api('/api/games'); $('side-name').textContent = profile.username;",
    "} $('connection').textContent = 'Loading games…'; state = await api('/api/games'); $('side-name').textContent = profile.username;"
  ]
];

let changed = false;
for (const [from, to] of replacements) {
  if (source.includes(from)) {
    source = source.replace(from, to);
    changed = true;
  }
}

if (!source.includes("scope:['identify','guilds','applications.commands']")) {
  throw new Error('Auth patch could not find the Discord authorize call in src/main.js.');
}
if (!source.includes('const discordAuth = await sdk.commands.authenticate')) {
  throw new Error('Auth patch could not find the Discord authenticate call in src/main.js.');
}

if (changed) {
  fs.writeFileSync(mainPath, source);
  console.log('Patched Discord Activity authentication flow.');
} else {
  console.log('Discord Activity authentication flow is already patched.');
}
