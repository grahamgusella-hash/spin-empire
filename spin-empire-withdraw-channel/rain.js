export const rainCommands = [
  { name: 'rain', description: 'Owner only: create a timed virtual-coin rain', type: 1, integration_types: [0], contexts: [0], options: [
    { name: 'amount', description: 'Coins to create (not deducted from your balance)', type: 4, required: true, min_value: 1, max_value: 1000000000 },
    { name: 'duration', description: 'Claim window in seconds (10–86400)', type: 4, required: true, min_value: 10, max_value: 86400 }
  ] },
  { name: 'claim', description: 'Join the active rain in this server (once per rain)', type: 1, integration_types: [0], contexts: [0] }
];

// These operations mutate a transaction draft; the server commits it atomically.
export function createRain(db, { id, guildId, channelId, actorId, amount, duration }, now = Date.now()) {
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000000) throw new Error('Amount must be 1–1,000,000,000 whole coins.');
  if (!Number.isSafeInteger(duration) || duration < 10 || duration > 86400) throw new Error('Duration must be 10–86400 whole seconds.');
  db.rains ||= {};
  if (db.rains[id]) return db.rains[id];
  if (Object.values(db.rains).some(r => r.guildId === guildId && r.status === 'open')) throw new Error('This server already has a rain running. Wait for it to finish.');
  db.rainCarry ||= {};
  const carry = db.rainCarry[guildId] || 0;
  if (!Number.isSafeInteger(amount + carry)) throw new Error('Rain total exceeds the safe coin limit.');
  db.rainCarry[guildId] = 0;
  const rain = { id, guildId, channelId, actorId, amount: amount + carry, createdAmount: amount, carry, endsAt: now + duration * 1000, status: 'open', claimants: {}, announced: false };
  db.rains[id] = rain;
  return rain;
}

export function claimRain(db, guildId, profile, startingBalance, now = Date.now()) {
  const rain = Object.values(db.rains || {}).find(r => r.guildId === guildId && r.status === 'open' && now < r.endsAt);
  if (!rain) throw new Error('There is no open rain to claim in this server.');
  if (profile.bot) throw new Error('Bots cannot claim rain.');
  if (rain.claimants[profile.id]) throw new Error('You already joined this rain.');
  db.users[profile.id] ||= { id: profile.id, username: profile.username, avatar: profile.avatar, balance: startingBalance, wins: 0, wagered: 0 };
  rain.claimants[profile.id] = true;
  return rain;
}

export function settleRains(db, now = Date.now()) {
  const settled = [];
  for (const rain of Object.values(db.rains || {})) {
    if (rain.status !== 'open' || rain.endsAt > now) continue;
    const ids = Object.keys(rain.claimants);
    const share = ids.length ? Math.floor(rain.amount / ids.length) : 0;
    // Validate the entire batch before any credit; no partial payouts.
    for (const id of ids) {
      if (!db.users[id] || !Number.isSafeInteger(db.users[id].balance + share)) throw new Error('Rain payout exceeds a balance limit.');
    }
    for (const id of ids) db.users[id].balance += share;
    const remainder = rain.amount - share * ids.length;
    db.rainCarry ||= {};
    db.rainCarry[rain.guildId] = (db.rainCarry[rain.guildId] || 0) + remainder;
    Object.assign(rain, { status: 'paid', share, remainder, paidAt: now });
    settled.push(rain);
  }
  return settled;
}
