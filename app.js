'use strict';
/* Decode Me If You Can: The Vault — static client. All locked content in DATA is AES-GCM encrypted. */
const D = window.DATA;
const NOFX = /nofx/.test(location.search); if (NOFX) document.documentElement.classList.add('nofx');
const $app = document.getElementById('app');
const enc = new TextEncoder(), dcd = new TextDecoder();
const SALT = Uint8Array.from(atob(D.salt), (c) => c.charCodeAt(0));
const norm = (c) => (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// a rebuilt data.js is a new game: forget every team session, entered code, note and admin state
try {
  if (localStorage.getItem('dmc_build') !== D.salt) {
    Object.keys(localStorage).filter((k) => /^dmc_(team|codes_|notes_|admin|names|hints_)/.test(k)).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem('dmc_build', D.salt);
  }
} catch {}
// teams can be renamed from the admin console: the override lives in localStorage and is also sent live
const BASE_HOLDER_IDS = {};
for (const p in D.holders) { const t = D.teams.find((x) => x.name === D.holders[p]); if (t) BASE_HOLDER_IDS[p] = t.id; }
function applyNames(map) {
  map = map || {};
  for (const t of D.teams) if (map[t.id] && String(map[t.id]).trim()) t.name = String(map[t.id]).trim().slice(0, 24);
  for (const p in BASE_HOLDER_IDS) D.holders[p] = D.teams.find((t) => t.id === BASE_HOLDER_IDS[p]).name;
}
applyNames(ls.get('dmc_names', {}));

/* ---------- crypto ---------- */
const keyCache = new Map();
async function keyFor(code) {
  code = norm(code);
  if (!keyCache.has(code)) {
    const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
    keyCache.set(code, crypto.subtle.deriveKey({ name: 'PBKDF2', salt: SALT, iterations: 100000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']));
  }
  return keyCache.get(code);
}
async function open(blob, key) {
  try {
    const u = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, key, u.slice(12));
    return JSON.parse(dcd.decode(pt));
  } catch { return null; }
}
async function sha256hex(s) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- live channel (ntfy.sh, signed) ---------- */
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (x) => Uint8Array.from(atob(x), (c) => c.charCodeAt(0));
const ECDSA = { name: 'ECDSA', hash: 'SHA-256' };
let pubKeyP = null;
const pubKey = () => (pubKeyP = pubKeyP || crypto.subtle.importKey('jwk', D.pub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']));
async function liveVerify(raw) {
  try {
    const m = JSON.parse(raw);
    if (!(await crypto.subtle.verify(ECDSA, await pubKey(), unb64(m.s), enc.encode(m.b)))) return null;
    return JSON.parse(m.b);
  } catch { return null; }
}
async function livePublish(priv, obj) {
  const body = JSON.stringify({ ...obj, ts: Date.now() });
  const s = b64(new Uint8Array(await crypto.subtle.sign(ECDSA, priv, enc.encode(body))));
  const r = await fetch('https://ntfy.sh/' + D.topic, { method: 'POST', body: JSON.stringify({ b: body, s }) });
  return r.ok;
}
function liveSubscribe(onMsg, onState, opt) {
  opt = opt || {};
  let es = null, stopped = false, q = Promise.resolve();
  const seen = new Set();
  const connect = () => {
    es = new EventSource(`https://ntfy.sh/${D.topic}${opt.suffix || ''}/sse?since=all`);
    es.onopen = () => onState(true);
    es.onerror = () => { onState(false); if (es.readyState === 2 && !stopped) setTimeout(connect, 3000); };
    es.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.event !== 'message' || seen.has(m.id)) return;
      seen.add(m.id);
      q = q.then(async () => { const body = opt.raw ? (() => { try { return JSON.parse(m.message); } catch { return null; } })() : await liveVerify(m.message); if (body) await onMsg(body); }).catch(() => {});
    };
  };
  connect();
  return () => { stopped = true; if (es) es.close(); };
}

const uid = () => Math.random().toString(36).slice(2, 10);
async function liveSubmit(obj) { // teams -> admin: unsigned, the admin console decides
  const r = await fetch('https://ntfy.sh/' + D.topic + '-s', { method: 'POST', body: JSON.stringify(obj) });
  return r.ok;
}

/* ---------- shared helpers ---------- */
const hintCost = (pts) => Math.round(pts * 0.25 / 5) * 5;
const stagePts = (pts, hints) => Math.max(25, pts - hints * hintCost(pts));
const fmt = (ms) => { ms = Math.max(0, ms); const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const timerClass = (ms) => (ms > 12 * 60000 ? 'red' : ms > 8 * 60000 ? 'am' : 'dim');
function copyText(t, btn) {
  const done = () => { if (btn) { const o = btn.textContent; btn.textContent = 'COPIED'; setTimeout(() => (btn.textContent = o), 1200); } };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, () => fallback());
  else fallback();
  function fallback() { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); done(); }
}
const nav = (p) => { location.hash = '#' + p; };
const chrome = (right) => `<div class="bar"><span class="mono grn logo">&gt;_</span><b class="glitch" data-t="DECODE ME IF YOU CAN">DECODE ME IF YOU CAN</b><span class="tick mono dim">VAULT SEALED</span><span class="sp"></span>${right || ''}</div>`;
function termBox(fn, lines, raw) {
  return `<div class="term"><div class="th"><i style="background:#F07178"></i><i style="background:#F5B841"></i><i style="background:#A3E635"></i><span class="fn">${esc(fn)}</span><button class="copy" data-copy>COPY</button></div>
  <div class="cmd"><span class="p">$</span> cat ${esc(fn.split('/').pop())}</div>
  <div class="tb">${lines.map((l) => `<div class="ln${l.c ? ' c' : ''}"><span>${esc(l.t)}</span></div>`).join('')}</div>
  <div class="cmd"><span class="p">$</span> <span class="cur"></span></div></div>`;
}
function wireCopy(root, raw) { root.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => copyText(raw, b))); }
function flash(text, kind, sub) {
  const f = document.createElement('div'); f.className = 'flash' + (kind ? ' ' + kind : ''); f.innerHTML = `<div>${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
  document.body.appendChild(f); setTimeout(() => f.remove(), kind === 'deny' ? 1900 : 1400);
}
setInterval(() => {
  document.querySelectorAll('[data-since]').forEach((e) => {
    const ms = Date.now() - +e.dataset.since; e.textContent = fmt(ms); e.className = timerClass(ms);
  });
}, 1000);


/* ---------- motion helpers ---------- */
const GLYPHS = '01ABCDEF▓▒░<>/\\#$%&*';
function scramble(el, final, ms) {
  if (reduced) { el.textContent = final; return; }
  ms = ms || Math.min(1500, 450 + final.length * 5);
  const t0 = performance.now();
  let done = false;
  const finish = () => { done = true; el.textContent = final; };
  (function f() {
    if (done) return;
    const p = Math.min(1, (performance.now() - t0) / ms), n = Math.floor(p * final.length);
    if (p >= 1) return finish();
    let o = final.slice(0, n);
    for (let i = n; i < final.length; i++) o += /\s/.test(final[i]) ? final[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    el.textContent = o;
    requestAnimationFrame(f);
  })();
  setTimeout(finish, ms + 150);
}
addEventListener('pointermove', (e) => {
  document.documentElement.style.setProperty('--mx', e.clientX + 'px');
  document.documentElement.style.setProperty('--my', e.clientY + 'px');
});
const TICKS = ['TRACING 192.0.2.44 …', 'NULLPHANTOM LAST SEEN 23:41', 'FRAGMENTS RECOVERED: ?/5', 'INTEGRITY CHECK … OK', 'LISTENING ON :443', 'CASE FILE #0412 OPEN', 'VAULT SEALED'];
let tickI = 0;
setInterval(() => {
  const hm = new Date().toTimeString().slice(0, 5);
  document.querySelectorAll('[data-clock]').forEach((e) => (e.textContent = hm));
}, 5000);
setInterval(() => {
  const m = TICKS[++tickI % TICKS.length];
  document.querySelectorAll('.tick').forEach((e) => scramble(e, m, 500));
}, 3000);
const FEED = ['GET /admin/notes?data=… 200', 'badge 0412 cloned', 'POST /admin/create_user 201', 'stash@{0} pushed', 'DROP TABLE sessions; (blocked)', 'door 7 opened 23:41:02', 'mail drafts/unsent_0412.eml saved', 'cam04 offline 3m12s', 'git commit 9f2c1a amended', 'backup.tar.gz read 4.2MB', 'login failed phantom_admin x3', 'cron: rotate /var/log/nginx'];
const feedLine = () => {
  const d = new Date(), t = d.toTimeString().slice(0, 8), ip = '192.0.2.' + (((Math.random() * 90) | 0) + 10);
  return `${t}  ${ip.padEnd(11)}  ${FEED[(Math.random() * FEED.length) | 0]}`;
};


/* ---------- detective-board backdrop ---------- */
const HOUSE = `<svg viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1a24"/><stop offset="1" stop-color="#2a1f1a"/></linearGradient></defs><rect width="120" height="90" fill="url(#sk)"/><circle cx="96" cy="16" r="6" fill="#d8d2b8" opacity=".8"/><path d="M10 90V52l14-14 14 14v38zM44 90V40l8-10 8 10V30h8v18l16 6v36z" fill="#07090b"/><rect x="20" y="60" width="6" height="8" fill="#F5B841" opacity=".85"/><rect x="50" y="52" width="5" height="7" fill="#F5B841" opacity=".7"/><rect x="72" y="66" width="6" height="8" fill="#F5B841" opacity=".6"/></svg>`;
const MAP = `<svg viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice"><rect width="120" height="90" fill="#1c2a30"/><g stroke="#56D4DD" stroke-opacity=".35" fill="none"><path d="M0 20h120M0 45h120M0 70h120M25 0v90M60 0v90M95 0v90"/><path d="M10 80 40 50l25 10 40-35" stroke="#F5B841" stroke-opacity=".6"/></g><g fill="#F07178"><circle cx="40" cy="50" r="3"/><circle cx="105" cy="25" r="3"/></g></svg>`;
const HOODED = `<svg viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice"><defs><radialGradient id="mg" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#2f6b3a"/><stop offset="1" stop-color="#05080a"/></radialGradient></defs><rect width="120" height="90" fill="url(#mg)"/><path d="M60 22c-14 0-22 10-22 22 0 6 2 10 4 13-12 4-22 12-24 33h84c-2-21-12-29-24-33 2-3 4-7 4-13 0-12-8-22-22-22z" fill="#050607"/><ellipse cx="60" cy="46" rx="11" ry="13" fill="#000"/><circle cx="55" cy="45" r="1.6" fill="#A3E635"/><circle cx="65" cy="45" r="1.6" fill="#A3E635"/></svg>`;
const HALL = `<svg viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice"><rect width="120" height="90" fill="#0b1114"/><path d="M0 0 48 32v26L0 90zM120 0 72 32v26l48 32z" fill="#141c20"/><path d="M0 0h120L72 32H48z" fill="#10171a"/><path d="M0 90 48 58h24l48 32z" fill="#0d1417"/><rect x="48" y="32" width="24" height="26" fill="#cfe9d8" opacity=".85"/><g fill="#F5B841" opacity=".7"><rect x="20" y="8" width="12" height="3"/><rect x="88" y="8" width="12" height="3"/><rect x="52" y="22" width="16" height="2"/></g></svg>`;
const BADGE = `<svg viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice"><rect width="120" height="90" fill="#1a1613"/><g transform="rotate(-8 60 45)"><rect x="30" y="12" width="60" height="66" rx="4" fill="#e8e2d0"/><rect x="36" y="20" width="22" height="26" fill="#2a2f33"/><circle cx="47" cy="30" r="5" fill="#0d1013"/><rect x="62" y="22" width="22" height="3" fill="#333"/><rect x="62" y="30" width="16" height="3" fill="#555"/><rect x="36" y="54" width="48" height="4" fill="#c33"/><rect x="36" y="64" width="30" height="3" fill="#333"/></g></svg>`;
const TOWER = `<svg viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice"><rect width="120" height="90" fill="#16222c"/><rect x="30" y="14" width="60" height="76" fill="#0a0e11"/><g fill="#F5B841" opacity=".8"><rect x="38" y="22" width="6" height="6"/><rect x="52" y="22" width="6" height="6"/><rect x="66" y="40" width="6" height="6"/><rect x="38" y="52" width="6" height="6"/><rect x="80" y="22" width="6" height="6"/><rect x="52" y="64" width="6" height="6"/></g><g fill="#56D4DD" opacity=".5"><rect x="66" y="22" width="6" height="6"/><rect x="80" y="52" width="6" height="6"/></g></svg>`;
let boardTimer = null;
function buildBoard() {
  const W = innerWidth, H = innerHeight, vw = W / 100;
  const pol = (svg) => `<div class="bd-pol">${svg}</div>`;
  // x,y = centre as % of viewport; w in vw; hr = height/width; z = depth layer 0 back .. 2 front
  const items = [
    { id: 'a', cls: 'bd-photo', x: 7, y: 30, w: 9, hr: 1.2, r: 5, z: 0, html: pol(HOODED) },
    { id: 'b', cls: 'bd-card typed', x: 15, y: 13, w: 14, hr: .62, r: -5, z: 2, html: 'DIFFERENT CLUES.<br>SAME MYSTERY.<br>CAN YOU PUT IT<br>TOGETHER?' },
    { id: 'c', cls: 'bd-photo', x: 31, y: 9, w: 8, hr: 1.2, r: -9, z: 0, html: pol(BADGE) },
    { id: 'd', cls: 'bd-map', x: 62, y: 11, w: 13, hr: .72, r: 4, z: 1, html: '<i></i>' },
    { id: 'e', cls: 'bd-sticky yellow hand', x: 85, y: 14, w: 10, hr: 1, r: 6, z: 2, html: 'who is<br>NullPhantom??' },
    { id: 'f', cls: 'bd-photo', x: 91, y: 40, w: 10, hr: 1.2, r: -6, z: 1, html: pol(HALL) },
    { id: 'g', cls: 'bd-card typed', x: 85, y: 70, w: 16, hr: .7, r: 3, z: 2, html: 'Sometimes the most important messages are the ones never sent.' },
    { id: 'h', cls: 'bd-photo', x: 70, y: 84, w: 9, hr: 1.2, r: -4, z: 0, html: pol(TOWER) },
    { id: 'i', cls: 'bd-log bd-paper', x: 28, y: 84, w: 16, hr: .95, r: -2, z: 1, html: '<b>ACCESS LOG</b><br>23:41:02 192.0.2.44<br>POST /admin/create_user<br>201 CREATED<br>23:41:09 GET /notes?data=<br>TkFJRElT… 200<br>▌' },
    { id: 'j', cls: 'bd-photo', x: 9, y: 76, w: 11, hr: 1.2, r: -7, z: 2, html: pol(HOUSE) },
    { id: 'k', cls: 'bd-sticky pink hand', x: 3.5, y: 52, w: 8, hr: 1, r: -8, z: 1, html: '23:41<br>server room!!' },
    { id: 'l', cls: 'bd-card typed', x: 50, y: 94, w: 13, hr: .5, r: -1.5, z: 2, html: 'FIVE TEAMS.<br>ONE MYSTERY.' },
  ];
  const pins = {};
  const els = items.map((it) => {
    const w = it.w * vw, h = w * it.hr, px = it.x / 100 * W, py = it.y / 100 * H;
    pins[it.id] = [px, py - h / 2 + 8];
    return `<div class="it ${it.cls} z${it.z}" style="left:${px - w / 2}px;top:${py - h / 2}px;width:${w}px;height:${h}px;font-size:${w * .085}px;--r:${it.r}deg"><span class="tape"></span>${it.html}<span class="pin p${'abc'[it.id.charCodeAt(0) % 3]}"></span></div>`;
  });
  const links = ['a-b', 'b-c', 'c-d', 'd-e', 'e-f', 'f-g', 'g-h', 'h-i', 'i-j', 'j-k', 'k-a', 'b-i', 'd-g', 'c-k', 'e-h'];
  const paths = links.map((l) => {
    const [A, B] = l.split('-').map((k) => pins[k]), mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2 + 24 + Math.hypot(B[0] - A[0], B[1] - A[1]) * 0.07;
    return `M${A[0]} ${A[1]} Q${mx} ${my} ${B[0]} ${B[1]}`;
  });
  const layer = (z) => els.filter((_, i) => items[i].z === z).join('');
  return `<div class="cork" aria-hidden="true"><div class="lamp"></div>
    <div class="layer l0">${layer(0)}</div>
    <svg class="strings" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g fill="none" stroke-linecap="round">${paths.map((d) => `<path d="${d}" stroke="#000" stroke-opacity=".55" stroke-width="3" transform="translate(2 7)" style="filter:blur(2px)"/><path d="${d}" stroke="#a8222a" stroke-width="2"/><path d="${d}" stroke="#ff7a80" stroke-opacity=".35" stroke-width=".7" transform="translate(0 -.6)"/>`).join('')}</g></svg>
    <div class="layer l1">${layer(1)}</div><div class="layer l2">${layer(2)}</div>
    <div class="grain"></div></div>`;
}
function mountBoard() {
  document.querySelectorAll('.cork').forEach((e) => e.remove());
  document.body.insertAdjacentHTML('afterbegin', buildBoard());
}
mountBoard();
addEventListener('resize', () => { clearTimeout(boardTimer); boardTimer = setTimeout(mountBoard, 200); });
addEventListener('pointermove', (e) => {
  const r = document.documentElement.style;
  r.setProperty('--px', (e.clientX / innerWidth - 0.5).toFixed(3));
  r.setProperty('--py', (e.clientY / innerHeight - 0.5).toFixed(3));
});
const SAFE = `<svg class="safe" viewBox="0 0 120 120"><defs><linearGradient id="mt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a4249"/><stop offset="1" stop-color="#14181c"/></linearGradient><radialGradient id="lt" cx=".7" cy=".1" r=".9"><stop offset="0" stop-color="#F5B841" stop-opacity=".35"/><stop offset="1" stop-color="#F5B841" stop-opacity="0"/></radialGradient></defs><rect x="6" y="6" width="108" height="108" rx="6" fill="url(#mt)" stroke="#555e66"/><rect x="16" y="16" width="88" height="88" rx="4" fill="#1b2025" stroke="#2C353F"/><circle cx="82" cy="60" r="16" fill="#101316" stroke="#7a858e" stroke-width="2"/><g stroke="#7a858e" stroke-width="2"><path d="M82 46v28M68 60h28M72 50l20 20M92 50 72 70"/></g><rect x="26" y="40" width="26" height="40" rx="2" fill="#0d1013" stroke="#2C353F"/><g fill="#A3E635" opacity=".8"><rect x="31" y="46" width="16" height="5"/></g><g fill="#56D4DD" opacity=".5"><rect x="31" y="56" width="4" height="4"/><rect x="38" y="56" width="4" height="4"/><rect x="45" y="56" width="4" height="4"/><rect x="31" y="63" width="4" height="4"/><rect x="38" y="63" width="4" height="4"/><rect x="45" y="63" width="4" height="4"/><rect x="31" y="70" width="4" height="4"/><rect x="38" y="70" width="4" height="4"/><rect x="45" y="70" width="4" height="4"/></g><rect x="6" y="6" width="108" height="108" rx="6" fill="url(#lt)"/></svg>`;
const BULB = `<svg class="bulb" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>`;
const SAFE_BIG = `<svg class="safebig" viewBox="0 0 200 180"><defs><linearGradient id="mt2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a535b"/><stop offset="1" stop-color="#161a1e"/></linearGradient><radialGradient id="in2" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#A3E635" stop-opacity=".75"/><stop offset="1" stop-color="#0a0d0f"/></radialGradient></defs>
<rect x="10" y="8" width="180" height="164" rx="8" fill="url(#mt2)" stroke="#6a747d" stroke-width="2"/><rect x="24" y="22" width="152" height="136" rx="4" class="cavity" fill="#050708"/><rect x="24" y="22" width="152" height="136" rx="4" class="glow" fill="url(#in2)"/>
<g class="door"><rect x="24" y="22" width="152" height="136" rx="4" fill="#20262b" stroke="#7a858e" stroke-width="2"/><rect x="34" y="32" width="132" height="116" rx="3" fill="none" stroke="#38424a"/>
<g class="dial"><circle cx="118" cy="90" r="30" fill="#12161a" stroke="#8a959e" stroke-width="3"/><circle cx="118" cy="90" r="22" fill="none" stroke="#4a545c" stroke-dasharray="3 5" stroke-width="5"/><path d="M118 62v56M90 90h56M98 70l40 40M138 70 98 110" stroke="#a7b1b9" stroke-width="3" stroke-linecap="round"/><circle cx="118" cy="90" r="6" fill="#A3E635"/></g>
<rect x="46" y="64" width="34" height="52" rx="3" fill="#0b0e11" stroke="#38424a"/><rect x="52" y="71" width="22" height="7" fill="#A3E635" opacity=".85"/><g fill="#56D4DD" opacity=".55"><rect x="52" y="86" width="5" height="5"/><rect x="61" y="86" width="5" height="5"/><rect x="70" y="86" width="5" height="5"/><rect x="52" y="95" width="5" height="5"/><rect x="61" y="95" width="5" height="5"/><rect x="70" y="95" width="5" height="5"/><rect x="52" y="104" width="5" height="5"/><rect x="61" y="104" width="5" height="5"/><rect x="70" y="104" width="5" height="5"/></g></g></svg>`;
const setView = (v) => { document.body.dataset.view = v; };

/* ---------- router ---------- */
let teardown = null;
function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'team' && activeTeam && activeTeam.id === parts[1]) { activeTeam.setPage(parts[2]); return; } // same team: switch page without reloading
  if (teardown) { teardown(); teardown = null; }
  setView(parts[0] === 'team' ? (parts[2] === 'vault' ? 'vault' : 'team') : parts[0] === 'admin' ? 'admin' : parts[0] === 'screen' ? 'screen' : 'landing');
  if (parts[0] === 'team') return teamView(parts[1], parts[2]);
  if (parts[0] === 'admin') return adminView();
  if (parts[0] === 'screen') return screenView();
  landing();
}
window.addEventListener('hashchange', route);

