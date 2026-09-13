import 'dotenv/config';

const {
  DISCORD_CLIENT_ID,
  DISCORD_BOT_TOKEN
} = process.env;

if (!DISCORD_CLIENT_ID || !DISCORD_BOT_TOKEN) {
  throw new Error('Missing DISCORD_CLIENT_ID or DISCORD_BOT_TOKEN in .env');
}

const url =
  `https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/commands`;

const response = await fetch(url, {
  method: 'PUT',
  headers: {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify([])
});

const result = await response.json();

if (!response.ok) {
  throw new Error(JSON.stringify(result, null, 2));
}

console.log('Global commands cleared.');