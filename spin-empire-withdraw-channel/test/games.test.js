import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { GAMES, ITEMS, PLINKO, gameTransaction, visibleRound, pokerScore, handTotal, updateCrash } from '../games.js';
const fresh = () => ({ users: { u: { id:'u', balance:100000, wagered:0, wins:0 } } });
const low = () => 0;
const queue = values => n => { const v = values.shift() ?? 0; assert.ok(v >= 0 && v < n); return v; };
function play(db,game,body,now = 0,rng = low,request = randomUUID()) { return gameTransaction(db,'u',request,game,body,now,rng); }
function next(db,action,extra = {},rng = low,now = 1000) { const r = db.users.u.round; return play(db,r.game,{action,roundId:r.id,version:r.version,...extra},now,rng); }
function start(db,game,extra = {},rng = low) { return play(db,game,{action:'start',bet:1000,...extra},0,rng); }
test('exact requested twelve games are present', () => assert.deepEqual(GAMES.map(g => g.id),['poker','chicken','craps','crates','coinflip','upgrader','crash','hilo','plinko','mines','blackjack','roulette']));
test('invalid games, malformed bets and choices never mutate balances', () => {
  for (const [game,body] of [['nope',{action:'start',bet:1000}],...[-1,0,1,1.5,NaN,Infinity,1000001,'1000'].map(bet => ['coinflip',{action:'start',choice:'heads',bet}]),['roulette',{action:'start',bet:1000,choice:'purple'}],['coinflip',{action:'start',bet:1000,choice:'both'}],['mines',{action:'start',bet:1000,mines:25}]]) {
    const db = fresh(), before = JSON.stringify(db); assert.throws(() => play(db,game,body)); assert.equal(JSON.stringify(db),before);
  }
});
test('coinflip wins, loses, and retries do not debit twice', () => {
  const db = fresh(), request = randomUUID(), body = {action:'start',bet:1000,choice:'heads'};
  assert.equal(play(db,'coinflip',body,0,() => 1,request).balance,101000);
  assert.equal(play(db,'coinflip',body,0,low,request).balance,101000);
  assert.equal(start(db,'coinflip',{choice:'heads'}).balance,100000);
});
test('roulette zero pays 36x and red loses on zero', () => {
  const db = fresh(); assert.equal(start(db,'roulette',{choice:'green'}).balance,135000);
  assert.equal(start(db,'roulette',{choice:'red'}).balance,134000);
  assert.equal(start(db,'roulette',{choice:'red'},() => 1).balance,135000);
});
test('plinko uses exactly twelve bounces and advertised paytable', () => {
  const db = fresh(), out = start(db,'plinko'); assert.equal(out.round.path.length,12); assert.equal(out.round.bin,0); assert.equal(out.round.payout,1000*PLINKO[0]);
  assert.equal(start(db,'plinko',{},queue([0,1,0,1,0,1,0,1,0,1,0,1])).round.payout,250);
});
test('crate items persist; selling consumes once and credits value', () => {
  const db = fresh(), out = start(db,'crates',{bet:0}); assert.equal(out.balance,99000); assert.equal(out.inventory[0].key,'coal');
  const id = out.inventory[0].id;
  assert.equal(play(db,'inventory',{itemId:id}).balance,99250);
  assert.throws(() => play(db,'inventory',{itemId:id})); assert.equal(db.users.u.balance,99250);
});
test('every crate rarity maps to its published probability band', () => {
  for (const [roll,key] of [[0,'coal'],[59,'coal'],[60,'iron'],[84,'iron'],[85,'gold'],[94,'gold'],[95,'emerald'],[98,'emerald'],[99,'diamond']]) assert.equal(start(fresh(),'crates',{},() => roll).round.item,key);
});
test('upgrader validates ownership and consumes source on win or loss', () => {
  const db = fresh(); let out = start(db,'crates'); const source = out.inventory[0].id;
  const before = JSON.stringify(db); assert.throws(() => start(db,'upgrader',{source:'not-owned',target:'diamond'})); assert.equal(JSON.stringify(db),before);
  assert.throws(() => start(db,'upgrader',{source,target:'coal'}));
  out = start(db,'upgrader',{source,target:'diamond'}); assert.equal(out.balance,99000); assert.equal(out.inventory[0].key,'diamond'); assert.equal(out.round.chance,0.95*250/15000);
  out = start(db,'upgrader',{source:out.inventory[0].id,target:'star'},n => n-1); assert.equal(out.inventory.length,0); assert.equal(out.round.success,false);
});
test('mines do not expose hidden positions and pay correct cashout', () => {
  const db = fresh(); const out = start(db,'mines',{mines:3}); assert.equal(out.round.bombs,undefined);
  const first = next(db,'pick',{tile:3}); assert.equal(first.round.multiplier,0.97/(22/25));
  const before = JSON.stringify(db); assert.throws(() => next(db,'pick',{tile:3})); assert.equal(JSON.stringify(db),before);
  const paid = next(db,'cashout'); assert.equal(paid.round.payout,Math.floor(1000*0.97/(22/25)));
  start(db,'mines',{mines:3}); assert.equal(next(db,'pick',{tile:0}).round.payout,0);
});
test('mines all-safe auto cashout and minimum safe move requirement', () => {
  const db = fresh(); start(db,'mines',{mines:24}); assert.throws(() => next(db,'cashout'));
  assert.equal(next(db,'pick',{tile:24}).round.payout,24250);
});
test('active rounds block new bets, survive reload and reject stale actions', () => {
  let db = fresh(); start(db,'chicken'); assert.throws(() => start(db,'crates'));
  const old = {...db.users.u.round}; db = JSON.parse(JSON.stringify(db)); next(db,'step');
  assert.throws(() => play(db,'chicken',{action:'step',roundId:old.id,version:old.version}));
  assert.equal(next(db,'cashout').round.payout,1212);
});
test('chicken failure loses stake and fifteen successful steps finish', () => {
  const db = fresh(); start(db,'chicken'); assert.equal(next(db,'step',{},() => 99).round.payout,0);
  start(db,'chicken'); for (let i=0;i<15;i++) next(db,'step'); assert.equal(db.users.u.round.status,'done');
});
test('hilo impossible direction, tie loss and winning multiplier', () => {
  const db = fresh(); start(db,'hilo'); assert.throws(() => next(db,'lower'));
  assert.equal(next(db,'higher').round.payout,0);
  start(db,'hilo'); const out = next(db,'higher',{},() => 12); assert.equal(out.round.rank,13); assert.equal(out.round.multiplier,0.97/(12/13));
  assert.throws(() => next(db,'higher')); assert.ok(next(db,'cashout').round.payout > 1000);
});
test('craps comeout wins/losses and point resolution', () => {
  const db = fresh(); assert.equal(start(db,'craps',{},queue([2,3])).round.payout,2000);
  assert.equal(start(db,'craps').round.payout,0);
  assert.equal(start(db,'craps',{},queue([1,1])).round.point,4);
  assert.equal(next(db,'roll',{},queue([1,2])).round.status,'active');
  assert.equal(next(db,'roll',{},queue([1,1])).round.payout,2000);
  start(db,'craps',{},queue([1,1])); assert.equal(next(db,'roll',{},queue([2,3])).round.payout,0);
});
test('poker scoring includes wheel, royal, pairs and full house', () => {
  assert.deepEqual(pokerScore([9,10,11,12,0]),['Royal flush',250]);
  assert.deepEqual(pokerScore([0,1,2,3,4]),['Straight flush',50]);
  assert.equal(pokerScore([10,23,2,18,32])[1],1);
  assert.equal(pokerScore([1,14,27,2,15])[1],9);
  assert.equal(pokerScore([1,14,27,40,15])[1],25);
});
test('poker held cards are preserved and draw ends the round', () => {
  const db = fresh(); start(db,'poker'); const first = db.users.u.round.hand[0];
  const out = next(db,'draw',{hold:[0]}); assert.equal(db.users.u.round.hand[0],first); assert.equal(out.round.status,'done');
  assert.equal(new Set(db.users.u.round.hand).size,5); assert.equal(out.round.deck,undefined);
  assert.throws(() => next(db,'draw',{hold:[]}));
});
test('blackjack ace scoring, hidden dealer, double, bust and push', () => {
  assert.equal(handTotal([0,13,8]),21); assert.equal(handTotal([0,13,26,9]),13);
  const db = fresh(); start(db,'blackjack',{},n => n-1); assert.equal(visibleRound(db.users.u).dealer[1],null); assert.equal(visibleRound(db.users.u).deck,undefined);
  Object.assign(db.users.u.round,{hand:[4,5],dealer:[9,6],deck:[9]});
  assert.equal(next(db,'double').round.payout,4000); assert.equal(db.users.u.balance,102000);
  start(db,'blackjack',{},n => n-1); Object.assign(db.users.u.round,{hand:[9,8],dealer:[9,6],deck:[9]}); assert.equal(next(db,'hit').round.payout,0);
  start(db,'blackjack',{},n => n-1); Object.assign(db.users.u.round,{hand:[9,9],dealer:[9,9]}); assert.equal(next(db,'stand').round.payout,1000);
});
test('crash secret stays hidden; cashout wins before deadline and loses after', () => {
  const db = fresh(); const out = start(db,'crash',{},() => 900000); assert.equal(out.round.crashAt,undefined); assert.equal(out.round.crashPoint,undefined);
  assert.equal(next(db,'cashout',{},low,1000).round.payout,Math.floor(1000*Math.exp(.1)));
  start(db,'crash',{},() => 500000); assert.equal(next(db,'cashout',{},low,100000).round.payout,0);
  assert.equal(start(db,'crash').round.status,'done');
});
test('offline crash auto cashout at 100x is not lost at a later crash', () => {
  const db = fresh(); start(db,'crash',{},() => 999999);
  assert.equal(updateCrash(db.users.u,200000),true); assert.equal(db.users.u.round.payout,100000);
  assert.equal(updateCrash(db.users.u,300000),false);
});
test('rounds and inventory retain no client-controlled values', () => {
  const db = fresh(); const out = start(db,'coinflip',{choice:'tails',payout:999999999,balance:999999999});
  assert.equal(out.balance,101000); assert.equal(out.round.payout,2000); assert.equal(ITEMS.length,7);
});