/* ---------- landing ---------- */
function landing() {
  const BOOT = ['[ OK ] mounting campusconnect.example', '[ OK ] intrusion detected: NULLPHANTOM', '[WARN] vault key split into 5 fragments', '[ .. ] awaiting analyst credentials'];
  const booted = sessionStorage.getItem('dmc_boot') || reduced || NOFX;
  $app.innerHTML = chrome(`<span><span class="dot"></span>SYS.STATUS: ONLINE</span>`) + `<main class="lmain">
  <div class="boot ${booted ? 'done' : ''}" id="boot"></div>
  <div class="center ${booted ? 'show' : ''}" id="land">
    <div class="bigcur mono">&gt;_</div>
    <h1 class="mega">DECODE ME <span class="hl" id="hl">IF YOU CAN</span></h1>
    <div class="sub mono">FIVE SYSTEMS. FIVE FRAGMENTS. ONE VAULT.</div>
    <form class="prompt wide" id="f"><input id="c" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ENTER TEAM CODE"><button class="btn sq" aria-label="enter">→</button></form>
    <div class="err" id="e"></div>
    <p class="story">NullPhantom broke into the CampusConnect student portal and split the vault key across five compromised systems. Decode every layer in <a href="https://gchq.github.io/CyberChef/" target="_blank" rel="noopener">CyberChef</a>, bring the code word to the admin, and unlock the next file.</p>
    <p class="lbl">Admin? <a href="#/admin">/admin</a> &nbsp; Projector? <a href="#/screen">/screen</a></p>
  </div></main>`;
  const $ = (q) => $app.querySelector(q);
  const hl = $('#hl'), hlText = hl.textContent;
  const show = () => { $('#land').classList.add('show'); $('#boot').classList.add('done'); scramble(hl, hlText, 1000); };
  hl.onmouseenter = () => scramble(hl, hlText, 600);
  let timers = [];
  if (!booted) {
    sessionStorage.setItem('dmc_boot', '1');
    const boot = $('#boot'); let i = 0;
    const step = () => { if (i < BOOT.length) { boot.insertAdjacentHTML('beforeend', `<div class="${/WARN/.test(BOOT[i]) ? 'am' : ''}">${esc(BOOT[i++])}</div>`); timers.push(setTimeout(step, 260)); } else timers.push(setTimeout(show, 350)); };
    step(); boot.onclick = () => { timers.forEach(clearTimeout); show(); };
  }
  teardown = () => timers.forEach(clearTimeout);
  const saved = ls.get('dmc_team');
  if (saved && D.teams.some((t) => t.id === saved)) $('#e').innerHTML = `<a href="#/team/${esc(saved)}">&gt; resume session as ${esc(saved.toUpperCase())}</a>`;
  $('#f').onsubmit = async (ev) => {
    ev.preventDefault();
    const h = await sha256hex(norm($('#c').value));
    const t = D.teams.find((x) => x.joinHash === h);
    if (!t) { $('#e').textContent = 'ERR: unknown team code'; $('#f').classList.remove('shake'); void $('#f').offsetWidth; $('#f').classList.add('shake'); return; }
    ls.set('dmc_team', t.id); nav('/team/' + t.id);
  };
}

