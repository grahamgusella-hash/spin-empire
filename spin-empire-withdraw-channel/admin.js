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

const activityLaunches = new Map();

export function consumeActivityLaunch(instanceId, guildId = '') {
  const now = Date.now();
  const key = String(instanceId || '');
  const guildKey = String(guildId || '');

  const exact = activityLaunches.get(key);
  if (exact) {
    activityLaunches.delete(key);
    if (exact.expiresAt > now) return exact;
  }

  let fallbackKey = '';
  let fallback = null;
  for (const [storedKey, launch] of activityLaunches.entries()) {
    if (launch.expiresAt <= now) {
      activityLaunches.delete(storedKey);
      continue;
    }
    if (guildKey && launch.guildId === guildKey && (!fallback || launch.createdAt > fallback.createdAt)) {
      fallbackKey = storedKey;
      fallback = launch;
    }
  }
  if (fallback) {
    activityLaunches.delete(fallbackKey);
    console.log(`Used recent /casino launch fallback for guild ${guildKey}; SDK instance ${key}, callback instance ${fallbackKey}.`);
    return fallback;
  }
  return null;
}

function rememberActivityLaunch(instanceId, interaction) {
  const key = String(instanceId || '');
  const launch = {
    user: {
      id: interaction.user.id,
      username: interaction.user.username,
      avatar: interaction.user.avatar,
      bot: interaction.user.bot
    },
    guildId: interaction.guildId || '',
    channelId: interaction.channelId || '',
    createdAt: Date.now(),
    expiresAt: Date.now() + 2 * 60 * 1000
  };

  // Keep a guild-scoped pending launch even if Discord's launch callback does not expose
  // the same instance ID as the Embedded App SDK. The server will prefer an exact ID match
  // and otherwise consume only the newest unexpired launch from the same guild.
  const storeKey = key || `guild:${launch.guildId}:${interaction.id}`;
  activityLaunches.set(storeKey, launch);
  setTimeout(() => {
    if (activityLaunches.get(storeKey) === launch) activityLaunches.delete(storeKey);
  }, 2 * 60 * 1000).unref();
  return storeKey;
}

export const casinoCommand = {
  name: 'casino',
  description: 'Launch Spin Empire',
  type: 1
};

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

export async function handleCasino(interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'casino') return;
  try {
    const response = await interaction.launchActivity({ withResponse: true });
    const instanceId =
      response?.resource?.activityInstance?.id ||
      response?.resource?.activityInstance?.instanceId ||
      response?.interaction?.activityInstanceId ||
      response?.interaction?.activity_instance_id ||
      response?.activityInstanceId ||
      '';

    const storedKey = rememberActivityLaunch(instanceId, interaction);
    if (!instanceId) {
      console.warn(`Spin Empire launched without a callback Activity instance ID; stored guild fallback ${storedKey}.`);
    } else {
      console.log(`Bound Activity launch ${storedKey} to Discord user ${interaction.user.id}.`);
    }
  } catch (error) {
    console.error('Could not launch Spin Empire from /casino:', error?.message || error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Spin Empire could not launch from /casino. Try again in a moment.',
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
    }
  }
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
      await interaction.followUp({ content: `🌧️ Rain started: ${rain.amount.toLocaleString()} virtual coins. Use /claim before <t:${Math.floor(rain.endsAt / 1000)}:T> (<t:${Math.floor(rain.endsAt / 1000)}:R>). Everyone who claims gets an equal share when time ends.`, allowedMentions: { parse: [] } });
    } else {
      await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
      const rain = rainService.claim(interaction.guildId, interaction.user);
      await interaction.editReply({ content: `You're in! Your equal share will be credited when the rain ends <t:${Math.floor(rain.endsAt / 1000)}:R>. Claimants so far: ${Object.keys(rain.claimants).length}.` });
    }
  } catch (error) {
    await interaction.editReply({ content: error.message || 'Rain command failed.', allowedMentions: { parse: [] } });
  }
}

async function registerGuildCasino(client) {
  const guildId = String(process.env.DISCORD_GUILD_ID || '').trim();
  if (!guildId) {
    console.warn('DISCORD_GUILD_ID is missing: /casino cannot be registered.');
    return;
  }
  try {
    const guild = await client.guilds.fetch(guildId);
    const commands = await guild.commands.fetch();
    const existing = [...commands.values()].find(command => command.name === 'casino' && command.type === 1);
    if (existing) {
      await guild.commands.edit(existing.id, casinoCommand);
      console.log('Updated guild /casino Activity launcher.');
    } else {
      await guild.commands.create(casinoCommand);
      console.log('Registered guild /casino Activity launcher.');
    }
  } catch (error) {
    console.error('Could not register /casino:', error?.message || error);
  }
}

export async function startAdminBot(token, grantCoins, rainService) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.on('interactionCreate', interaction => {
    handleCasino(interaction).catch(error => console.error('Casino launch interaction failed:', error?.message || error));
    handleAdmin(interaction, grantCoins).catch(() => console.error('Admin interaction response failed. Check bot connectivity.'));
    if (rainService) handleRain(interaction, rainService).catch(() => console.error('Rain interaction response failed.'));
  });
  client.on('error', error => console.error('Discord connection error:', error?.message || error));

  client.login(token).then(async () => {
    console.log('Admin bot connected.');
    await registerGuildCasino(client);
    if (client.user.username !== 'Spin Empire') {
      try { await client.user.setUsername('Spin Empire'); }
      catch { console.warn('Could not rename the bot to Spin Empire. Set its username in the Discord Developer Portal.'); }
    }
  }).catch(error => console.error('Discord bot login failed:', error?.message || error));

  return client;
}
