import './extras.css';

const nativeFetch = window.fetch.bind(window);
let bearer = '';
let currentState = null;
let overlay = null;

window.fetch = async (input, init = {}) => {
  try {
    const headers = new Headers(init.headers || {});
    const auth = headers.get('Authorization');
    if (auth?.startsWith('Bearer ')) bearer = auth;
  } catch {}
  return nativeFetch(input, init);
};

const fmt = n => Number(n || 0).toLocaleString();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

async function gameApi(game, body) {
  if (!bearer) throw new Error('Discord session is still connecting. Try again in a moment.');
  const response = await nativeFetch(`/api/game/${game}`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', Authorization: bearer },
    body: JSON.stringify({ ...body, requestId: crypto.randomUUID() })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  currentState = data;
  return data;
}

function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'spin-extra-overlay';
  overlay.innerHTML = `<div class="extra-backdrop"></div><section class="extra-window"><button class="extra-close" aria-label="Close">×</button><div id="extra-content"></div></section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.extra-backdrop').onclick = closeOverlay;
  overlay.querySelector('.extra-close').onclick = closeOverlay;
  return overlay;
}

function openOverlay(html) {
  const el = ensureOverlay();
  el.querySelector('#extra-content').innerHTML = html;
  el.classList.add('open');
}
function closeOverlay() { if (overlay) overlay.classList.remove('open'); }
function message(text,bad=false) {
  const el = overlay?.querySelector('.extra-message');
  if (!el) return;
  el.textContent = text;
  el.className = `extra-message ${bad?'bad':'good'}`;
}

const crates = {
  starter:{name:'Starter Crate',icon:'▣',price:1000000,desc:'Entry crate with a chance at Diamond.'},
  miner:{name:'Miner Crate',icon:'⛏',price:10000000,desc:'Better odds for Gold, Emerald and Diamond.'},
  royal:{name:'Royal Crate',icon:'♛',price:50000000,desc:'Premium crate with Crown and Nether Star chances.'},
  mythic:{name:'Mythic Crate',icon:'✦',price:75000000,desc:'High-tier crate with the strongest rare-item odds.'}
};

function showCrates() {
  openOverlay(`<div class="extra-title"><span>▣</span><div><p>VIRTUAL LOOT</p><h2>Choose a crate</h2></div></div><div class="crate-picker">${Object.entries(crates).map(([id,c])=>`<button class="crate-option" data-crate="${id}"><span>${c.icon}</span><h3>${c.name}</h3><strong>${fmt(c.price)} coins</strong><p>${c.desc}</p><em>OPEN CRATE</em></button>`).join('')}</div><div class="extra-message"></div><p class="extra-note">Virtual items and virtual coins only. No cash value.</p>`);
  overlay.querySelectorAll('[data-crate]').forEach(button => button.onclick = async () => {
    const id = button.dataset.crate;
    overlay.querySelectorAll('[data-crate]').forEach(x=>x.disabled=true);
    message('Opening crate…');
    try {
      const state = await gameApi('crates',{action:'start',crateType:id});
      const round = state.round;
      const found = [...state.inventory].reverse().find(x=>x.key===round.item);
      message(`${crates[id].name} opened: ${found?.name || round.item} worth ${fmt(found?.value)} virtual coins.`);
      button.classList.add('opened');
    } catch (e) { message(e.message,true); }
    finally { overlay.querySelectorAll('[data-crate]').forEach(x=>x.disabled=false); }
  });
}

const tickets = {
  bronze:{name:'Bronze Scratch',price:1000000,className:'bronze'},
  silver:{name:'Silver Scratch',price:10000000,className:'silver'},
  gold:{name:'Gold Scratch',price:50000000,className:'gold'},
  diamond:{name:'Diamond Scratch',price:75000000,className:'diamond'}
};

function ticketChooser() {
  openOverlay(`<div class="extra-title"><span>🎟</span><div><p>SCRATCH & REVEAL</p><h2>Choose a scratch ticket</h2></div></div><div class="ticket-picker">${Object.entries(tickets).map(([id,t])=>`<button class="ticket-option ${t.className}" data-ticket="${id}"><small>SPIN EMPIRE</small><h3>${t.name}</h3><strong>${fmt(t.price)} coins</strong><p>Scratch all 9 spots. Three matching prize symbols win.</p><em>BUY TICKET</em></button>`).join('')}</div><div class="extra-message"></div><p class="extra-note">Virtual entertainment only. Ticket prizes are virtual coins with no cash value.</p>`);
  overlay.querySelectorAll('[data-ticket]').forEach(button=>button.onclick=async()=>{
    overlay.querySelectorAll('[data-ticket]').forEach(x=>x.disabled=true);
    message('Printing ticket…');
    try {
      await gameApi('scratch',{action:'start',ticketType:button.dataset.ticket});
      renderScratch();
    } catch(e){ message(e.message,true); overlay.querySelectorAll('[data-ticket]').forEach(x=>x.disabled=false); }
  });
}

async function revealScratch(index, roundId, version, canvas) {
  if (canvas?.dataset.revealing === '1') return;
  if (canvas) canvas.dataset.revealing = '1';
  try {
    await gameApi('scratch',{action:'reveal',index,roundId,version});
    renderScratch();
  } catch(e) {
    message(e.message,true);
    if (canvas) canvas.dataset.revealing = '';
  }
}

function prepareScratchCanvases(r) {
  overlay.querySelectorAll('canvas[data-scratch-canvas]').forEach(canvas => {
    const host = canvas.closest('.scratch-spot');
    const index = Number(canvas.dataset.scratchCanvas);
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rect = host.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    const gradient = ctx.createLinearGradient(0,0,rect.width,rect.height);
    gradient.addColorStop(0,'#d8dde2');
    gradient.addColorStop(.5,'#8f989f');
    gradient.addColorStop(1,'#c9d0d5');
    ctx.fillStyle = gradient;
    ctx.fillRect(0,0,rect.width,rect.height);
    ctx.fillStyle = '#3d4850';
    ctx.font = `900 ${Math.max(11, Math.min(16, rect.width/8))}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SCRATCH',rect.width/2,rect.height/2);

    const cells = new Set();
    let drawing = false;
    const scratchAt = event => {
      const b = canvas.getBoundingClientRect();
      const x = event.clientX - b.left;
      const y = event.clientY - b.top;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x,y,18,0,Math.PI*2);
      ctx.fill();
      ctx.restore();
      const gx = Math.max(0,Math.min(9,Math.floor(x/b.width*10)));
      const gy = Math.max(0,Math.min(5,Math.floor(y/b.height*6)));
      cells.add(`${gx}:${gy}`);
      if (cells.size >= 24) {
        drawing = false;
        canvas.releasePointerCapture?.(event.pointerId);
        revealScratch(index,r.id,r.version,canvas);
      }
    };
    canvas.addEventListener('pointerdown', event => {
      if (canvas.dataset.revealing === '1') return;
      drawing = true;
      canvas.setPointerCapture?.(event.pointerId);
      scratchAt(event);
    });
    canvas.addEventListener('pointermove', event => { if (drawing && canvas.dataset.revealing !== '1') scratchAt(event); });
    canvas.addEventListener('pointerup', () => { drawing = false; });
    canvas.addEventListener('pointercancel', () => { drawing = false; });
  });

  overlay.querySelectorAll('[data-reveal-fallback]').forEach(button => {
    button.onclick = () => revealScratch(Number(button.dataset.revealFallback),r.id,r.version,null);
  });
}

