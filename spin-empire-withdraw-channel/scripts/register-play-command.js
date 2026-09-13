import 'dotenv/config';
import { adminCommand } from '../admin.js';
import { rainCommands } from '../rain.js';

const {
  DISCORD_CLIENT_ID,
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID
} = process.env;
if (!DISCORD_CLIENT_ID || !DISCORD_BOT_TOKEN) {
  throw new Error(
    'Add DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN to .env first.'
  );
}

const commandUrl =
  `https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/guilds/${DISCORD_GUILD_ID}/commands`;

async function registerCommand(command) {
  const response = await fetch(commandUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      `/${command.name} registration failed:\n` +
      JSON.stringify(result, null, 2)
    );
  }

  console.log(`Registered /${command.name}`);
}

await registerCommand(adminCommand);

for (const command of rainCommands) {
  await registerCommand(command);
}

console.log('All Spin Empire slash commands registered successfully.');