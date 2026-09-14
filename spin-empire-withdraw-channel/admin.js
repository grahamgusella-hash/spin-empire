import { Client, GatewayIntentBits, MessageFlags } from 'discord.js';
import { CRATE_TYPES, SCRATCH_TYPES } from './games.js';

// Spin Empire high-tier virtual pricing. Keeping this in the shared server module
// makes the server authoritative even if a browser tries to submit a cheaper price.
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

export async function startAdminBot(token, grantCoins, rainService) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.on('interactionCreate', interaction => {
    handleAdmin(interaction, grantCoins).catch(() => console.error('Admin interaction response failed. Check bot connectivity.'));
    if (rainService) handleRain(interaction, rainService).catch(() => console.error('Rain interaction response failed.'));
  });
  client.on('error', () => console.error('Discord connection error.'));
  await client.login(token);
  if (client.user.username !== 'Spin Empire') {
    try { await client.user.setUsername('Spin Empire'); }
    catch { console.warn('Could not rename the bot to Spin Empire. Set its username in the Discord Developer Portal.'); }
  }
  console.log('Admin bot connected.');
  return client;
}
