import { randomInt, randomUUID } from 'node:crypto';

export const ITEMS = [
  { key: 'coal', name: 'Coal Shard', icon: '◈', value: 250, color: '#9faec1' },
  { key: 'iron', name: 'Iron Ingot', icon: '▰', value: 750, color: '#c5d9df' },
  { key: 'gold', name: 'Gold Ingot', icon: '▰', value: 1500, color: '#ffd46e' },
  { key: 'emerald', name: 'Emerald', icon: '◆', value: 5000, color: '#62eab9' },
  { key: 'diamond', name: 'Diamond', icon: '♦', value: 15000, color: '#73dbff' },
  { key: 'crown', name: 'Royal Crown', icon: '♛', value: 50000, color: '#caa0ff' },
  { key: 'star', name: 'Nether Star', icon: '✦', value: 200000, color: '#ff8bbd' }
];
export const GAMES = [
  { id: 'poker', name: 'Poker', icon: '♠', tag: 'FIVE-CARD DRAW', rules: 'Video poker: deal five cards, hold any cards, then draw once. Gross payouts: royal flush 250×, straight flush 50×, four of a kind 25×, full house 9×, flush 6×, straight 4×, three of a kind 3×, two pair 2×, jacks-or-better pair 1×. Other hands lose. Not multiplayer Texas Hold’em.' },
  { id: 'chicken', name: 'Chicken Road', icon: '🐔', tag: 'STEP OR CASH OUT', rules: 'Each step has an independent 80% safe chance. After n safe steps, the gross multiplier is 0.97 / 0.8^n. Cash out after any safe step. A collision loses the stake. 15 steps maximum, then automatic cash-out.' },
  { id: 'craps', name: 'Craps', icon: '⚄', tag: 'PASS LINE', rules: 'Pass-line only. Come-out 7 or 11 wins 2× gross; 2, 3 or 12 loses. Otherwise that total becomes the point. Keep rolling: the point wins 2×, 7 loses, other totals continue. No odds or side bets.' },
  { id: 'crates', name: 'Crates', icon: '▣', tag: 'VIRTUAL LOOT', rules: 'Each crate costs 1,000 coins and gives one virtual item: Coal 60% (250), Iron 25% (750), Gold 10% (1,500), Emerald 4% (5,000), Diamond 1% (15,000). Items can be sold for displayed virtual-coin value or risked in the upgrader. No real items or cash value.' },
  { id: 'coinflip', name: 'Coinflip', icon: '◉', tag: 'PICK A SIDE', rules: 'Choose heads or tails. Each has a 50% chance. A correct pick returns 2× your stake including the original bet.' },
  { id: 'upgrader', name: 'Item Upgrader', icon: '⇧', tag: 'RISK & REWARD', rules: 'Select an owned item and a higher-value target. Success chance = 0.95 × source value / target value. The source is consumed on every attempt; success awards the target, failure awards nothing. No additional coin bet. Original implementation; reference page was unavailable.' },
  { id: 'crash', name: 'Crash', icon: '↗', tag: 'LIVE CASH OUT', rules: 'Solo round, not a shared multiplayer flight. Multiplier grows as exp(seconds / 10). Cash out before the hidden crash point. Survival probability at multiplier x is about 0.97 / x; 3% instant-crash chance. Maximum 100× auto cash-out if reached. Server time decides, so network latency matters. Reloading does not reset the flight.' },
  { id: 'hilo', name: 'Hi-Lo', icon: '↕', tag: 'READ THE NEXT CARD', rules: 'Ace is low, King high. Pick strictly higher or lower than the current rank. Ranks are independent uniform draws from 1–13. Ties lose. Winning picks multiply the running return by 0.97 / probability of that pick. Impossible picks are disabled. Cash out after any win; 10 wins or a capped 1,000,000× multiplier auto cash-out.' },
  { id: 'plinko', name: 'Plinko', icon: '⠿', tag: '12 ROWS', rules: '12 independent left/right bounces, each 50%. Gross payouts from left to right: 10, 4, 2, 1.5, 1, 0.5, 0.25, 0.5, 1, 1.5, 2, 4, 10×. The animation shows the server-selected path.' },
  { id: 'mines', name: 'Mines', icon: '✹', tag: 'FIND THE GEMS', rules: '25 tiles. Choose 1–24 mines before starting. Pick safe tiles then cash out. Gross multiplier after k safe picks is 0.97 divided by the probability of surviving k picks without replacement. A mine loses the bet; all safe tiles found auto cash-out. No first-click guarantee.' },
  { id: 'blackjack', name: 'Blackjack', icon: '♣', tag: 'HIT · STAND · DOUBLE', rules: 'Single fresh 52-card deck per hand. Dealer stands on all 17s. Natural blackjack pays 3:2 profit (2.5× gross), wins pay 2×, ties return stake. Double on the first two cards draws one card and stands. No split, insurance or surrender.' },
  { id: 'roulette', name: 'Roulette', icon: '◎', tag: 'EUROPEAN · SINGLE ZERO', rules: 'Single-zero wheel (0–36). Red/black win 2× gross; green (zero) wins 36×. Each number is equally likely. Zero loses red/black bets.' }
];
export const PLINKO = [10,4,2,1.5,1,0.5,0.25,0.5,1,1.5,2,4,10];
const ids = new Set(GAMES.map(g => g.id));
const rngDefault = n => randomInt(n);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const rand = rng => rng(1000000) / 1000000;
const item = key => ITEMS.find(x => x.key === key);
const card = n => ({ rank: n % 13 + 1, suit: ['♠','♥','♦','♣'][Math.floor(n / 13)] });
function deck(rng) { const d = Array.from({ length: 52 }, (_, i) => i); for (let i = 51; i > 0; i--) { const j = rng(i + 1); [d[i],d[j]] = [d[j],d[i]]; } return d; }
export function handTotal(cards) { let n = 0, aces = 0; for (const c of cards) { const r = c % 13 + 1; n += r === 1 ? 11 : Math.min(r,10); if (r === 1) aces++; } while (n > 21 && aces--) n -= 10; return n; }
export function pokerScore(cards) {
  const ranks = cards.map(c => c % 13 + 1).map(r => r === 1 ? 14 : r).sort((a,b) => a-b);
  const counts = new Map(); for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const groups = [...counts.values()].sort((a,b) => b-a);
  const flush = cards.every(c => Math.floor(c/13) === Math.floor(cards[0]/13));
  const straight = counts.size === 5 && (ranks[4] - ranks[0] === 4 || ranks.join(',') === '2,3,4,5,14');
  if (flush && straight) return ranks[0] === 10 ? ['Royal flush',250] : ['Straight flush',50];
  if (groups[0] === 4) return ['Four of a kind',25];
  if (groups[0] === 3 && groups[1] === 2) return ['Full house',9];
  if (flush) return ['Flush',6];
  if (straight) return ['Straight',4];
  if (groups[0] === 3) return ['Three of a kind',3];
  if (groups[0] === 2 && groups[1] === 2) return ['Two pair',2];
  if ([...counts].some(([r,c]) => c === 2 && r >= 11)) return ['Jacks or better',1];
  return ['No paying hand',0];
}
function debit(user, bet) {
  assert(Number.isSafeInteger(bet) && bet >= 100 && bet <= 1000000, 'Bet must be a whole number from 100 to 1,000,000.');
  assert(user.balance >= bet, 'Not enough coins.'); user.balance -= bet; user.wagered = (user.wagered || 0) + bet;
}
function credit(user, amount) { assert(Number.isSafeInteger(amount) && amount >= 0 && Number.isSafeInteger(user.balance + amount), 'Balance limit exceeded.'); user.balance += amount; }
function finish(user, multiplier, message) {
  const r = user.round; const payout = Math.floor(r.bet * multiplier);
  credit(user,payout); Object.assign(r, { status: 'done', multiplier, payout, message });
  if (payout > r.bet) user.wins = (user.wins || 0) + 1;
}
function award(user, key) { const instance = { id: randomUUID(), key }; user.inventory ||= []; assert(user.inventory.length < 500, 'Inventory full. Sell an item first.'); user.inventory.push(instance); return instance; }
function crashX(round, now) { return Math.min(100, Math.exp(Math.max(0, now - round.startedAt) / 10000)); }
export function updateCrash(user, now = Date.now()) {
  const r = user.round;
  if (r?.game !== 'crash' || r.status !== 'active') return false;
  if (r.crashPoint > 100 && crashX(r,now) >= 100) { finish(user,100,'Maximum 100× reached — auto cashed out.'); return true; }
  if (now >= r.crashAt) { finish(user,0, `Crashed at ${r.crashPoint.toFixed(2)}×`); return true; }
  return false;
}
function blackjackStand(user) {
  const r = user.round;
  while (handTotal(r.dealer) < 17) r.dealer.push(r.deck.pop());
  const p = handTotal(r.hand), d = handTotal(r.dealer);
  finish(user, d > 21 || p > d ? 2 : p === d ? 1 : 0, `You ${p} · dealer ${d}${d > 21 ? ' (bust)' : ''}`);
}
function rollCraps(user,rng) {
  const r = user.round; r.dice = [rng(6)+1,rng(6)+1]; const sum = r.dice[0]+r.dice[1];
  if (!r.point) { if ([7,11].includes(sum)) finish(user,2,'Come-out win!'); else if ([2,3,12].includes(sum)) finish(user,0,'Craps — pass line loses.'); else { r.point = sum; r.message = `Point is ${sum}. Roll it again before a 7.`; } }
  else if (sum === r.point) finish(user,2,'Point hit!'); else if (sum === 7) finish(user,0,'Seven out.'); else r.message = `Rolled ${sum}. Point remains ${r.point}.`;
}

