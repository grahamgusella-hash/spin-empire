import 'dotenv/config';
import { adminCommand } from '../admin.js';
import { rainCommands } from '../rain.js';

const {
  DISCORD_CLIENT_ID,
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID
} = process.env;

if (!DISCORD_CLIENT_ID || !DISCORD_BOT_TOKEN) {
  throw new Error('Add DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN to .env first.');
}

const authHeaders = {
  Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  'Content-Type': 'application/json'
};

const globalCommandsUrl = `https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/commands`;
const guildCommandsUrl = DISCORD_GUILD_ID
  ? `https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/guilds/${DISCORD_GUILD_ID}/commands`
  : null;

async function readJson(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return { raw: text }; }
}

async function registerGuildCommand(command) {
  if (!guildCommandsUrl) {
    console.warn(`Skipping /${command.name}: DISCORD_GUILD_ID is not set.`);
    return;
  }
  const response = await fetch(guildCommandsUrl, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(command)
  });
  const result = await readJson(response);
  if (!response.ok) throw new Error(`/${command.name} registration failed:\n${JSON.stringify(result, null, 2)}`);
  console.log(`Registered /${command.name}`);
}

async function registerCasinoEntryPoint() {
  const listResponse = await fetch(globalCommandsUrl, { headers: authHeaders });
  const commands = await readJson(listResponse);
  if (!listResponse.ok) {
    throw new Error(`Could not read global Discord commands:\n${JSON.stringify(commands, null, 2)}`);
  }

  const entryPoint = Array.isArray(commands) ? commands.find(command => command.type === 4) : null;
  const payload = {
    name: 'casino',
    description: 'Launch Spin Empire',
    type: 4,
    handler: 2,
    integration_types: [0, 1],
    contexts: [0, 1, 2]
  };

  const url = entryPoint ? `${globalCommandsUrl}/${entryPoint.id}` : globalCommandsUrl;
  const response = await fetch(url, {
    method: entryPoint ? 'PATCH' : 'POST',
    headers: authHeaders,
    body: JSON.stringify(payload)
  });
  const result = await readJson(response);
  if (!response.ok) {
    throw new Error(`/casino Activity command registration failed:\n${JSON.stringify(result, null, 2)}`);
  }
  console.log('Registered /casino Activity entry point');
}

await registerCasinoEntryPoint();
await registerGuildCommand(adminCommand);
for (const command of rainCommands) await registerGuildCommand(command);

console.log('All Spin Empire commands registered successfully.');
