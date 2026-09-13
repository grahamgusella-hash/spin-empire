import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { startAdminBot, validateGrant } from './admin.js';
import { createRain, claimRain, settleRains } from './rain.js';
import { GAMES, ITEMS, PLINKO, gameState, gameTransaction, updateCrash } from './games.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const STARTING_BALANCE = Number(process.env.STARTING_BALANCE || 100000);
const dataDir = process.env.CASINO_DATA_DIR || path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'casino.json');
const sessions = new Map();
let discordClient = null;

fs.mkdirSync(dataDir, { recursive: true });
let db = loadDb();

function loadDb() {
  try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return { users: {}, lottery: { pot: 3000000, entrants: {}, drawAt: Date.now() + 3 * 86400000 } }; }
}

function saveDb() {
  const temp = `${dataFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db, null, 2));
  fs.renameSync(temp, dataFile);
}

function rainTransaction(operation) {
  const previous = db;
  db = structuredClone(db);
  try { const result = operation(db); saveDb(); return result; }
  catch (error) { db = previous; throw error; }
}

const rainService = {
  create: options => rainTransaction(draft => { settleRains(draft); return createRain(draft, options); }),
  claim: (guildId, profile) => rainTransaction(draft => claimRain(draft, guildId, profile, STARTING_BALANCE))
};

let rainTickBusy = false;
async function rainTick(client) {
  if (rainTickBusy) return;
  rainTickBusy = true;
  try {
    if (Object.values(db.rains || {}).some(r => r.status === 'open' && r.endsAt <= Date.now())) {
      rainTransaction(draft => settleRains(draft));
    }
    for (const rain of Object.values(db.rains || {}).filter(r => r.status === 'paid' && !r.announced)) {
      try {
        const channel = await client.channels.fetch(rain.channelId);
        if (!channel?.isTextBased() || typeof channel.send !== 'function') continue;
        await channel.send({ content: `🌧️ Rain ended: ${Object.keys(rain.claimants).length} claimants received ${rain.share.toLocaleString()} coins each. ${rain.remainder.toLocaleString()} leftover coins carry into the next rain.`, allowedMentions: { parse: [] } });
        rainTransaction(draft => { draft.rains[rain.id].announced = true; });
      } catch { console.error('Rain paid, but end announcement failed; will retry.'); }
    }
  } catch { console.error('Rain settlement failed; will retry. Check persistence and balance limits.'); }
  finally { rainTickBusy = false; }
}

function ensureUser(profile) {
  if (!db.users[profile.id]) db.users[profile.id] = { id: profile.id, username: profile.username, avatar: profile.avatar, balance: STARTING_BALANCE, wins: 0, wagered: 0 };
  db.users[profile.id].username = profile.username;
  db.users[profile.id].avatar = profile.avatar;
  saveDb();
  return db.users[profile.id];
}

function cleanUser(user) {
  return { id: user.id, username: user.username, avatar: user.avatar, balance: user.balance, wins: user.wins, wagered: user.wagered };
}

function auth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const id = sessions.get(token);
  if (!id || !db.users[id]) return res.status(401).json({ error: 'Sign in through Discord first.' });
  req.user = db.users[id];
  next();
}

function takeBet(user, rawBet) {
  const bet = Math.floor(Number(rawBet));
  if (!Number.isSafeInteger(bet) || bet < 100) throw new Error('Minimum bet is 100 coins.');
  if (bet > 1000000) throw new Error('Maximum bet is 1,000,000 coins.');
  if (bet > user.balance) throw new Error('You do not have enough coins.');
  user.balance -= bet;
  user.wagered += bet;
  return bet;
}

function settle(user, payout) {
  user.balance += payout;
  if (payout > 0) user.wins += 1;
  saveDb();
}

app.use(express.json({ limit: '32kb' }));
app.get('/api/config', (req,res) => res.json({ clientId: process.env.DISCORD_CLIENT_ID || '', demo: process.env.LOCAL_DEMO === 'true' && process.env.NODE_ENV !== 'production' }));
// Opt-in loopback-only preview. Never accepted via a reverse proxy or in production.
app.post('/api/demo', (req,res) => {
  if (process.env.LOCAL_DEMO !== 'true' || process.env.NODE_ENV === 'production' || req.headers['x-forwarded-for'] || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) return res.sendStatus(403);
  const user = ensureUser({ id: 'local-preview', username: 'Local preview', avatar: null });
  const session = crypto.randomBytes(32).toString('hex'); sessions.set(session,user.id);
  res.json({ session });
});
app.get('/api/games', auth, (req,res) => {
  const now = Date.now();
  if (req.user.round?.game === 'crash' && req.user.round.status === 'active') rainTransaction(draft => updateCrash(draft.users[req.user.id],now));
  res.json({ ...gameState(db.users[req.user.id],now), games: GAMES, items: ITEMS, plinko: PLINKO });
});
app.post('/api/game/:game', auth, (req,res) => {
  try {
    const result = rainTransaction(draft => gameTransaction(draft,req.user.id,req.body.requestId,req.params.game,req.body));
    res.json(result);
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.post('/api/token', async (req, res) => {
  try {
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: req.body.code
      })
    });
    const oauth = await response.json();
    if (!response.ok) return res.status(401).json({ error: 'Discord authorization failed.' });
    const meResponse = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${oauth.access_token}` } });
    const profile = await meResponse.json();
    if (!meResponse.ok) return res.status(401).json({ error: 'Could not read Discord profile.' });
    const user = ensureUser(profile);
    const session = crypto.randomBytes(32).toString('hex');
    sessions.set(session, user.id);
    setTimeout(() => sessions.delete(session), 12 * 60 * 60 * 1000).unref();
    res.json({ session, accessToken: oauth.access_token, user: cleanUser(user) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/state', auth, (req, res) => {
  res.json({ user: cleanUser(req.user), lottery: { pot: db.lottery.pot, entrants: Object.keys(db.lottery.entrants).length, tickets: db.lottery.entrants[req.user.id] || 0, drawAt: db.lottery.drawAt } });
});