/* ---------- team workspace ---------- */
let activeTeam = null;
async function teamView(id, pageArg) {
  const T = D.teams.find((t) => t.id === id);
  if (!T || ls.get('dmc_team') !== id) return nav('/');
  const blobs = { ...T.blobs, vault: D.global.vault, reveal: D.global.reveal };
  const codeKey = 'dmc_codes_' + id;
  const got = {}; // unlocked payloads
  let sel = 1, pending = false, msg = '', animKey = '', hmsg = '', restartCode = '', liveOk = false, bcast = null, brief = null;
  let page = pageArg === 'vault' || pageArg === 'fragment' ? pageArg : 'main';
  let hintsUsed = ls.get('dmc_hints_' + id, {}); // hints this team has revealed: {stage: count}
  let denied = null;                              // last wrong answer {kind, n, text, count, until}
  let fails = 0, hintArm = 0, revealTyped = false, typer = null;
  async function tryKey(key, only) {
    const fresh = [];
    for (const k of Object.keys(blobs)) {
      if (got[k] || (only && !only(k))) continue;
      const p = await open(blobs[k], key);
      if (p) { got[k] = p; fresh.push(k); }
    }
    return fresh;
  }
  $app.innerHTML = chrome('') + '<main><p class="mono dim">decrypting local cache…</p></main>';
  for (const c of ls.get(codeKey, [])) await tryKey(await keyFor(c));
  const cur = () => { let n = 0; for (let i = 1; i <= 5; i++) if (got['s' + i]) n = i; return n; };
  sel = cur() || 1;
  const solved = (n) => (n < 5 ? !!got['s' + (n + 1)] : !!got.done);
  const hintsOn = (n) => hintsUsed[n] || 0;
  const score = () => { let s = 0; for (let n = 1; n <= 5; n++) if (solved(n)) s += stagePts(got['s' + n].points, hintsOn(n));
    const c = cur();
    if (c && !solved(c)) { const p = got['s' + c].points; s -= Math.min(hintsOn(c) * hintCost(p), Math.max(0, p - 25)); }
    return Math.max(0, s); };
  const recap = (n) => (n < 5 ? got['s' + (n + 1)] : got.done).prev;

  const setPage = (p) => { page = p === 'vault' || p === 'fragment' ? p : 'main'; setView(page === 'vault' ? 'vault' : 'team'); render(); window.scrollTo(0, 0); };
  const go = (p) => { const h = '#/team/' + id + (p === 'vault' || p === 'fragment' ? '/' + p : ''); if (location.hash === h) setPage(p); else location.hash = h; };
  const wipe = () => { Object.keys(got).forEach((k) => delete got[k]); ls.set(codeKey, []); localStorage.removeItem('dmc_notes_' + id); sel = 1; hmsg = ''; msg = ''; restartCode = ''; bcast = null; brief = null; hintsUsed = {}; ls.set('dmc_hints_' + id, {}); denied = null; fails = 0; revealTyped = false; if (page !== 'main') { page = 'main'; setView('team'); location.hash = '#/team/' + id; } };
  function afterUnlock(fresh) {
    const stg = fresh.filter((k) => /^s\d$/.test(k)).map((k) => +k[1]);
    if (fresh.includes('done')) { sel = 5; brief = { n: 6 }; } else if (stg.length) { sel = Math.max(...stg); brief = { n: sel }; }
    if (stg.length || fresh.includes('done')) { denied = null; fails = 0; report(); }
    if (fresh.includes('reveal')) { flash('CASE CLOSED'); go('vault'); return; }
    if (fresh.includes('vault')) { flash('THE VAULT IS OPEN'); go('vault'); return; }
    if (fresh.some((k) => /^s\d$|^done$/.test(k))) flash('ACCESS GRANTED');
    render();
  }
  async function onLive(b) {
    const myE = ls.get('dmc_epoch', 0);
    if (b.t === 'names') { ls.set('dmc_names', b.names || {}); applyNames(b.names); render(); return; }
    if (b.t === 'reset') { if (b.epoch > myE) { ls.set('dmc_epoch', b.epoch); wipe(); render(); flash('NEW ROUND'); } return; }
    if (b.epoch < myE) return;
    if (b.epoch > myE) ls.set('dmc_epoch', b.epoch);
    if (b.t === 'bcast') { if (Date.now() - b.ts < 30 * 60000) { bcast = { text: b.text }; render(); } return; }
    if (b.t === 'code' && (b.team === '*' || b.team === id)) {
      const fresh = await tryKey(await keyFor(b.code));
      if (fresh.length) { const cs = ls.get(codeKey, []); cs.push(norm(b.code)); ls.set(codeKey, cs); afterUnlock(fresh); }
    }
  }
  // progress goes to the admin console (monitor only): no approval is needed
  function report() {
    const stage = got.done ? 6 : cur();
    if (stage) liveSubmit({ id: uid(), t: 'progress', team: id, stage, hints: hintsUsed, ts: Date.now() }).catch(() => {});
  }
  // a correct answer is the key that opens the next file, so the check is automatic
  async function attempt(kind, text) {
    const now = Date.now();
    if (denied && denied.until > now) return;
    const c = cur();
    const next = kind === 'flag' ? 'reveal' : c < 5 ? 's' + (c + 1) : 'done';
    const pass = kind === 'flag' ? 'FLAG:' + text : `${id}:${c}:${text}`;
    pending = true;
    const fresh = got[next] ? [] : await tryKey(await keyFor(pass), (k) => k === next);
    pending = false;
    if (fresh.length) {
      const cs = ls.get(codeKey, []); cs.push(norm(pass)); ls.set(codeKey, cs);
      if (kind === 'flag') liveSubmit({ id: uid(), t: 'flag', team: id, ts: Date.now() }).catch(() => {});
      afterUnlock(fresh); return;
    }
    fails++;
    denied = { kind, n: c, text, count: fails, until: fails >= 3 ? Date.now() + Math.min(30, 4 * (fails - 2)) * 1000 : 0 };
    render();
    flash('ACCESS DENIED', 'deny', 'That is not the right ' + (kind === 'flag' ? 'flag' : 'access phrase') + '. Check your decoding and try again.');
    const f = $app.querySelector(kind === 'flag' ? '#ff' : '#af'); if (f) { f.classList.add('shake'); }
    if (denied.until) setTimeout(() => { if (denied && denied.until <= Date.now() + 50) render(); }, denied.until - Date.now() + 100);
  }
  const deniedStatus = (kind) => {
    if (!denied || denied.kind !== kind || (kind === 'stage' && denied.n !== cur())) return '<span class="dim">' + (kind === 'flag' ? 'Be the first team to bring the flag for a bonus.' : 'Type the access phrase you found in the decoded file. It is checked automatically.') + '</span>';
    const wait = denied.until > Date.now() ? ` Too many tries: wait ${Math.ceil((denied.until - Date.now()) / 1000)}s.` : '';
    return `<span class="red"><b>ACCESS DENIED.</b> "${esc(denied.text)}" is not it. Check how you decoded the file and try again.${wait}</span>`;
  };
  const headRight = () => `<span class="mono">TEAM ${esc(T.name.replace('Team ', '').toUpperCase())}</span>${page !== 'main' ? `<a class="mono am" href="#/team/${id}">CASE FILES</a>` : ''}${got.done && page !== 'fragment' ? `<a class="mono am" href="#/team/${id}/fragment">MY FRAGMENT</a>` : ''}${got.vault && page !== 'vault' ? `<a class="mono am" href="#/team/${id}/vault">VAULT</a>` : ''}
      <span class="mono ${liveOk ? 'grn' : 'red'}" id="live"><i class="dot ${liveOk ? '' : 'off'}"></i>${liveOk ? 'LIVE' : 'OFFLINE'}</span><span class="mono grn">SCORE ${score()}</span><span class="mono grn clock" data-clock>${new Date().toTimeString().slice(0, 5)}</span><a class="mono" href="#/" id="out">EXIT</a>`;

  function render() {
    clearInterval(typer);
    return page === 'vault' ? renderVault() : page === 'fragment' && got.done ? renderFragment() : renderMain();
  }

  function renderMain() {
    const c = cur(), s1 = got.s1, st = got['s' + sel];
    const seg = [1, 2, 3, 4, 5].map((n) => `<span class="seg ${solved(n) ? 'd' : n === c ? 'a' : ''}"></span>`).join('');
    const cards = [1, 2, 3, 4, 5].map((n) => {
      const opened = !!got['s' + n], k = solved(n) ? 'd' : n === c ? 'a' : 'l';
      return `<button class="card ${k} ${n === sel ? 'sel' : ''}" style="--i:${n}" data-n="${n}" ${opened ? '' : 'disabled'}><span class="lbl">0${n}</span><b>${opened ? esc(got['s' + n].title.replace(/^The /, '')) : '██████'}</b>
        <span class="ic">${k === 'd' ? '✓' : k === 'a' ? '●' : '🔒'}</span><span class="stt">${k === 'd' ? 'DECRYPTED' : k === 'a' ? 'IN PROGRESS' : 'LOCKED'}</span></button>`;
    }).join('');
    let main = '', info = '', hints = '';
    if (!st) {
      main = `<div class="body"><div class="lbl">// STANDING BY</div><h2 class="t">Waiting for clearance<span class="cur"></span></h2>
      <p class="dim">Nothing is visible until the host starts the game. When the game starts, your first case file opens here by itself.</p></div>`;
    } else {
      const isActive = sel === c && !solved(sel);
      const lines = (st.evidence_extra || [st.encoded]).map((t) => ({ t }));
      const docs = (st.docs || []).map((d) => `<div class="doc"><div class="dh"><span>${esc(d.name)}</span></div><pre class="dbody">${esc(d.text)}</pre></div>`).join('');
      main = `<div class="tabs"><div class="on">${esc(st.file)}</div></div><div class="body">
        <div class="lbl">// CASE FILE ${String(st.n).padStart(2, '0')} ${solved(sel) ? '· SOLVED' : ''}</div>
        <h2 class="t">${esc(st.title.toUpperCase())}</h2>
        <div class="how"><b>HOW IT WORKS</b> <span>1 READ the dossier.</span> <span>2 SOLVE its riddle to find the KEY.</span> <span>3 UNLOCK the file in <a href="https://gchq.github.io/CyberChef/" target="_blank" rel="noopener">CyberChef</a> with that key.</span> <span>4 SUBMIT the ACCESS PHRASE you find inside. It is checked automatically.</span></div>
        <div class="lbl sec">// DOSSIER · readable evidence from ${esc(s1.host)}</div>${docs}
        <div class="lbl sec">// LOCKED FILE</div>${termBox(st.file, lines)}`;
      if (isActive) {
        main += `<form class="answer" id="af"><span class="lbl">// ACCESS PHRASE</span><div class="prompt"><span class="grn">&gt;</span><input id="ai" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="type it here"><button class="btn" ${denied && denied.kind === 'stage' && denied.until > Date.now() ? 'disabled' : ''}>SUBMIT</button></div></form><div class="sstat">${deniedStatus('stage')}</div>`;
      } else if (solved(sel)) {
        const r = recap(sel);
        main += `<div class="recap"><div class="lbl">// WHAT THE FILE SAID</div><p class="mono grn" style="word-break:break-word;white-space:pre-wrap">${esc(r.decoded)}</p><p class="dim mono">Recipe: ${esc(r.recipe.join(' → '))}</p></div>`;
        if (sel === 5) {
          main += `<p>Case file 5 is solved. Your piece of the vault key is kept in its own section, away from the case files.</p><a class="btn big" style="display:inline-block;opacity:1;text-decoration:none" href="#/team/${id}/fragment">OPEN MY FRAGMENT →</a>${got.vault ? ` <a class="btn big" style="display:inline-block;opacity:1;text-decoration:none;background:transparent;color:var(--grn)!important;border:1px solid var(--grn)" href="#/team/${id}/vault">GO TO THE VAULT →</a>` : ''}`;
        }
      }
      main += `</div>`;
      info = `<div class="panel side"><div class="lbl">// CASE INFO</div>
        <div class="kv"><span>POINTS</span><b class="grn">${st.points}</b></div><div class="kv"><span>HINTS USED</span><b>${hintsOn(st.n)}</b></div>
        <div class="kv"><span>DIFFICULTY</span><b class="diff">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= st.n ? 'on' : ''}"></i>`).join('')}</b></div>
        <div class="polaroid mini">${st.n % 2 ? HOUSE : MAP}</div></div>`;
      if (isActive) {
        const used = hintsUsed[st.n] || 0;
        hints = `<div class="panel side hintpanel"><div class="lbl am">${BULB} HINTS · each one costs ${hintCost(st.points)} pts</div>`;
        for (let k = 1; k <= 2; k++) {
          if (k <= used) hints += `<div class="hint on"><span class="am mono">${BULB} HINT ${k}</span><br>${esc((st.hints || [])[k - 1] || '')}</div>`;
          else hints += `<div class="hint off hbtn"><button class="btn amber ${hintArm === k ? 'arm' : ''}" data-hint="${k}" ${k > used + 1 ? 'disabled' : ''}>${k > used + 1 ? 'Reveal hint 1 first' : hintArm === k ? 'Click again to confirm (−' + hintCost(st.points) + ' pts)' : 'Reveal hint ' + k + ' (−' + hintCost(st.points) + ' pts)'}</button></div>`;
        }
        hints += `</div>`;
      }
    }
    if (st && brief && ((brief.n === 6 && sel === 5) || brief.n === sel)) {
      let head, lines, btn;
      if (brief.n === 6) {
        const d = got.done;
        head = 'FILE RECOVERED';
        lines = ['You found it, analyst.', `This is vault fragment ${d.fragment_position} of 5, and you also hold recipe step ${d.step} of 5.`, 'NullPhantom split the key so that no single team can open the vault.', 'The other four fragments are held by the other teams. Find them.'];
        btn = 'OPEN MY FRAGMENT →';
      } else if (brief.n === 1) {
        head = 'MISSION BRIEFING';
        lines = ['23:41. Someone broke into the CampusConnect student portal.', 'The intruder calls themself NullPhantom.', 'They split the key to their vault into five pieces and hid one piece in each compromised system.', `Your team has access to the ${s1.system} (${s1.host}).`, 'Every file is locked. Read the dossier of each file and solve the riddle in it: the answer is the key. Use the key to open the locked file in CyberChef. Inside you will find an access phrase. Submit it here, and the host will approve it.'];
        btn = `OPEN CASE FILE 01 → ${st.file}`;
      } else {
        const r = recap(brief.n - 1);
        head = 'INTERCEPTED TRANSMISSION · NULLPHANTOM';
        lines = r.decoded.split(/\n+/).filter(Boolean);
        btn = `OPEN CASE FILE ${String(brief.n).padStart(2, '0')} → ${st.file}`;
      }
      const gap = lines.length > 3 ? 0.35 : 0.8;
      main = `<div class="body brief"><div class="grant">✓ ACCESS GRANTED</div><div class="lbl">// ${head}</div>
        <div class="story">${lines.map((t, i) => `<p class="${i === lines.length - 1 && brief.n > 1 && brief.n < 6 ? 'clue' : ''}" style="animation-delay:${(i * gap * 2).toFixed(1)}s">${esc(t)}</p>`).join('')}</div>
        <button class="btn big" id="open" style="animation-delay:${(lines.length * gap * 2 + 0.2).toFixed(1)}s">${esc(btn)}</button></div>`;
      info = ''; hints = '';
    }
    const auto = [1, 2, 3, 4, 5].filter(solved).map((n) => `<div class="anote"><b>FILE ${n}</b> ${esc((recap(n) || {}).note || '')}</div>`).join('');
    const notes = `<div class="panel side"><div class="lbl">// TEAM NOTES <span class="grn">· WRITTEN FOR YOU</span></div><div class="autonotes">${auto || '<span class="dim">Every key, riddle answer and thing worth remembering from a solved file is written here for you.</span>'}</div>
      <div class="lbl" style="margin-top:14px">YOUR OWN NOTES</div><textarea class="f notes" id="notes" placeholder="anything else you want to remember">${esc(ls.get('dmc_notes_' + id, ''))}</textarea></div>`;
    $app.innerHTML = chrome(headRight() === '' ? '' : `<span class="mono dim">${s1 ? esc(s1.host) : '—'}</span>` + headRight()) +
      `<main class="tmain">${bcast ? `<div class="bcast">&gt; ${esc(bcast.text)}</div>` : ''}${got.vault ? `<a class="vaultbanner" href="#/team/${id}/vault">THE VAULT IS OPEN → go to the vault</a>` : ''}<div class="opp"><div><div class="oh">OPERATION PROGRESS</div><div class="lbl">TEAM ${esc(T.name.replace('Team ', '').toUpperCase())}${s1 ? ' · ' + esc(s1.system.toUpperCase()) : ''}</div></div>
      <div class="segs">${seg}<span class="frac mono"><b>${Math.max(0, [1, 2, 3, 4, 5].filter(solved).length)}/5</b><br><span class="lbl">STAGES COMPLETED</span></span></div></div>
      <div class="cards">${cards}</div>
      <div class="tw"><div><div class="panel">${main}</div>
      <form class="unlock" id="uf"><span class="lbl">// OFFLINE? ENTER A CODE FROM THE ADMIN</span><div class="prompt" style="max-width:320px"><span class="grn">&gt;</span><input id="uc" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX"><button class="btn">UNLOCK</button></div><span class="err" id="ue">${esc(msg)}</span></form></div>
      <div class="rcol">${info}${hints}${notes}</div></div></main>`;
    $app.querySelectorAll('.card').forEach((b) => (b.onclick = () => { sel = +b.dataset.n; render(); }));
    const ob = $app.querySelector('#open'); if (ob) ob.onclick = () => { const toFrag = brief && brief.n === 6; brief = null; animKey = ''; if (toFrag) go('fragment'); else render(); };
    const af = $app.querySelector('#af'); if (af) af.onsubmit = (ev) => { ev.preventDefault(); const v = $app.querySelector('#ai').value.trim(); if (v && !pending) attempt('stage', v); };
    $app.querySelectorAll('[data-hint]').forEach((bt) => (bt.onclick = () => {
      const k = +bt.dataset.hint;
      if (hintArm !== k) { hintArm = k; render(); setTimeout(() => { if (hintArm === k) { hintArm = 0; render(); } }, 4000); return; }
      hintArm = 0; hintsUsed[cur()] = Math.max(hintsUsed[cur()] || 0, k); ls.set('dmc_hints_' + id, hintsUsed); flash('HINT REVEALED'); report(); render();
    }));
    const nt = $app.querySelector('#notes'); if (nt) nt.oninput = () => ls.set('dmc_notes_' + id, nt.value);
    if (st) wireCopy($app, st.encoded);
    const ak = sel + ':' + (solved(sel) ? 1 : 0) + ':' + (brief ? 1 : 0);
    if (st && ak !== animKey) {
      animKey = ak;
      const pn = $app.querySelector('.tw .panel'); if (pn) pn.classList.add('open');
      const ttl = $app.querySelector('h2.t'); if (ttl) scramble(ttl, ttl.textContent, 600);
    }
    $app.querySelectorAll('[data-copy2]').forEach((b) => (b.onclick = () => copyText(got.done.fragment, b)));
    $app.querySelector('#out').onclick = () => localStorage.removeItem('dmc_team');
    $app.querySelector('#uf').onsubmit = async (ev) => {
      ev.preventDefault();
      const code = norm($app.querySelector('#uc').value); if (!code || pending) return;
      pending = true; msg = 'verifying…'; $app.querySelector('#ue').textContent = msg;
      const key = await keyFor(code);
      if (got.s1 && Object.keys(got).some((k) => k !== 's1') && (await open(blobs.s1, key))) {
        pending = false;
        if (restartCode !== code) {
          restartCode = code;
          msg = 'That is the START code. Entering it again restarts your team from stage 1 and clears your notes. Press UNLOCK again to confirm.';
          render(); $app.querySelector('#uc').value = code; return;
        }
        Object.keys(got).forEach((k) => delete got[k]);
        ls.set(codeKey, []); localStorage.removeItem('dmc_notes_' + id);
        restartCode = ''; hmsg = ''; sel = 1; pending = true;
      }
      const fresh = await tryKey(key);
      pending = false;
      if (!fresh.length) {
        let known = false;
        for (const k of Object.keys(blobs)) if (!known && await open(blobs[k], key)) known = true;
        msg = known ? 'That code is already unlocked on this device.' : 'ERR: code rejected';
        render(); return;
      }
      msg = '';
      const codes = ls.get(codeKey, []); codes.push(code); ls.set(codeKey, codes);
      afterUnlock(fresh);
    };
  }

  function renderFragment() {
    const d = got.done;
    $app.innerHTML = chrome(headRight()) + `<main class="vmain"><a class="mono" href="#/team/${id}">← BACK TO THE CASE FILES</a>
      <div class="panel vpanel fragpanel" style="margin-top:14px"><div class="lbl">// YOUR PIECE OF THE VAULT KEY</div><h2 class="t">MY FRAGMENT</h2>
        <p>NullPhantom split the key to the vault into five pieces, one for each team. This is yours. Keep it safe and find the other four teams: nobody can open the vault alone.</p>
        <div class="term"><div class="th"><span class="fn">vault_fragment.key</span><button class="copy" data-copy2>COPY</button></div><div class="body">
          <div class="lbl">FRAGMENT ${d.fragment_position} OF 5</div><div class="mono cy frag">${esc(d.fragment)}</div>
          <div class="lbl" style="margin-top:14px">RECIPE STEP ${d.step} OF 5</div><div class="mono grn" style="font-size:18px">${esc(d.label)}</div></div></div>
        <p class="dim">When all five teams have their pieces, the vault opens by itself. You will then join the five fragments in order 1 to 5 and apply the five recipe steps in order 1 to 5 in CyberChef.</p>
        ${got.vault ? `<a class="btn big" style="display:inline-block;opacity:1;text-decoration:none" href="#/team/${id}/vault">GO TO THE VAULT →</a>` : '<p class="am mono">Waiting for the other teams<span class="cur"></span></p>'}</div></main>`;
    $app.querySelectorAll('[data-copy2]').forEach((b) => (b.onclick = () => copyText(d.fragment, b)));
    $app.querySelector('#out').onclick = () => localStorage.removeItem('dmc_team');
  }

  function renderVault() {
    const mine = got.done, rev = got.reveal, isOpen = !!got.vault;
    const slots = [1, 2, 3, 4, 5].map((p) => {
      const own = mine && mine.fragment_position === p;
      return `<div class="vslot ${own ? 'on' : ''}"><span>FRAGMENT_0${p}</span><b class="${own ? 'frag' : ''}">${own ? esc(mine.fragment) : '[ REDACTED ] HELD BY ' + esc((D.holders[p] || '???').toUpperCase())}</b><i>0x${((p - 1) * 0x56).toString(16).padStart(2, '0')}</i></div>`;
    }).join('');
    const pipe = [1, 2, 3, 4, 5].map((s) => { const own = mine && mine.step === s; return `<span class="${own ? 'has' : ''}">STEP_0${s}${own ? ' ' + esc(mine.label) : ' [ ? ]'}</span>`; }).join('<em>→</em>');
    const flagForm = !isOpen ? '' : rev ? '' : `<div class="panel vpanel"><div class="lbl">// BREAK THE VAULT</div><p class="dim">When your teams have joined the fragments and applied the steps, you will read a message with a flag in it. Type the flag here. It is checked automatically, and the first team to bring it gets a bonus.</p>
      <form class="answer" id="ff"><div class="prompt"><span class="grn">&gt;</span><input id="fi" autocomplete="off" spellcheck="false" placeholder="GDG{...}"><button class="btn" ${denied && denied.kind === 'flag' && denied.until > Date.now() ? 'disabled' : ''}>SUBMIT FLAG</button></div></form><div class="sstat">${deniedStatus('flag')}</div></div>`;
    $app.innerHTML = chrome(headRight()) + `<main class="vmain"><a class="mono" href="#/team/${id}">← BACK TO THE CASE FILES</a>
      <div class="vgrid"><div class="vbox ${isOpen ? 'vopen' : ''} ${rev ? 'vrev' : ''}">${SAFE_BIG}<div class="vstate">${rev ? 'UNLOCKED' : isOpen ? 'OPEN FOR DECRYPTION' : 'SEALED'}</div></div>
      <div class="vside"><div class="panel vpanel"><div class="lbl">// ${isOpen ? 'THE FIVE TEAMS ARE HERE' : 'NOT OPEN YET'}</div><h2 class="t">THE VAULT</h2>
        ${isOpen ? `<p>Each team holds one fragment of the key and one step of the recipe. You hold <b>fragment ${mine ? mine.fragment_position : '?'}</b> and <b>step ${mine ? mine.step : '?'}</b> only. Find the other teams.</p>
        <p class="dim">Join the five fragments in order 1 to 5 with no spaces. Then apply the five recipe steps in order 1 to 5 in CyberChef.</p>
        <div class="vslots">${slots}</div><div class="pipe3">${pipe}</div>` : '<p class="dim">The host opens the vault when every team has its fragment. Stay on this page, it opens by itself.</p>'}</div>
      ${flagForm}
      ${rev ? `<div class="panel vpanel reveal2"><div class="lbl">// FINAL DECRYPT</div><div class="vmsg mono grn" id="rt"></div><div class="flagline">${esc(rev.flag)}</div><div class="closed">CASE CLOSED</div></div>` : ''}</div></div></main>`;
    const ff = $app.querySelector('#ff'); if (ff) ff.onsubmit = (ev) => { ev.preventDefault(); const v = $app.querySelector('#fi').value.trim(); if (v && !pending) attempt('flag', v); };
    $app.querySelector('#out').onclick = () => localStorage.removeItem('dmc_team');
    if (rev) {
      const el = $app.querySelector('#rt'), text = rev.plaintext;
      if (reduced || revealTyped) el.textContent = text;
      else { revealTyped = true; let i = 0; typer = setInterval(() => { i += 2; el.textContent = text.slice(0, i); if (i >= text.length) clearInterval(typer); }, 35); }
    }
  }
  activeTeam = { id, setPage };
  setView(page === 'vault' ? 'vault' : 'team');
  render();
  report();
  const stopLive = liveSubscribe(onLive, (ok) => {
    liveOk = ok;
    const e = document.getElementById('live');
    if (e) { e.className = 'mono ' + (ok ? 'grn' : 'red'); e.innerHTML = `<i class="dot ${ok ? '' : 'off'}"></i>${ok ? 'LIVE' : 'OFFLINE'}`; }
  });
  teardown = () => { stopLive(); clearInterval(typer); activeTeam = null; };
}

/* ---------- admin ---------- */
const AKEY = 'dmc_admin';
const freshState = () => ({ startedAt: null, pausedAt: null, pausedTotal: 0, vaultOpen: false, revealed: null, bonus: [], broadcast: null, announce: null, events: [], subs: {}, teams: Object.fromEntries(D.teams.map((t) => [t.id, { stage: 0, stageStart: null, verifiedAt: [], hints: {}, last: null, hold: false }])) });
const loadS = () => ls.get(AKEY, null) || freshState();
const saveS = (s) => ls.set(AKEY, s);
const teamScore = (S, A, id) => {
  const ts = S.teams[id]; let sc = 0;
  for (let n = 1; n < Math.min(ts.stage, 6); n++) sc += stagePts(A.teams[id].stages[n - 1].points, ts.hints[n] || 0);
  if (ts.stage >= 1 && ts.stage <= 5) {
    const pts = A.teams[id].stages[ts.stage - 1].points;
    sc -= Math.min((ts.hints[ts.stage] || 0) * hintCost(pts), Math.max(0, pts - 25));
  }
  const b = S.bonus.indexOf(id);
  return Math.max(0, sc + (b >= 0 ? [200, 100, 50][b] || 0 : 0));
};

async function adminView() {
  let A = null, pass = sessionStorage.getItem('dmc_pass');
  async function unlock(p) {
    const a = await open(D.admin, await keyFor(p));
    if (a) { A = a; sessionStorage.setItem('dmc_pass', p); }
    return !!a;
  }
  if (!pass || !(await unlock(pass))) {
    $app.innerHTML = chrome('<span class="mono red">RESTRICTED</span>') + `<main><div class="hero"><div class="lbl">// ADMIN CONSOLE</div><h1 style="font-size:48px">Passcode.</h1>
    <form class="prompt" id="f"><span class="grn">#</span><input id="p" type="password" autocomplete="off"><button class="btn">AUTH</button></form><div class="err" id="e"></div></div></main>`;
    $app.querySelector('#f').onsubmit = async (ev) => {
      ev.preventDefault();
      if (await unlock($app.querySelector('#p').value)) route(); else $app.querySelector('#e').textContent = 'ERR: access denied';
    };
    return;
  }
  const priv = await crypto.subtle.importKey('jwk', A.priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const syncA = () => D.teams.forEach((t) => { A.teams[t.id].name = t.name; });
  syncA();
  let sel = D.teams[0].id, armed = null, typed = '', resetNote = false, liveMsg = 'LIVE: idle';
  const epoch = () => ls.get('dmc_admin_epoch', 1);
  const pub = (o) => livePublish(priv, { ...o, epoch: epoch() }).then((ok) => (liveMsg = ok ? 'LIVE: sent ' + new Date().toTimeString().slice(0, 8) : 'LIVE: send failed'), () => (liveMsg = 'LIVE: offline, read codes out loud')).then(() => { const e = document.getElementById('alive'); if (e) e.textContent = liveMsg; });
  const log = (S, text) => S.events.unshift({ t: Date.now(), text });
  const arm = (key, fn) => (armed === key ? ((armed = null), fn()) : ((armed = key), render(), setTimeout(() => { if (armed === key) { armed = null; render(); } }, 3000)));
  const act = (fn) => { const S = loadS(), before = S.announce; fn(S); S.scores = Object.fromEntries(D.teams.map((t) => [t.id, teamScore(S, A, t.id)])); saveS(S); if (S.announce && S.announce !== before) pub({ t: 'code', team: S.announce.team || '*', code: S.announce.code }); render(); };

  const verifyIn = (S, teamId) => {
    const tm = A.teams[teamId], x = S.teams[teamId], n = x.stage;
    x.verifiedAt.push(Date.now()); x.stage++; x.stageStart = Date.now(); x.last = Date.now(); typed = '';
    S.announce = { label: `${tm.name} · access granted by override`, code: tm.stages[n - 1].unlockCode, team: teamId, hidden: true };
    log(S, `${tm.name} verified stage ${n} (+${stagePts(tm.stages[n - 1].points, x.hints[n] || 0)})`);
  };
  let qState = 'connecting';
  const resetAt = () => ls.get('dmc_admin_resetAt', 0);
  // teams check their own answers; they only report progress here, so this console is a monitor
  function applyProgress(b) {
    const S = loadS(); if (!S.startedAt) return;
    const x = S.teams[b.team], tm = A.teams[b.team]; if (!x || !tm) return;
    let changed = false;
    if (b.stage > x.stage) {
      for (let n = x.stage; n < b.stage && n <= 5; n++) { x.verifiedAt.push(b.ts); log(S, `${tm.name} solved stage ${n} (${tm.stages[n - 1].title})`); }
      x.stage = b.stage; x.stageStart = Date.now(); changed = true;
    }
    for (const n in (b.hints || {})) if ((b.hints[n] || 0) > (x.hints[n] || 0)) { x.hints[n] = b.hints[n]; log(S, `${tm.name} used hint ${b.hints[n]} on stage ${n}`); changed = true; }
    if (!changed) return;
    x.last = Date.now();
    S.scores = Object.fromEntries(D.teams.map((t) => [t.id, teamScore(S, A, t.id)]));
    saveS(S);
    if (!S.vaultOpen && D.teams.every((t) => S.teams[t.id].stage === 6)) { act((S2) => { S2.vaultOpen = true; S2.announce = { label: 'VAULT CODE (all teams)', code: A.vaultCode }; log(S2, 'All five teams finished: the vault opened automatically'); }); return; }
    softRender();
  }
  function applyFlag(b) {
    const S = loadS(); const tm = A.teams[b.team]; if (!tm || S.bonus.includes(b.team)) return;
    if (S.bonus.length < 3) S.bonus.push(b.team);
    log(S, `${tm.name} found the flag (place ${S.bonus.indexOf(b.team) + 1})`);
    S.scores = Object.fromEntries(D.teams.map((t) => [t.id, teamScore(S, A, t.id)]));
    saveS(S); softRender();
  }
  const softRender = () => { const a = document.activeElement; if (!a || !/INPUT|TEXTAREA/.test(a.tagName)) render(); };
  const stopSubs = liveSubscribe((b) => {
    if (!b || !b.team || !b.ts || b.ts < resetAt()) return;
    if (b.t === 'progress') applyProgress(b); else if (b.t === 'flag') applyFlag(b);
  }, (ok) => { qState = ok ? 'live' : 'offline'; const e = document.getElementById('qstate'); if (e) { e.className = ok ? 'grn' : 'red'; e.textContent = ok ? '● LISTENING TO TEAMS' : '● OFFLINE'; } }, { suffix: '-s', raw: true });

  function render() {
    const S = loadS(), tm = A.teams[sel], ts = S.teams[sel], st = tm.stages[Math.min(ts.stage, 5) - 1];
    const started = !!S.startedAt;
    const rows = D.teams.map((t) => {
      const x = S.teams[t.id], cells = [1, 2, 3, 4, 5].map((n) => (x.stage > n ? '■' : '□')).join('');
      const since = x.stageStart && x.stage >= 1 && x.stage <= 5 ? `<span data-since="${x.stageStart}" class="${timerClass(Date.now() - x.stageStart)}">${fmt(Date.now() - x.stageStart)}</span>` : '—';
      const hn = Object.values(x.hints).reduce((a, b) => a + b, 0);
      return `<tr class="row ${t.id === sel ? 'sel' : ''}" data-t="${t.id}"><td>${esc(t.name)}${x.hold ? ' <span class="red">HOLD</span>' : ''}</td><td class="grn">${cells}</td><td>${x.stage ? Math.min(x.stage, 5) + '/5' : '—'}</td><td>${since}</td><td>${hn}</td><td class="grn">${teamScore(S, A, t.id)}</td><td class="dim">${x.last ? new Date(x.last).toLocaleTimeString() : '—'}</td></tr>`;
    }).join('');
    let detail = '';
    if (!started) detail = `<p class="dim">Game not started. Press START GAME, then announce the START code.</p>`;
    else if (ts.stage === 6) detail = `<div class="big">COMPLETE</div><p class="dim">All five stages verified. Fragment ${tm.fragment_position} · stage 5 answer was ${esc(tm.stages[4].answer)}.</p>
`;
    else if (ts.stage >= 1) {
      const h = ts.hints[ts.stage] || 0;
      const said = norm(typed), ok = said && said === norm(st.answer);
      detail = `<div class="lbl">// STAGE ${st.n} · ${esc(st.title)} · ${esc(st.file)}</div>
        <div class="lbl" style="margin-top:12px">EXPECTED ANSWER</div><div class="big">${esc(st.answer)}</div>
        <p class="mono" style="word-break:break-word;white-space:pre-wrap;font-size:13px">${esc(st.decoded)}</p>
        ${st.keyNote ? `<p class="lbl am">HOW THE KEY IS FOUND: <span class="mono" style="text-transform:none;letter-spacing:0">${esc(st.keyNote)}</span></p>` : ''}
        <p class="lbl">RECIPE: <span class="cy">${esc(st.recipe.join(' → '))}</span></p>
        <details><summary class="lbl">ENCODED</summary><div class="mono cy" style="word-break:break-all;font-size:12px">${esc(st.encoded)}</div></details>
        <p class="dim mono" style="font-size:12px">Hints used by the team on this stage: ${h}</p>
        <div class="actions"><button class="btn ghost" id="verify">Grant access (override)</button></div>`;
    }
    const issuedHtml = '';
    const slots = [1, 2, 3, 4, 5].map((p) => {
      const t = D.teams.find((x) => x.name === D.holders[p]);
      const on = t && S.teams[t.id].stage === 6;
      return `<span class="${on ? 'grn' : 'dim'}">SLOT_0${p} ▸ ${on ? 'HELD BY ' + esc(t.name.toUpperCase()) : 'EMPTY'}</span>`;
    }).join('<br>');
    const joins = D.teams.map((t) => `${esc(t.name)}: <span class="am">${esc(A.teams[t.id].joinCode)}</span>`).join(' &nbsp; ');
    $app.innerHTML = chrome(`<span class="mono grn">ADMIN</span><span class="mono dim" id="alive">${liveMsg}</span><a class="mono" href="#/screen" target="_blank" rel="noopener">OPEN PROJECTOR</a><a class="mono" href="#/">EXIT</a>`) + `<main>
    <div class="actions">
      ${started ? '' : '<button class="btn" id="start">START GAME</button>'}
      ${started ? `<button class="btn ghost" id="pause">${S.pausedAt ? 'Resume all' : 'Pause all'}</button>` : ''}
      <input class="f" id="bc" placeholder="Broadcast message (shows on projector)" style="flex:1;min-width:200px"><button class="btn ghost" id="bcb">Broadcast</button>
      <button class="btn ghost" id="vault" ${S.vaultOpen || !started ? 'disabled' : ''}>Open the vault</button>
      <button class="btn ghost" id="reveal" ${S.revealed || !S.vaultOpen ? 'disabled' : ''}>Reveal final answer</button>
      <button class="btn danger ${armed === 'reset' ? 'arm' : ''}" id="reset">${armed === 'reset' ? 'CONFIRM RESET?' : 'Reset game'}</button></div>
    ${resetNote && !started ? `<div class="panel" style="padding:12px 16px;margin-bottom:16px"><span class="lbl am">// GAME RESET</span><p style="margin:6px 0 0">Your console and the projector are cleared. <b>Every team device that is online has been reset automatically. A device that was offline resets when it reconnects. If a team still shows old progress, they can enter the START code twice to restart.</p></div>` : ''}
    <div class="panel queue"><div class="lbl">// AUTOMATIC MODE <span id="qstate" class="${qState === 'live' ? 'grn' : 'red'}">${qState === 'live' ? '● LISTENING TO TEAMS' : '● ' + qState.toUpperCase()}</span></div><p class="dim" style="margin:6px 0 0">Teams check their own answers: a correct access phrase opens the next file by itself. This console only monitors progress. The vault opens automatically when all five teams finish. Use "Grant access" only if a team is stuck or offline.</p></div>
    ${S.announce && !S.announce.hidden ? (S.announce.kind === 'hint' ? `<div class="panel hintann" style="padding:12px 16px;margin-bottom:16px"><span class="lbl am">${BULB} HINT KEY · ${esc(S.announce.label)}</span><br><span class="codebox">${esc(S.announce.code)}</span><span class="dim mono" style="font-size:12px"> &nbsp;give this to the team, they enter it in their Hints panel</span></div>` : `<div class="panel" style="padding:12px 16px;margin-bottom:16px"><span class="lbl">// READ OUT NOW · ${esc(S.announce.label)}</span><br><span class="codebox">${esc(S.announce.code)}</span></div>`) : ''}
    <div class="adm"><div class="panel" style="padding:8px"><table><tr><th>TEAM</th><th>STAGES</th><th>#</th><th>TIME</th><th>HINTS</th><th>SCORE</th><th>LAST</th></tr>${rows}</table>
      <div class="gap" style="padding:8px"><div class="lbl">// VAULT TRACKER</div><div class="mono" style="font-size:13px;margin-top:6px">${slots}</div>
      <div class="actions"><span class="lbl" style="align-self:center">FLAG BONUS</span>${D.teams.map((t) => `<button class="btn ghost bonus" data-t="${t.id}" ${S.bonus.includes(t.id) || S.bonus.length >= 3 ? 'disabled' : ''}>${esc(t.name.replace('Team ', ''))}</button>`).join('')}</div>
      <div class="lbl" style="margin-top:10px">JOIN CODES</div><div class="mono" style="font-size:12px">${joins}</div>
      <div class="lbl" style="margin-top:14px">TEAM NAMES</div><form id="nf" class="actions">${D.teams.map((t) => `<input class="f nm" data-id="${t.id}" value="${esc(t.name)}" maxlength="24" style="width:140px">`).join('')}<button class="btn ghost">Save names</button></form></div></div>
    <div class="panel" style="padding:16px"><div class="lbl">// SELECTED: ${esc(tm.name)}</div>${detail}${issuedHtml}</div></div>
    <div class="gap panel" style="padding:12px"><div class="lbl">// EVENT LOG</div><div class="log">${S.events.map((e) => `<div>${new Date(e.t).toLocaleTimeString()}  ${esc(e.text)}</div>`).join('') || 'no events'}</div></div></main>`;

    const $ = (s) => $app.querySelector(s), on = (s, f) => { const e = $(s); if (e) e.onclick = f; };
    $app.querySelectorAll('tr.row').forEach((r) => (r.onclick = () => { sel = r.dataset.t; typed = ''; render(); }));
    on('#start', () => act((S) => {
      resetNote = false; if (ls.get('dmc_names')) pub({ t: 'names', names: ls.get('dmc_names') }); S.startedAt = Date.now(); for (const id in S.teams) Object.assign(S.teams[id], { stage: 1, stageStart: Date.now(), last: Date.now() }); S.announce = { label: 'START CODE (all teams)', code: A.startCode }; log(S, 'Game started'); }));
    on('#pause', () => act((S) => { if (S.pausedAt) { S.pausedTotal += Date.now() - S.pausedAt; S.pausedAt = null; log(S, 'Resumed'); } else { S.pausedAt = Date.now(); log(S, 'Paused'); } }));
    const nf = $('#nf'); if (nf) nf.onsubmit = (ev) => {
      ev.preventDefault();
      const map = {}; nf.querySelectorAll('.nm').forEach((i) => { if (i.value.trim()) map[i.dataset.id] = i.value.trim(); });
      ls.set('dmc_names', map); applyNames(map); syncA(); pub({ t: 'names', names: map }); render();
    };
    on('#bcb', () => { const v = $('#bc').value.trim(); if (v) { pub({ t: 'bcast', text: v }); act((S) => { S.broadcast = { text: v, t: Date.now() }; log(S, 'Broadcast: ' + v); }); } });
    on('#vault', () => act((S) => { S.vaultOpen = true; S.announce = { label: 'VAULT CODE (all teams)', code: A.vaultCode }; log(S, 'Vault opened'); }));
    on('#reveal', () => act((S) => { S.revealed = { plaintext: A.vaultPlain, flag: A.flag, t: Date.now() }; S.announce = { label: 'REVEAL (sent to all teams)', code: A.revealCode, hidden: true }; log(S, 'Final answer revealed'); }));
    on('#reset', () => arm('reset', () => { localStorage.removeItem(AKEY); ls.set('dmc_admin_resetAt', Date.now()); ls.set('dmc_admin_epoch', epoch() + 1); pub({ t: 'reset' }); resetNote = true; render(); }));
    on('#verify', () => act((S) => verifyIn(S, sel)));
    $app.querySelectorAll('.bonus').forEach((b) => (b.onclick = () => act((S) => { S.bonus.push(b.dataset.t); log(S, `Flag bonus #${S.bonus.length} to ${A.teams[b.dataset.t].name}`); })));
  }
  const onStore = (e) => { if (e.key === AKEY) render(); };
  window.addEventListener('storage', onStore);
  teardown = () => { window.removeEventListener('storage', onStore); stopSubs(); };
  render();
}

