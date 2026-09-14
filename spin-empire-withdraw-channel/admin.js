import { Client, GatewayIntentBits, MessageFlags } from 'discord.js';
import { CRATE_TYPES, SCRATCH_TYPES } from './games.js';

CRATE_TYPES.starter.price = 1000000;
CRATE_TYPES.miner.price = 10000000;
CRATE_TYPES.royal.price = 50000000;
CRATE_TYPES.mythic.price = 75000000;
SCRATCH_TYPES.bronze.price = 1000000;
SCRATCH_TYPES.silver.price = 10000000;
SCRATCH_TYPES.gold.price = 50000000;
SCRATCH_TYPES.diamond = { name: 'Diamond Scratch', price: 75000000, accent: '#75ddff' };

export const adminCommand = {
  name: 'admin', description: 'Owner-only casino controls', type: 1,
  integration_types: [0], contexts: [0],
  options: [{ type: 1, name: 'give', description: 'Give virtual casino coins to a server member', options: [
    { type: 6, name: 'user', description: 'Member to receive coins', required: true },
    { type: 4, name: 'amount', description: 'Coins to add (1–1,000,000,000)', required: true, min_value: 1, max_value: 1000000000 }
  ] }]
};

export function hasOwnerRole(roleIds, roles) {
  return roles.some(role => role.name === 'owner' && roleIds.includes(role.id));
}

export async function requireOwner(interaction) {
  if (!interaction.inGuild() || !interaction.guild) throw new Error('Use this command in the Discord server, not a DM.');
  const roles = await interaction.guild.roles.fetch();
  const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
  if (!hasOwnerRole([...member.roles.cache.keys()], [...roles.values()])) {
    throw new Error('Only members with the role named exactly "owner" can use this command.');
  }
}

export function validateGrant(balance, amount) {
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000000) {
    throw new Error('Amount must be a whole number from 1 to 1,000,000,000.');
  }
  if (!Number.isSafeInteger(balance + amount)) throw new Error('This would exceed the balance limit.');
}

export async function handleAdmin(interaction, grantCoins) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'admin') return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (!interaction.inGuild() || !interaction.guild) throw new Error('Use this command in the Discord server, not a DM.');
    if (interaction.options.getSubcommand() !== 'give') throw new Error('Unknown admin command.');
    const roles = await interaction.guild.roles.fetch();
    const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
    if (!hasOwnerRole([...member.roles.cache.keys()], [...roles.values()])) {
      throw new Error('Only members with the role named exactly "owner" can use /admin give.');
    }
    const target = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    if (target.bot) throw new Error('Choose a human member, not a bot.');
    await interaction.guild.members.fetch({ user: target.id, force: true });
    const balance = grantCoins(target, amount, interaction);
    await interaction.editReply({ content: `Added ${amount.toLocaleString()} virtual coins to <@${target.id}>. Balance: ${balance.toLocaleString()} coins.`, allowedMentions: { parse: [] } });
  } catch (error) {
    await interaction.editReply({ content: error.message || 'Could not complete the grant.', allowedMentions: { parse: [] } });
  }
}

export async function handleRain(interaction, rainService) {
  if (!interaction.isChatInputCommand() || !['rain', 'claim'].includes(interaction.commandName)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (!interaction.inGuild() || !interaction.guild) throw new Error('Use this command in the Discord server, not a DM.');
    if (interaction.commandName === 'rain') {
      await requireOwner(interaction);
      const rain = rainService.create({ id: interaction.id, guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id,
        amount: interaction.options.getInteger('amount', true), duration: interaction.options.getInteger('duration', true) });
      await interaction.editReply({ content: 'Rain started. No coins were taken from your balance.' });
      await interaction.followUp({ content: `🌧️ ${rain.amount.toLocaleString()} virtual coins are raining! Use /claim before <t:${Math.floor(rain.endsAt / 1000)}:T> (<t:${Math.floor(rain.endsAt / 1000)}:R>). Everyone who claims gets an equal share when time ends.`, allowedMentions: { parse: [] } });
    } else {
      await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
      const rain = rainService.claim(interaction.guildId, interaction.user);
      await interaction.editReply({ content: `You're in! Your equal share will be credited when the rain ends <t:${Math.floor(rain.endsAt / 1000)}:R>. Claimants so far: ${Object.keys(rain.claimants).length}.` });
    }
  } catch (error) {
    await interaction.editReply({ content: error.message || 'Rain command failed.', allowedMentions: { parse: [] } });
  }
}

