import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAdmin, hasOwnerRole, validateGrant, adminCommand } from '../admin.js';

test('role name must be exact and assigned to caller', () => {
  assert.equal(hasOwnerRole(['1'], [{ id: '1', name: 'owner' }]), true);
  assert.equal(hasOwnerRole(['1'], [{ id: '1', name: 'Owner' }]), false);
  assert.equal(hasOwnerRole(['2'], [{ id: '1', name: 'owner' }]), false);
});
test('amount validation rejects fractions, negative, zero, excessive and overflow', () => {
  for (const value of [0, -1, 1.1, NaN, Infinity, 1000000001, '100']) assert.throws(() => validateGrant(100, value));
  assert.throws(() => validateGrant(Number.MAX_SAFE_INTEGER, 1));
  assert.doesNotThrow(() => validateGrant(100, 10000));
});
function mock({ owner = true, guild = true, fail = false, bot = false } = {}) {
  const replies = [];
  return {
    replies, id: 'interaction1', guildId: 'guild1', user: { id: 'caller' },
    commandName: 'admin', isChatInputCommand: () => true, inGuild: () => guild,
    deferReply: async () => {}, editReply: async reply => replies.push(reply.content),
    options: { getSubcommand: () => 'give', getUser: () => ({ id: 'target', bot }), getInteger: () => 10000 },
    guild: guild ? {
      roles: { fetch: async () => new Map([['r', { id: 'r', name: 'owner' }]]) },
      members: { fetch: async () => {
        if (fail) throw new Error('Member fetch failed');
        return { roles: { cache: new Map(owner ? [['r', {}]] : []) } };
      } }
    } : null
  };
}
test('authorized owner invokes grant exactly once', async () => {
  const interaction = mock(); let calls = 0;
  await handleAdmin(interaction, (target, amount) => { calls++; assert.equal(target.id, 'target'); assert.equal(amount, 10000); return 110000; });
  assert.equal(calls, 1); assert.match(interaction.replies[0], /110,000/);
});
test('unauthorized, DM, bot target and failed role lookup never grant', async () => {
  for (const options of [{ owner: false }, { guild: false }, { bot: true }, { fail: true }]) {
    let calls = 0; const interaction = mock(options);
    await handleAdmin(interaction, () => { calls++; });
    assert.equal(calls, 0); assert.equal(interaction.replies.length, 1);
  }
});
test('command is guild-installed and server-only', () => {
  assert.deepEqual(adminCommand.contexts, [0]);
  assert.deepEqual(adminCommand.integration_types, [0]);
  assert.equal(adminCommand.options[0].name, 'give');
});