function renderScratch() {
  const r = currentState?.round;
  if (!r || r.game !== 'scratch') return ticketChooser();
  const ticket = tickets[r.ticketType] || tickets.bronze;
  const symbols = r.scratchSymbols || Array(9).fill(null);
  openOverlay(`<div class="scratch-ticket ${ticket.className}"><div class="scratch-head"><div><small>SPIN EMPIRE</small><h2>${ticket.name}</h2></div><strong>${fmt(r.bet)} COINS</strong></div><p class="scratch-instructions">Drag your mouse or finger across each silver panel to scratch it off. Match 3 prize symbols to win.</p><div class="scratch-grid">${symbols.map((symbol,i)=>symbol ? `<div class="scratch-spot revealed"><span>${esc(symbol)}</span></div>` : `<div class="scratch-spot scratchable"><span class="scratch-underlay">?</span><canvas data-scratch-canvas="${i}" aria-label="Scratch spot ${i+1}"></canvas><button class="scratch-reveal-fallback" data-reveal-fallback="${i}" aria-label="Reveal scratch spot ${i+1}">Reveal</button></div>`).join('')}</div><div class="scratch-status"><b>${esc(r.message || '')}</b>${r.status==='done'?`<strong class="${r.payout>0?'win':'loss'}">Payout: ${fmt(r.payout)} coins</strong>`:`<span>${r.revealed?.length||0}/9 revealed</span>`}</div></div><div class="extra-message"></div><div class="scratch-actions">${r.status==='done'?'<button id="new-ticket">Buy another ticket</button>':''}</div>`);
  if (r.status !== 'done') prepareScratchCanvases(r);
  const again=overlay.querySelector('#new-ticket'); if(again) again.onclick=ticketChooser;
}

async function resumeScratch() {
  if (!bearer) return ticketChooser();
  try {
    const res = await nativeFetch('/api/games',{headers:{Authorization:bearer}});
    if(res.ok) currentState=await res.json();
  } catch {}
  if(currentState?.round?.game==='scratch'&&currentState.round.status==='active') renderScratch(); else ticketChooser();
}

document.addEventListener('click', event => {
  const crateCard = event.target.closest('[data-open="crates"]');
  const scratchCard = event.target.closest('[data-open="scratch"]');
  const resume = event.target.closest('#resume');
  if (crateCard) { event.preventDefault(); event.stopImmediatePropagation(); showCrates(); return; }
  if (scratchCard) { event.preventDefault(); event.stopImmediatePropagation(); resumeScratch(); return; }
  if (resume && /Scratch Tickets/i.test(resume.textContent || '')) { event.preventDefault(); event.stopImmediatePropagation(); resumeScratch(); }
}, true);

const observer = new MutationObserver(() => {
  document.querySelectorAll('.lobby-banner .pill').forEach(el => {
    if (/GAMES · ONE WALLET/.test(el.textContent || '')) el.textContent = '13 GAMES · ONE WALLET';
  });
});
observer.observe(document.documentElement,{subtree:true,childList:true});