async function readJson(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; }
}

async function removeStaleGuildCasino(client) {
  const guildId = String(process.env.DISCORD_GUILD_ID || '').trim();
  if (!guildId) return;
  try {
    const guild = await client.guilds.fetch(guildId);
    const commands = await guild.commands.fetch();
    const stale = [...commands.values()].filter(command => command.name === 'casino');
    for (const command of stale) {
      await guild.commands.delete(command.id);
      console.log(`Deleted stale guild /casino command ${command.id}.`);
    }
  } catch (error) {
    console.error('Could not remove stale guild /casino command:', error?.message || error);
  }
}

async function registerCasinoEntryPoint(client, token) {
  const applicationId = client.application?.id || client.user?.id;
  if (!applicationId) throw new Error('Discord application ID is unavailable after login.');
  const headers = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' };
  const baseUrl = `https://discord.com/api/v10/applications/${applicationId}/commands`;
  const listResponse = await fetch(baseUrl, { headers });
  const commands = await readJson(listResponse);
  if (!listResponse.ok) throw new Error(`Could not read global commands: ${JSON.stringify(commands)}`);

  // There can only be one Primary Entry Point. Update it in place when it exists.
  const entryPoint = Array.isArray(commands) ? commands.find(command => command.type === 4) : null;
  // Also remove an old global CHAT_INPUT /casino if one was ever created.
  const staleGlobals = Array.isArray(commands) ? commands.filter(command => command.type === 1 && command.name === 'casino') : [];
  for (const command of staleGlobals) {
    const del = await fetch(`${baseUrl}/${command.id}`, { method: 'DELETE', headers });
    if (!del.ok && del.status !== 204) console.warn('Could not delete stale global /casino command.');
  }

  const payload = {
    name: 'casino',
    description: 'Launch Spin Empire',
    type: 4,
    handler: 2,
    integration_types: [0, 1],
    contexts: [0, 1, 2]
  };
  const response = await fetch(entryPoint ? `${baseUrl}/${entryPoint.id}` : baseUrl, {
    method: entryPoint ? 'PATCH' : 'POST', headers, body: JSON.stringify(payload)
  });
  const result = await readJson(response);
  if (!response.ok) throw new Error(`Discord rejected Activity entry point: ${JSON.stringify(result)}`);
  console.log(`Registered Activity entry point /${result.name || 'casino'} (${result.id || 'unknown id'}).`);
}

export async function startAdminBot(token, grantCoins, rainService) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.on('interactionCreate', interaction => {
    handleAdmin(interaction, grantCoins).catch(() => console.error('Admin interaction response failed. Check bot connectivity.'));
    if (rainService) handleRain(interaction, rainService).catch(() => console.error('Rain interaction response failed.'));
  });
  client.on('error', error => console.error('Discord connection error:', error?.message || error));

  client.login(token).then(async () => {
    console.log('Admin bot connected.');
    // Remove the old normal slash command first. A normal slash command expects an
    // interaction reply and is what causes Discord's "application did not respond" message.
    await removeStaleGuildCasino(client);
    await registerCasinoEntryPoint(client, token).catch(error => {
      console.error('Could not register global /casino Activity entry point:', error?.message || error);
    });
    if (client.user.username !== 'Spin Empire') {
      try { await client.user.setUsername('Spin Empire'); }
      catch { console.warn('Could not rename the bot to Spin Empire. Set its username in the Discord Developer Portal.'); }
    }
  }).catch(error => console.error('Discord bot login failed:', error?.message || error));

  return client;
}