/* ---------- projector ---------- */
function screenView() {
  let typedFor = 0, typer = null, full = false;
  function render() {
    applyNames(ls.get('dmc_names', {}));
    const S = loadS(), started = !!S.startedAt;
    const clock = started ? fmt((S.pausedAt || Date.now()) - S.startedAt - S.pausedTotal) : '--:--';
    const rank = D.teams.map((t) => ({ t, x: S.teams[t.id], sc: scoreOnly(S, t.id) }));
    rank.sort((a, b) => b.sc - a.sc || (a.x.verifiedAt.slice(-1)[0] || Infinity) - (b.x.verifiedAt.slice(-1)[0] || Infinity));
    const rows = rank.map(({ t, x, sc }) => `<div class="trow"><div>${esc(t.name.toUpperCase())}</div><div class="cells">${[1, 2, 3, 4, 5].map((n) => `<div class="cell ${x.stage > n ? 'd' : x.stage === n ? 'a' : ''}">${x.stage > n ? '✓' : x.stage === n ? '●' : '🔒'}</div>`).join('')}</div><div class="score">${sc}</div></div>`).join('');
    const held = [1, 2, 3, 4, 5].map((p) => { const t = D.teams.find((x) => x.name === D.holders[p]); return { p, t, on: !!t && S.teams[t.id].stage === 6 }; });
    const earned = held.filter((h) => h.on).length;
    const slots = held.map(({ p, t, on }) => `<div class="slot ${on ? 'on' : ''}"><span>FRAGMENT_0${p}</span><b>${on ? 'HELD BY ' + esc(t.name.toUpperCase()) : '[ REDACTED ]'}</b><i>0x${((p - 1) * 0x56).toString(16).padStart(2, '0')}</i></div>`).join('');
    const pipe = [1, 2, 3, 4, 5].map((n) => `<span class="${n <= earned ? 'on' : ''}">STEP_0${n}</span>`).join('<em>→</em>');
    const state = S.revealed ? 'UNLOCKED' : S.vaultOpen ? 'OPEN FOR DECRYPTION' : earned === 5 ? 'ALL FRAGMENTS HELD' : 'SEALED';
    const vault = `<div class="vaultbox ${S.vaultOpen ? 'vopen' : ''} ${S.revealed ? 'vrev' : ''}"><div class="vhead"><span class="lbl">// THE VAULT</span><span class="vstate">${state}</span></div>
      ${SAFE_BIG}<div class="vcount">${earned} / 5 FRAGMENTS RECOVERED</div><div class="slots v">${slots}</div><div class="pipe2">${pipe}</div>
      ${S.vaultOpen && !S.revealed ? `<div class="vinst">JOIN THE FRAGMENTS 1 → 5 · APPLY THE STEPS 1 → 5 IN CYBERCHEF</div>` : ''}
      ${S.revealed ? `<div class="reveal"><div id="rt" class="grn"></div><div class="flagline" id="fl" style="visibility:hidden">${esc(S.revealed.flag)}</div><div class="closed" id="cc" style="visibility:hidden">CASE CLOSED</div></div>` : ''}</div>`;
    $app.innerHTML = `<div class="scr"><div class="scrtop"><h1>&gt;_ DECODE ME IF YOU CAN</h1><div class="clock">${clock}${S.pausedAt ? ' · PAUSED' : ''}</div></div>
      ${S.broadcast ? `<div class="bcast" style="font-size:1.8vw;margin-top:1vw">&gt; ${esc(S.broadcast.text)}</div>` : ''}
      <div class="scrgrid ${full ? 'full' : ''}"><div class="stand"><div class="standhd"><span>TEAM STANDINGS</span><span class="red live"><i class="dot off"></i>LIVE</span></div>${rows}</div>${vault}</div>
      <div class="lbl scrkey">press V to switch vault view</div></div>`;
    if (S.revealed) {
      const text = S.revealed.plaintext, el = $app.querySelector('#rt'), cc = $app.querySelector('#cc'), fl = $app.querySelector('#fl');
      const done = () => { el.textContent = text; cc.style.visibility = 'visible'; fl.style.visibility = 'visible'; };
      if (reduced || typedFor === S.revealed.t) done();
      else {
        typedFor = S.revealed.t; let i = 0;
        clearInterval(typer); typer = setInterval(() => { i += 2; el.textContent = text.slice(0, i); if (i >= text.length) { clearInterval(typer); typer = null; cc.style.visibility = 'visible'; fl.style.visibility = 'visible'; } }, 35);
      }
    }
  }
  function scoreOnly(S, id) {
    // the projector has no stage data, so the admin console stores each team's score
    return (S.scores && S.scores[id]) || 0;
  }
  const onStore = (e) => { if ((e.key === AKEY || e.key === 'dmc_names') && !typer) render(); };
  const onKey = (e) => { if (e.key === 'v' || e.key === 'V') { full = !full; if (!typer) render(); } };
  window.addEventListener('storage', onStore);
  window.addEventListener('keydown', onKey);
  const tick = setInterval(() => { if (!typer) render(); }, 1000);
  teardown = () => { window.removeEventListener('storage', onStore); window.removeEventListener('keydown', onKey); clearInterval(tick); clearInterval(typer); };
  render();
}

route();
