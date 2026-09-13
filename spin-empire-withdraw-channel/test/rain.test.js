import test from 'node:test';
import assert from 'node:assert/strict';
import { createRain, claimRain, settleRains, rainCommands } from '../rain.js';
import { handleRain } from '../admin.js';

const options = { id: 'r1', guildId: 'g1', channelId: 'c1', actorId: 'owner', amount: 100, duration: 60 };
const profile = id => ({ id, username: id, bot: false });
test('chosen duration is stored and owner needs no balance', () => {
  const db = { users: {} }; const rain = createRain(db, options, 1000);
  assert.equal(rain.endsAt, 61000); assert.deepEqual(db.users, {});
  assert.throws(() => createRain(db, { ...options, id: 'r2' }, 1000), /already/);
  assert.equal(createRain(db, options, 1000).id, 'r1');
});
test('claims split equally at deadline, pay once, and carry the remainder', () => {
  let db = { users: {} }; createRain(db, options, 0);
  for (const id of ['a','b','c']) claimRain(db, 'g1', profile(id), 0, 1000);
  assert.throws(() => claimRain(db, 'g1', profile('a'), 0, 1001), /already/);
  assert.equal(settleRains(db, 59999).length, 0);
  assert.throws(() => claimRain(db, 'g1', profile('d'), 0, 60000), /no open/);
  db = JSON.parse(JSON.stringify(db)); // Restart before payout.
  assert.equal(settleRains(db, 70000).length, 1);
  assert.deepEqual(Object.values(db.users).map(u => u.balance), [33,33,33]);
  assert.equal(db.rainCarry.g1, 1);
  db = JSON.parse(JSON.stringify(db)); // Restart after payout.
  assert.equal(settleRains(db, 80000).length, 0);
  assert.equal(createRain(db, { ...options, id: 'r2' }, 80000).amount, 101);
});
test('no claims carry the full pot; servers remain isolated', () => {
  const db = { users: {} }; createRain(db, options, 0);
  assert.throws(() => claimRain(db, 'g2', profile('a'), 0, 100), /no open/);
  createRain(db, { ...options, id: 'r2', guildId: 'g2', duration: 120 }, 0);
  settleRains(db, 60000); assert.equal(db.rainCarry.g1, 100);
  assert.equal(db.rains.r2.status, 'open');
});
test('invalid amounts and durations are rejected', () => {
  for (const amount of [-1, 0, 1.5, Infinity, 1000000001]) assert.throws(() => createRain({ users: {} }, { ...options, amount }));
  for (const duration of [0, 9, 10.5, 86401, NaN]) assert.throws(() => createRain({ users: {} }, { ...options, duration }));
});
test('bots cannot join and unsafe batch does not partially pay', () => {
  const db = { users: {} }; createRain(db, options, 0);
  assert.throws(() => claimRain(db, 'g1', { ...profile('bot'), bot: true }, 0, 1), /Bots/);
  claimRain(db, 'g1', profile('a'), 0, 1); claimRain(db, 'g1', profile('b'), 0, 1);
  db.users.b.balance = Number.MAX_SAFE_INTEGER;
  assert.throws(() => settleRains(db, 60000)); assert.equal(db.users.a.balance, 0);
  assert.equal(db.rains.r1.status, 'open');
});
function interaction(commandName, owner = false, guild = true) {
  const replies = [];
  return { id: 'i', guildId: 'g', channelId: 'c', user: profile('caller'), commandName, replies,
    isChatInputCommand: () => true, inGuild: () => guild,
    deferReply: async () => {}, editReply: async x => replies.push(x), followUp: async x => replies.push(x),
    options: { getInteger: name => name === 'amount' ? 100 : 60 },
    guild: guild ? { roles: { fetch: async () => new Map([['r', { id: 'r', name: 'owner' }]]) },
      members: { fetch: async () => ({ roles: { cache: new Map(owner ? [['r', {}]] : []) } }) } } : null
  };
}
test('rain requires owner; claim is open to members; DMs are blocked', async () => {
  let creates = 0, claims = 0;
  const service = { create: () => { creates++; return { amount: 100, endsAt: 60000 }; }, claim: () => { claims++; return { endsAt: 60000, claimants: { caller: true } }; } };
  await handleRain(interaction('rain'), service); assert.equal(creates, 0);
  await handleRain(interaction('rain', true, false), service); assert.equal(creates, 0);
  await handleRain(interaction('rain', true), service); assert.equal(creates, 1);
  await handleRain(interaction('claim'), service); assert.equal(claims, 1);
  await handleRain(interaction('claim', false, false), service); assert.equal(claims, 1);
  assert.deepEqual(rainCommands.map(c => c.contexts), [[0],[0]]);
});
