import 'dotenv/config';

const clientId = String(process.env.DISCORD_CLIENT_ID || '').trim();
const botToken = String(process.env.DISCORD_BOT_TOKEN || '').trim();
const guildId = String(process.env.DISCORD_GUILD_ID || '').trim();

if (!clientId || !botToken || !guildId) {
  console.warn('Skipping /casino command restore: DISCORD_CLIENT_ID, DISCORD_BOT_TOKEN, or DISCORD_GUILD_ID is missing.');
  process.exit(0);
}

const base = `https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`;
const headers = {
  Authorization: `Bot ${botToken}`,
  'Content-Type': 'application/json'
};
const payload = {
  name: 'casino',
  description: 'Launch Spin Empire',
  type: 1
};

async function discordRequest(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

try {
  const listResponse = await discordRequest(base, { headers });
  const listText = await listResponse.text();
  let commands = [];
  try { commands = listText ? JSON.parse(listText) : []; } catch {}

  if (!listResponse.ok) {
    console.warn(`Could not read guild commands (HTTP ${listResponse.status}); server will continue starting.`);
    process.exit(0);
  }

  const existing = Array.isArray(commands)
    ? commands.find(command => command.name === 'casino' && command.type === 1)
    : null;

  const response = await discordRequest(existing ? `${base}/${existing.id}` : base, {
    method: existing ? 'PATCH' : 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const body = await response.text();
  if (!response.ok) {
    console.warn(`Could not ${existing ? 'refresh' : 'restore'} /casino (HTTP ${response.status}): ${body.slice(0, 300)}`);
    process.exit(0);
  }

  console.log(existing ? 'Refreshed guild /casino command.' : 'Restored guild /casino command.');
} catch (error) {
  console.warn(`Could not restore /casino before startup: ${error?.name || ''} ${error?.message || error}`);
}
