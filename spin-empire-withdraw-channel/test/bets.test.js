import test from 'node:test';
import assert from 'node:assert/strict';
import { takeBet } from '../server.js';

test('takeBet debits valid bets', () => { const user = { balance: 1000, wagered: 0 }; assert.equal(takeBet(user, 250), 250); assert.deepEqual(user, { balance: 750, wagered: 250 }); });
test('takeBet rejects insufficient balance', () => assert.throws(() => takeBet({ balance: 50, wagered: 0 }, 100), /enough/));
test('takeBet rejects malformed amounts', () => assert.throws(() => takeBet({ balance: 1000, wagered: 0 }, 'oops'), /Minimum/));