app.post('/api/lottery', auth, (req, res) => {
  try {
    const amount = takeBet(req.user, req.body.amount);
    db.lottery.pot += amount;
    db.lottery.entrants[req.user.id] = (db.lottery.entrants[req.user.id] || 0) + amount;
    saveDb();
    res.json({ message: `Bought ${amount.toLocaleString()} tickets.`, user: cleanUser(req.user), lottery: db.lottery });
  } catch (error) { res.status(400).json({ error: error.message }); }
});



async function getWithdrawChannel() {
  if (!discordClient) throw new Error('Discord bot is not connected.');
  for (const guild of discordClient.guilds.cache.values()) {
    let channels;
    try { channels = await guild.channels.fetch(); }
    catch { continue; }
    const channel = [...channels.values()].find(ch => ch?.name === 'withdraws' && ch.isTextBased() && typeof ch.send === 'function');
    if (channel) return channel;
  }
  throw new Error('Could not find a text channel named exactly "withdraws".');
}

app.post('/api/withdraw', auth, async (req, res) => {
  const amount = Math.floor(Number(req.body.amount));
  const requestId = String(req.body.requestId || '');
  if (!Number.isSafeInteger(amount) || amount < 1) return res.status(400).json({ error: 'Enter a valid whole-number withdrawal amount.' });
  if (!requestId || requestId.length > 100) return res.status(400).json({ error: 'Invalid withdrawal request.' });

  db.withdrawals ||= {};
  const existing = db.withdrawals[requestId];
  if (existing) {
    if (existing.userId !== req.user.id) return res.status(409).json({ error: 'That withdrawal request ID is already in use.' });
    return res.json({ message: 'Withdrawal request already submitted.', user: cleanUser(req.user), withdrawal: existing });
  }
  if (amount > req.user.balance) return res.status(400).json({ error: 'You do not have enough coins.' });

  try {
    const channel = await getWithdrawChannel();
    const record = {
      id: requestId,
      userId: req.user.id,
      username: req.user.username,
      amount,
      channelId: channel.id,
      at: new Date().toISOString()
    };

    // Reserve the virtual coins before announcing the request. Roll back if Discord rejects the message.
    req.user.balance -= amount;
    db.withdrawals[requestId] = record;
    try {
      await channel.send({
        content: `💸 **Withdrawal** — ${req.user.username} withdrew **${amount.toLocaleString()} coins**.`,
        allowedMentions: { parse: [] }
      });
      saveDb();
    } catch (error) {
      req.user.balance += amount;
      delete db.withdrawals[requestId];
      throw error;
    }

    res.json({ message: `Withdrawal request for ${amount.toLocaleString()} coins submitted.`, user: cleanUser(req.user), withdrawal: record });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not submit the withdrawal request.' });
  }
});

app.post('/api/play/:game', auth, (req, res) => {
  res.status(410).json({ error: 'This game endpoint was replaced. Reload the Activity.' });
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  if (process.env.DISCORD_BOT_TOKEN) {
    const client = await startAdminBot(process.env.DISCORD_BOT_TOKEN, (profile, amount, interaction) => {
      const current = db.users[profile.id];
      validateGrant(current?.balance ?? STARTING_BALANCE, amount);
      // A synchronous update and atomic file replacement share the Activity's database.
      const before = structuredClone(db);
      try {
        const user = current || { id: profile.id, username: profile.username, avatar: profile.avatar, balance: STARTING_BALANCE, wins: 0, wagered: 0 };
        db.adminGrants ||= {};
        if (db.adminGrants[interaction.id]) return user.balance;
        user.balance += amount;
        db.users[profile.id] = user;
        db.adminGrants[interaction.id] = { guild: interaction.guildId, actor: interaction.user.id, recipient: profile.id, amount, at: new Date().toISOString() };
        saveDb();
        return user.balance;
      } catch (error) { db = before; throw error; }
    }, rainService);
    discordClient = client;
    await rainTick(client);
    setInterval(() => rainTick(client), 5000).unref();
  } else console.warn('DISCORD_BOT_TOKEN is missing: /admin give is disabled.');
  app.listen(PORT, process.env.LOCAL_DEMO === 'true' ? '127.0.0.1' : '0.0.0.0', () => console.log(`Spin Empire running on http://localhost:${PORT}`));
}

export { takeBet };