export function perform(user, game, body, now = Date.now(), rng = rngDefault) {
  assert(ids.has(game), 'Unknown game.');
  assert(body && typeof body === 'object', 'Missing action.');
  const action = body.action;
  if (action === 'start') {
    assert(user.round?.status !== 'active', 'Finish your current round first.');
    if (game === 'upgrader') {
      const source = (user.inventory || []).find(x => x.id === body.source);
      const target = item(body.target); assert(source && target, 'Choose an owned item and a target.');
      const from = item(source.key); assert(target.value > from.value, 'Target must be worth more than the source.');
      const chance = 0.95 * from.value / target.value, success = rand(rng) < chance;
      user.inventory = user.inventory.filter(x => x.id !== source.id);
      if (success) award(user,target.key);
      user.round = { id: randomUUID(), version: 1, game, status: 'done', bet: 0, payout: 0, chance, success, from: from.key, target: target.key, message: success ? `Upgrade won: ${target.name}` : `${from.name} was consumed. Upgrade failed.` };
      return;
    }
    if (game === 'coinflip') assert(['heads','tails'].includes(body.choice),'Choose heads or tails.');
    if (game === 'roulette') assert(['red','black','green'].includes(body.choice),'Choose a color.');
    if (game === 'mines') assert(Number.isInteger(body.mines) && body.mines >= 1 && body.mines <= 24,'Choose 1–24 mines.');
    if (game === 'crates') assert((user.inventory || []).length < 500,'Inventory full. Sell an item first.');
    const bet = game === 'crates' ? 1000 : body.bet; debit(user,bet);
    const r = user.round = { id: randomUUID(), version: 1, game, bet, status: 'active', startedAt: now, multiplier: 1, message: '' };
    if (game === 'coinflip') { r.result = rng(2) ? 'heads' : 'tails'; finish(user,body.choice === r.result ? 2 : 0,`Landed on ${r.result}.`); }
    if (game === 'roulette') { r.number = rng(37); r.color = r.number === 0 ? 'green' : [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(r.number) ? 'red' : 'black'; finish(user,body.choice === r.color ? (r.color === 'green' ? 36 : 2) : 0,`${r.number} · ${r.color}`); }
    if (game === 'plinko') { r.path = Array.from({ length: 12 },() => rng(2)); r.bin = r.path.reduce((a,b) => a+b,0); finish(user,PLINKO[r.bin], `Landed in pocket ${r.bin + 1} · ${PLINKO[r.bin]}×`); }
    if (game === 'crates') { const n = rng(100), key = n < 60 ? 'coal' : n < 85 ? 'iron' : n < 95 ? 'gold' : n < 99 ? 'emerald' : 'diamond'; award(user,key); r.item = key; finish(user,0,`Unboxed ${item(key).name} — added to inventory.`); }
    if (game === 'poker' || game === 'blackjack') { r.deck = deck(rng); r.hand = Array.from({ length: game === 'poker' ? 5 : 2 },() => r.deck.pop()); }
    if (game === 'blackjack') { r.dealer = [r.deck.pop(),r.deck.pop()]; const p = handTotal(r.hand), d = handTotal(r.dealer); if (p === 21 || d === 21) finish(user,p === d ? 1 : p === 21 ? 2.5 : 0,p === d ? 'Both have blackjack — push.' : p === 21 ? 'Blackjack!' : 'Dealer blackjack.'); }
    if (game === 'craps') rollCraps(user,rng);
    if (game === 'chicken') r.steps = 0;
    if (game === 'hilo') { r.rank = rng(13)+1; r.steps = 0; }
    if (game === 'mines') { r.mines = body.mines; r.picked = []; r.bombs = []; const pool = Array.from({ length: 25 },(_,i) => i); for (let i = 0; i < r.mines; i++) r.bombs.push(pool.splice(rng(pool.length),1)[0]); }
    if (game === 'crash') { r.crashPoint = Math.max(1,0.97 / Math.max(0.000001,1-rand(rng))); r.crashAt = now + Math.log(r.crashPoint)*10000; updateCrash(user,now); }
    return;
  }
  const r = user.round;
  assert(r?.game === game && r.status === 'active','No active round for this game.');
  assert(body.roundId === r.id && body.version === r.version,'Round changed. Refresh and try again.');
  if (game === 'crash' && updateCrash(user,now)) return;
  r.version++;
  if (action === 'cashout') {
    assert(['chicken','hilo','mines','crash'].includes(game),'Cash-out is unavailable.');
    assert(game === 'crash' || (r.steps || r.picked?.length) > 0,'Make at least one successful move first.');
    finish(user,game === 'crash' ? crashX(r,now) : r.multiplier,'Cashed out.'); return;
  }
  if (game === 'poker' && action === 'draw') {
    assert(Array.isArray(body.hold) && body.hold.length <= 5 && new Set(body.hold).size === body.hold.length && body.hold.every(i => Number.isInteger(i) && i >= 0 && i < 5),'Invalid held cards.');
    r.hand = r.hand.map((c,i) => body.hold.includes(i) ? c : r.deck.pop());
    const [label,multiple] = pokerScore(r.hand); finish(user,multiple,label); return;
  }
  if (game === 'blackjack' && ['hit','stand','double'].includes(action)) {
    if (action === 'stand') { blackjackStand(user); return; }
    if (action === 'double') { assert(r.hand.length === 2,'Double is available on two cards only.'); debit(user,r.bet); r.bet *= 2; }
    r.hand.push(r.deck.pop());
    if (handTotal(r.hand) > 21) finish(user,0,'You busted.'); else if (action === 'double' || handTotal(r.hand) === 21) blackjackStand(user);
    return;
  }
  if (game === 'craps' && action === 'roll') { rollCraps(user,rng); return; }
  if (game === 'chicken' && action === 'step') {
    if (rng(100) >= 80) finish(user,0,'Collision! The round is over.');
    else { r.steps++; r.multiplier = 0.97 / 0.8 ** r.steps; r.message = `Safe crossing ${r.steps}!`; if (r.steps === 15) finish(user,r.multiplier,'Road completed — auto cashed out.'); }
    return;
  }
  if (game === 'hilo' && ['higher','lower'].includes(action)) {
    const favorable = action === 'higher' ? 13-r.rank : r.rank-1; assert(favorable > 0,'That direction cannot win.');
    const previous = r.rank; r.rank = rng(13)+1;
    if (!(action === 'higher' ? r.rank > previous : r.rank < previous)) finish(user,0,r.rank === previous ? 'Tie — round lost.' : 'Wrong direction.');
    else { r.steps++; r.multiplier = Math.min(1000000,r.multiplier * 0.97 / (favorable/13)); r.message = 'Correct! Keep going or cash out.'; if (r.steps === 10 || r.multiplier === 1000000) finish(user,r.multiplier,'Round limit reached — auto cashed out.'); }
    return;
  }
  if (game === 'mines' && action === 'pick') {
    assert(Number.isInteger(body.tile) && body.tile >= 0 && body.tile < 25 && !r.picked.includes(body.tile),'Choose an unopened tile.');
    r.picked.push(body.tile);
    if (r.bombs.includes(body.tile)) finish(user,0,'Mine hit.');
    else { let chance = 1; for (let i = 0; i < r.picked.length; i++) chance *= (25-r.mines-i)/(25-i); r.multiplier = 0.97/chance; r.message = 'Gem found!'; if (r.picked.length === 25-r.mines) finish(user,r.multiplier,'All gems found — auto cashed out.'); }
    return;
  }
  throw new Error('Invalid action for this game.');
}

export function visibleRound(user, now = Date.now()) {
  const r = user.round; if (!r) return null;
  // Explicit allowlist prevents leaking deck order, mine locations or future crash time.
  const out = {};
  for (const k of ['id','version','game','status','bet','payout','multiplier','message','steps','rank','point','dice','mines','picked','result','number','color','path','bin','item','chance','success','from','target']) if (r[k] !== undefined) out[k] = r[k];
  if (r.hand) { out.hand = r.hand.map(card); if (r.game === 'blackjack') out.total = handTotal(r.hand); }
  if (r.dealer) { out.dealer = r.status === 'done' ? r.dealer.map(card) : [card(r.dealer[0]),null]; if (r.status === 'done') out.dealerTotal = handTotal(r.dealer); }
  if (r.game === 'mines' && r.status === 'done') out.bombs = r.bombs;
  if (r.game === 'crash') { out.currentX = r.status === 'active' ? crashX(r,now) : r.multiplier; if (r.status === 'done') out.crashPoint = r.crashPoint; }
  return out;
}
export function gameState(user, now = Date.now()) {
  return { balance: user.balance, round: visibleRound(user,now), inventory: (user.inventory || []).map(x => ({ ...x, ...item(x.key) })) };
}
export function sellItem(user, instanceId) {
  const owned = (user.inventory || []).find(x => x.id === instanceId); assert(owned,'Item is not in your inventory.');
  credit(user,item(owned.key).value); user.inventory = user.inventory.filter(x => x.id !== instanceId);
}

// Copy before mutating so validation failures never debit funds or alter a round.
export function gameTransaction(db, userId, requestId, game, body, now = Date.now(), rng = rngDefault) {
  assert(typeof requestId === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(requestId),'Missing request ID.');
  assert(db.users[userId],'Unknown player.');
  const user = structuredClone(db.users[userId]);
  user.gameRequests ||= [];
  if (user.gameRequests.includes(requestId)) return gameState(user,now);
  const expired = updateCrash(user,now);
  if (game === 'inventory') sellItem(user,body.itemId);
  else if (!(expired && game === 'crash' && body.action !== 'start')) perform(user,game,body,now,rng);
  user.gameRequests.push(requestId); user.gameRequests = user.gameRequests.slice(-500);
  db.users[userId] = user;
  return gameState(user,now);
}
