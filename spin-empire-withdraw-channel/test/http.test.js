import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { once } from 'node:events';

test('HTTP auth, gameplay, duplicates, rejected bets and persisted round', async () => {
  const dir = await mkdtemp(path.join(tmpdir(),'spin-empire-http-test-'));
  const probe = net.createServer(); probe.listen(0,'127.0.0.1'); await once(probe,'listening'); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,LOCAL_DEMO:'true',NODE_ENV:'test',DISCORD_BOT_TOKEN:'',CASINO_DATA_DIR:dir,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  const base = `http://127.0.0.1:${port}`;
  try {
    await new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timeout')),10000);
      child.stdout.on('data',chunk => { if (chunk.toString().includes('Spin Empire running')) { clearTimeout(timer); resolve(); } });
      child.once('exit',code => { clearTimeout(timer); reject(new Error(`Server exited ${code}`)); });
    });
    assert.equal((await fetch(`${base}/api/games`)).status,401);
    assert.equal((await fetch(`${base}/api/demo`,{method:'POST',headers:{'X-Forwarded-For':'1.2.3.4'}})).status,403);
    const {session} = await fetch(`${base}/api/demo`,{method:'POST'}).then(r => r.json());
    const headers = {Authorization:`Bearer ${session}`,'Content-Type':'application/json'};
    const get = () => fetch(`${base}/api/games`,{headers}).then(r => r.json());
    const post = (game,body) => fetch(`${base}/api/game/${game}`,{method:'POST',headers,body:JSON.stringify(body)});
    assert.equal((await get()).games.length,12);
    const request = {action:'start',bet:1000,choice:'heads',requestId:randomUUID()};
    const first = await (await post('coinflip',request)).json();
    assert.equal((await (await post('coinflip',request)).json()).balance,first.balance);
    assert.equal((await post('coinflip',{...request,bet:-500,requestId:randomUUID()})).status,400);
    assert.equal((await get()).balance,first.balance);
    const round = await (await post('mines',{action:'start',bet:1000,mines:3,requestId:randomUUID()})).json();
    assert.equal(round.round.bombs,undefined);
    const persisted = JSON.parse(await readFile(path.join(dir,'casino.json'),'utf8'));
    assert.equal(persisted.users['local-preview'].round.id,round.round.id);
    assert.equal(persisted.users['local-preview'].round.bombs.length,3);
    const bad = await post('mines',{action:'pick',tile:100,roundId:round.round.id,version:1,requestId:randomUUID()});
    assert.equal(bad.status,400); assert.equal((await get()).round.version,1);
    assert.equal((await fetch(`${base}/api/play/slots`,{method:'POST',headers,body:'{}'})).status,410);
  } finally {
    const ended = once(child,'exit'); child.kill('SIGTERM'); await ended;
    await rm(dir,{recursive:true,force:true});
  }
});
