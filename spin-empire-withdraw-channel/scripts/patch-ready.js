import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.join(here, '..', 'src', 'main.js');
let source = fs.readFileSync(mainPath, 'utf8');

const original = "const sdk = new DiscordSDK(config.clientId); await sdk.ready(); guildId = sdk.guildId || '';";
const patched = "const hostClientId = /^(\\d+)\\.discordsays\\.com$/i.exec(window.location.hostname)?.[1]; const activityClientId = hostClientId || config.clientId; const sdk = new DiscordSDK(activityClientId); $('connection').textContent = 'Connecting to Discord…'; await Promise.race([sdk.ready(),new Promise((_,reject)=>setTimeout(()=>reject(new Error(`Discord SDK could not connect. Activity ID: ${activityClientId}. Close Spin Empire and launch it again from Discord.`)),8000))]); guildId = sdk.guildId || '';";

if (source.includes(original)) {
  source = source.replace(original, patched);
  fs.writeFileSync(mainPath, source);
  console.log('Patched Discord SDK ready flow with Activity host client ID and timeout.');
} else if (source.includes('const hostClientId = /^(\\d+)\\.discordsays\\.com$/i.exec(window.location.hostname)?.[1]')) {
  console.log('Discord SDK ready flow is already patched.');
} else {
  throw new Error('Could not find Discord SDK ready call in src/main.js.');
}
