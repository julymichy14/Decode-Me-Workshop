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
function flash(text) {
  const f = document.createElement('div'); f.className = 'flash'; f.innerHTML = `<div>${esc(text)}</div>`;
  document.body.appendChild(f); setTimeout(() => f.remove(), 1400);
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
  (function f(now) {
    const p = Math.min(1, (now - t0) / ms), n = Math.floor(p * final.length);
    let o = final.slice(0, n);
    for (let i = n; i < final.length; i++) o += /\s/.test(final[i]) ? final[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    el.textContent = p < 1 ? o : final;
    if (p < 1) requestAnimationFrame(f);
  })(t0);
  setTimeout(() => { el.textContent = final; }, ms + 150);
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
const setView = (v) => { document.body.dataset.view = v; };

/* ---------- router ---------- */
let teardown = null;
function route() {
  if (teardown) { teardown(); teardown = null; }
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  setView(parts[0] === 'team' ? 'team' : parts[0] === 'admin' ? 'admin' : parts[0] === 'screen' ? 'screen' : 'landing');
  if (parts[0] === 'team') return teamView(parts[1]);
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
async function teamView(id) {
  const T = D.teams.find((t) => t.id === id);
  if (!T || ls.get('dmc_team') !== id) return nav('/');
  const blobs = { ...T.blobs, vault: D.global.vault, reveal: D.global.reveal };
  const codeKey = 'dmc_codes_' + id;
  const got = {}; // unlocked payloads
  let sel = 1, pending = false, msg = '', animKey = '';
  async function tryKey(key) {
    const fresh = [];
    for (const k of Object.keys(blobs)) {
      if (got[k]) continue;
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
  const hintsOn = (n) => (got[`h${n}_1`] ? 1 : 0) + (got[`h${n}_2`] ? 1 : 0);
  const score = () => { let s = 0; for (let n = 1; n <= 5; n++) if (solved(n)) s += stagePts(got['s' + n].points, hintsOn(n));
    const c = cur();
    if (c && !solved(c)) { const p = got['s' + c].points; s -= Math.min(hintsOn(c) * hintCost(p), Math.max(0, p - 25)); }
    return Math.max(0, s); };
  const recap = (n) => (n < 5 ? got['s' + (n + 1)] : got.done).prev;

  function render() {
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
      <p class="dim">Nothing is visible until the host starts the game. When the START code is announced, enter it below.</p></div>`;
    } else {
      const isActive = sel === c && !solved(sel);
      const lines = (st.evidence_extra || [st.encoded]).map((t) => ({ t }));
      main = `<div class="tabs"><div class="on">${esc(st.file)}</div></div><div class="body">
        <div class="lbl">// CHALLENGE_${String(st.n).padStart(3, '0')} ${solved(sel) ? '· DECRYPTED' : ''}</div>
        <h2 class="t">${esc(st.title.toUpperCase())}</h2>
        <div class="mission">Evidence recovered from <b>${esc(s1.host)}</b>. ${st.layers} layer${st.layers > 1 ? 's' : ''} of encoding. Decode it in <a href="https://gchq.github.io/CyberChef/" target="_blank" rel="noopener">CyberChef</a>, then bring the code word to the admin.</div>
        ${termBox(st.file, lines)}`;
      if (isActive) main += `<div class="wait">AWAITING VERIFICATION — bring your code word to the admin.<span class="cur"></span></div>`;
      else if (solved(sel)) {
        const r = recap(sel);
        main += `<div class="recap"><div class="lbl">// RECAP</div><p class="mono grn" style="word-break:break-word">${esc(r.decoded)}</p><p class="dim mono">Recipe: ${esc(r.recipe.join(' → '))}</p></div>`;
        if (sel === 5) {
          const d = got.done;
          main += `<div class="term"><div class="th"><span class="fn">vault_fragment.key</span><button class="copy" data-copy2>COPY</button></div><div class="body">
            <div class="lbl">FRAGMENT ${d.fragment_position} OF 5</div><div class="mono cy frag">${esc(d.fragment)}</div>
            <div class="lbl" style="margin-top:12px">STEP ${d.step} OF 5: ${esc(d.label)}</div></div></div>
            <p>The vault needs all five teams. Find the other analysts.</p>`;
        }
      }
      main += `</div>`;
      info = `<div class="panel side"><div class="lbl">// CHALLENGE INFO</div>
        <div class="kv"><span>POINTS</span><b class="grn">${st.points}</b></div><div class="kv"><span>LAYERS</span><b>${st.layers}</b></div>
        <div class="kv"><span>HINTS USED</span><b>${hintsOn(st.n)}</b></div><div class="kv"><span>FILE TYPE</span><b>.${esc(st.file.split('.').pop())}</b></div>
        <div class="kv"><span>DIFFICULTY</span><b class="diff">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= st.n ? 'on' : ''}"></i>`).join('')}</b></div>
        <div class="polaroid mini">${st.n % 2 ? HOUSE : MAP}</div></div>`;
      if (isActive) {
        hints = `<div class="panel side"><div class="lbl">&gt; HINTS</div>`;
        for (let k = 1; k <= 2; k++) {
          const h = got[`h${st.n}_${k}`];
          hints += h ? `<div class="hint on"><span class="am mono">// HINT ${k} (−${hintCost(st.points)} PTS)</span><br>${esc(h.text)}</div>`
            : `<div class="hint off">// HINT ${k} (−${hintCost(st.points)} PTS)<br>🔒 LOCKED · ask the admin, then enter the code below</div>`;
        }
        hints += `</div>`;
      }
    }
    const notes = `<div class="panel side"><div class="lbl">// TEAM NOTES</div><textarea class="f notes" id="notes" placeholder="recipes, guesses, who holds what…">${esc(ls.get('dmc_notes_' + id, ''))}</textarea></div>`;
    let below = '';
    if (got.vault) below += vaultPanel();
    if (got.reveal) below += revealPanel();
    $app.innerHTML = chrome(`<span class="mono">TEAM ${esc(T.name.replace('Team ', '').toUpperCase())}</span><span class="mono dim">${s1 ? esc(s1.host) : '—'}</span>
      <span class="mono grn">SCORE ${score()}</span><span class="mono grn clock" data-clock>${new Date().toTimeString().slice(0, 5)}</span><a class="mono" href="#/" id="out">EXIT</a>`) +
      `<main class="tmain"><div class="opp"><div><div class="oh">OPERATION PROGRESS</div><div class="lbl">TEAM ${esc(T.name.replace('Team ', '').toUpperCase())}${s1 ? ' · ' + esc(s1.system.toUpperCase()) : ''}</div></div>
      <div class="segs">${seg}<span class="frac mono"><b>${Math.max(0, [1, 2, 3, 4, 5].filter(solved).length)}/5</b><br><span class="lbl">STAGES COMPLETED</span></span></div></div>
      <div class="cards">${cards}</div>
      <div class="tw"><div><div class="panel">${main}</div>
      <form class="unlock" id="uf"><span class="lbl">// CLEARANCE CODE FROM ADMIN</span><div class="prompt" style="max-width:320px"><span class="grn">&gt;</span><input id="uc" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX"><button class="btn">UNLOCK</button></div><span class="err" id="ue">${esc(msg)}</span></form>
      <p class="lbl">Codes unlock content on this device only. Enter them on each phone or laptop you use.</p>${below}</div>
      <div class="rcol">${info}${hints}${notes}</div></div></main>`;
    $app.querySelectorAll('.card').forEach((b) => (b.onclick = () => { sel = +b.dataset.n; render(); }));
    const nt = $app.querySelector('#notes'); if (nt) nt.oninput = () => ls.set('dmc_notes_' + id, nt.value);
    if (st) wireCopy($app, st.encoded);
    const ak = sel + ':' + (solved(sel) ? 1 : 0);
    if (st && ak !== animKey) {
      animKey = ak;
      const pn = $app.querySelector('.tw .panel'); if (pn) pn.classList.add('open');
      const ttl = $app.querySelector('h2.t'); if (ttl) scramble(ttl, st.title.toUpperCase(), 600);
      $app.querySelectorAll('.term .ln span').forEach((e, i) => { const f = e.textContent; setTimeout(() => scramble(e, f), i * 120); });
    }
    $app.querySelectorAll('[data-copy2]').forEach((b) => (b.onclick = () => copyText(got.done.fragment, b)));
    $app.querySelector('#out').onclick = () => localStorage.removeItem('dmc_team');
    $app.querySelector('#uf').onsubmit = async (ev) => {
      ev.preventDefault();
      const code = norm($app.querySelector('#uc').value); if (!code || pending) return;
      pending = true; msg = 'verifying…'; $app.querySelector('#ue').textContent = msg;
      const fresh = await tryKey(await keyFor(code));
      pending = false;
      if (!fresh.length) { msg = 'ERR: code rejected'; render(); return; }
      msg = '';
      const codes = ls.get(codeKey, []); codes.push(code); ls.set(codeKey, codes);
      const stg = fresh.filter((k) => /^s\d$/.test(k)).map((k) => +k[1]);
      if (fresh.includes('done')) sel = 5; else if (stg.length) sel = Math.max(...stg);
      if (fresh.some((k) => /^s\d$|^done$|^vault$|^reveal$/.test(k))) flash(fresh.includes('reveal') ? 'CASE CLOSED' : 'ACCESS GRANTED');
      render();
    };
  }
  function vaultPanel() {
    const mine = got.done;
    let rows = '', pipe = '';
    for (let p = 1; p <= 5; p++) {
      const own = mine && mine.fragment_position === p;
      rows += `<div class="off">0x${((p - 1) * 0x56).toString(16).padStart(2, '0')}</div><div class="${own ? 'cy frag' : 'red-slot'}">${own ? esc(mine.fragment) : '[ REDACTED ] HELD BY ' + esc((D.holders[p] || '???').toUpperCase())}</div>`;
    }
    for (let s = 1; s <= 5; s++) {
      const own = mine && mine.step === s;
      pipe += `<span class="s ${own ? 'has' : ''}">STEP_0${s}${own ? ' ' + esc(mine.label) : ' [ ? ]'}</span>${s < 5 ? '→' : ''}`;
    }
    return `<div class="panel gap"><div class="tabs"><div class="on">vault.vault</div></div><div class="body">
      <div class="vaulthd"><div><div class="lbl">// VAULT OPEN · COLLABORATIVE MODE</div><h2 class="t">VAULT ACCESS</h2></div>${SAFE}</div>
      <p>Join the fragments in order 1→5 with no spaces. Apply the recipe steps in order 1→5 in CyberChef. You hold only your own piece, so talk to the other teams.</p>
      <div class="hex">${rows}</div><div class="pipe">${pipe}</div></div></div>`;
  }
  function revealPanel() {
    const r = got.reveal;
    return `<div class="panel gap"><div class="body"><div class="lbl">// FINAL DECRYPT</div><p class="mono grn">${esc(r.plaintext)}</p><div class="closed" style="font:700 36px var(--sans);color:var(--grn)">CASE CLOSED</div></div></div>`;
  }
  render();
}

/* ---------- admin ---------- */
const AKEY = 'dmc_admin';
const freshState = () => ({ startedAt: null, pausedAt: null, pausedTotal: 0, vaultOpen: false, revealed: null, bonus: [], broadcast: null, announce: null, events: [], teams: Object.fromEntries(D.teams.map((t) => [t.id, { stage: 0, stageStart: null, verifiedAt: [], hints: {}, last: null, hold: false }])) });
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
  let sel = D.teams[0].id, armed = null, typed = '';
  const log = (S, text) => S.events.unshift({ t: Date.now(), text });
  const arm = (key, fn) => (armed === key ? ((armed = null), fn()) : ((armed = key), render(), setTimeout(() => { if (armed === key) { armed = null; render(); } }, 3000)));
  const act = (fn) => { const S = loadS(); fn(S); S.scores = Object.fromEntries(D.teams.map((t) => [t.id, teamScore(S, A, t.id)])); saveS(S); render(); };

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
      <div class="actions"><button class="btn danger ${armed === 'undo' ? 'arm' : ''}" id="undo">${armed === 'undo' ? 'CONFIRM UNDO?' : 'Undo last verification'}</button></div>`;
    else if (ts.stage >= 1) {
      const h = ts.hints[ts.stage] || 0;
      const said = norm(typed), ok = said && said === norm(st.answer);
      detail = `<div class="lbl">// STAGE ${st.n} · ${esc(st.title)} · ${esc(st.file)}</div>
        <div class="lbl" style="margin-top:12px">EXPECTED ANSWER</div><div class="big">${esc(st.answer)}</div>
        <p class="mono" style="word-break:break-word">${esc(st.decoded)}</p>
        <p class="lbl">RECIPE: <span class="cy">${esc(st.recipe.join(' → '))}</span></p>
        <p class="dim" style="font-size:13px">H1: ${esc(st.hints[0])}<br>H2: ${esc(st.hints[1])}</p>
        <details><summary class="lbl">ENCODED</summary><div class="mono cy" style="word-break:break-all;font-size:12px">${esc(st.encoded)}</div></details>
        <div class="gap"><span class="lbl">TEAM SAID</span> <input class="f" id="said" value="${esc(typed)}" placeholder="optional" style="width:160px"> <span id="match" class="mono ${ok ? 'grn' : 'red'}">${said ? (ok ? 'MATCH' : 'NO MATCH') : ''}</span></div>
        <div class="actions"><button class="btn" id="verify" ${ts.hold || S.pausedAt ? 'disabled' : ''}>&gt; VERIFY &amp; UNLOCK</button>
        <button class="btn ghost" id="h1" ${h >= 1 ? 'disabled' : ''}>Release hint 1 (−${hintCost(st.points)})</button>
        <button class="btn ghost" id="h2" ${h !== 1 ? 'disabled' : ''}>Release hint 2 (−${hintCost(st.points)})</button>
        <button class="btn ghost" id="hold">${ts.hold ? 'Resume team' : 'Hold team'}</button>
        <button class="btn danger ${armed === 'undo' ? 'arm' : ''}" id="undo" ${ts.stage < 2 ? 'disabled' : ''}>${armed === 'undo' ? 'CONFIRM UNDO?' : 'Undo last verification'}</button></div>`;
    }
    const issued = [];
    if (S.startedAt) issued.push(['START (everyone)', A.startCode]);
    for (let n = 1; n <= Math.min(ts.stage, 6); n++) {
      for (let k = 1; k <= (ts.hints[n] || 0); k++) issued.push([`Stage ${n} hint ${k}`, tm.stages[n - 1].hintCodes[k - 1]]);
      if (n < ts.stage) issued.push([`Stage ${n} verified`, tm.stages[n - 1].unlockCode]);
    }
    const issuedHtml = `<div class="gap"><div class="lbl">// CODES ISSUED TO ${esc(tm.name.toUpperCase())}</div><div class="mono" style="font-size:12px;margin-top:6px">${issued.map(([l, c]) => `${esc(l)}: <span class="am">${esc(c)}</span>`).join('<br>') || 'none yet'}</div></div>`;
    const slots = [1, 2, 3, 4, 5].map((p) => {
      const t = D.teams.find((x) => x.name === D.holders[p]);
      const on = t && S.teams[t.id].stage === 6;
      return `<span class="${on ? 'grn' : 'dim'}">SLOT_0${p} ▸ ${on ? 'HELD BY ' + esc(t.name.toUpperCase()) : 'EMPTY'}</span>`;
    }).join('<br>');
    const joins = D.teams.map((t) => `${esc(t.name)}: <span class="am">${esc(A.teams[t.id].joinCode)}</span>`).join(' &nbsp; ');
    $app.innerHTML = chrome(`<span class="mono grn">ADMIN</span><a class="mono" href="#/screen" target="_blank" rel="noopener">OPEN PROJECTOR</a><a class="mono" href="#/">EXIT</a>`) + `<main>
    <div class="actions">
      ${started ? '' : '<button class="btn" id="start">START GAME</button>'}
      ${started ? `<button class="btn ghost" id="pause">${S.pausedAt ? 'Resume all' : 'Pause all'}</button>` : ''}
      <input class="f" id="bc" placeholder="Broadcast message (shows on projector)" style="flex:1;min-width:200px"><button class="btn ghost" id="bcb">Broadcast</button>
      <button class="btn ghost" id="vault" ${S.vaultOpen || !started ? 'disabled' : ''}>Open the vault</button>
      <button class="btn ghost" id="reveal" ${S.revealed || !S.vaultOpen ? 'disabled' : ''}>Reveal final answer</button>
      <button class="btn danger ${armed === 'reset' ? 'arm' : ''}" id="reset">${armed === 'reset' ? 'CONFIRM RESET?' : 'Reset game'}</button></div>
    ${S.announce ? `<div class="panel" style="padding:12px 16px;margin-bottom:16px"><span class="lbl">// READ OUT NOW · ${esc(S.announce.label)}</span><br><span class="codebox">${esc(S.announce.code)}</span></div>` : ''}
    <div class="adm"><div class="panel" style="padding:8px"><table><tr><th>TEAM</th><th>STAGES</th><th>#</th><th>TIME</th><th>HINTS</th><th>SCORE</th><th>LAST</th></tr>${rows}</table>
      <div class="gap" style="padding:8px"><div class="lbl">// VAULT TRACKER</div><div class="mono" style="font-size:13px;margin-top:6px">${slots}</div>
      <div class="actions"><span class="lbl" style="align-self:center">FLAG BONUS</span>${D.teams.map((t) => `<button class="btn ghost bonus" data-t="${t.id}" ${S.bonus.includes(t.id) || S.bonus.length >= 3 ? 'disabled' : ''}>${esc(t.name.replace('Team ', ''))}</button>`).join('')}</div>
      <div class="lbl" style="margin-top:10px">JOIN CODES</div><div class="mono" style="font-size:12px">${joins}</div></div></div>
    <div class="panel" style="padding:16px"><div class="lbl">// SELECTED: ${esc(tm.name)}</div>${detail}${issuedHtml}</div></div>
    <div class="gap panel" style="padding:12px"><div class="lbl">// EVENT LOG</div><div class="log">${S.events.map((e) => `<div>${new Date(e.t).toLocaleTimeString()}  ${esc(e.text)}</div>`).join('') || 'no events'}</div></div></main>`;

    const $ = (s) => $app.querySelector(s), on = (s, f) => { const e = $(s); if (e) e.onclick = f; };
    $app.querySelectorAll('tr.row').forEach((r) => (r.onclick = () => { sel = r.dataset.t; typed = ''; render(); }));
    const said = $('#said'); if (said) said.oninput = () => { typed = said.value; const ok = norm(typed) && norm(typed) === norm(st.answer); $('#match').textContent = norm(typed) ? (ok ? 'MATCH' : 'NO MATCH') : ''; $('#match').className = 'mono ' + (ok ? 'grn' : 'red'); };
    on('#start', () => act((S) => { S.startedAt = Date.now(); for (const id in S.teams) Object.assign(S.teams[id], { stage: 1, stageStart: Date.now(), last: Date.now() }); S.announce = { label: 'START CODE (all teams)', code: A.startCode }; log(S, 'Game started'); }));
    on('#pause', () => act((S) => { if (S.pausedAt) { S.pausedTotal += Date.now() - S.pausedAt; S.pausedAt = null; log(S, 'Resumed'); } else { S.pausedAt = Date.now(); log(S, 'Paused'); } }));
    on('#bcb', () => { const v = $('#bc').value.trim(); if (v) act((S) => { S.broadcast = { text: v, t: Date.now() }; log(S, 'Broadcast: ' + v); }); });
    on('#vault', () => act((S) => { S.vaultOpen = true; S.announce = { label: 'VAULT CODE (all teams)', code: A.vaultCode }; log(S, 'Vault opened'); }));
    on('#reveal', () => act((S) => { S.revealed = { plaintext: A.vaultPlain, flag: A.flag, t: Date.now() }; S.announce = { label: 'REVEAL CODE (all teams)', code: A.revealCode }; log(S, 'Final answer revealed'); }));
    on('#reset', () => arm('reset', () => { localStorage.removeItem(AKEY); render(); }));
    on('#verify', () => act((S) => {
      const x = S.teams[sel], n = x.stage; x.verifiedAt.push(Date.now()); x.stage++; x.stageStart = Date.now(); x.last = Date.now(); typed = '';
      S.announce = { label: `${tm.name} · stage ${n} verified`, code: tm.stages[n - 1].unlockCode };
      log(S, `${tm.name} verified stage ${n} (+${stagePts(tm.stages[n - 1].points, x.hints[n] || 0)})`);
    }));
    [1, 2].forEach((k) => on('#h' + k, () => act((S) => {
      const x = S.teams[sel], n = x.stage; x.hints[n] = k; x.last = Date.now();
      S.announce = { label: `${tm.name} · hint ${k}`, code: tm.stages[n - 1].hintCodes[k - 1] };
      log(S, `${tm.name} hint ${k} on stage ${n}`);
    })));
    on('#hold', () => act((S) => { S.teams[sel].hold = !S.teams[sel].hold; log(S, `${tm.name} ${S.teams[sel].hold ? 'held' : 'resumed'}`); }));
    on('#undo', () => arm('undo', () => act((S) => {
      const x = S.teams[sel]; if (x.stage < 2) return; x.stage--; x.verifiedAt.pop(); x.stageStart = Date.now(); delete x.hints[x.stage + 1];
      log(S, `${tm.name} rolled back to stage ${x.stage}. Their devices keep anything already decrypted`);
    })));
    $app.querySelectorAll('.bonus').forEach((b) => (b.onclick = () => act((S) => { S.bonus.push(b.dataset.t); log(S, `Flag bonus #${S.bonus.length} to ${A.teams[b.dataset.t].name}`); })));
  }
  const onStore = (e) => { if (e.key === AKEY) render(); };
  window.addEventListener('storage', onStore);
  teardown = () => window.removeEventListener('storage', onStore);
  render();
}

/* ---------- projector ---------- */
function screenView() {
  let typedFor = 0, typer = null;
  function render() {
    const S = loadS(), started = !!S.startedAt;
    const clock = started ? fmt((S.pausedAt || Date.now()) - S.startedAt - S.pausedTotal) : '--:--';
    const rank = D.teams.map((t) => ({ t, x: S.teams[t.id], sc: scoreOnly(S, t.id) }));
    rank.sort((a, b) => b.sc - a.sc || (a.x.verifiedAt.slice(-1)[0] || Infinity) - (b.x.verifiedAt.slice(-1)[0] || Infinity));
    const rows = rank.map(({ t, x, sc }) => `<div class="trow"><div>${esc(t.name.toUpperCase())}</div><div class="cells">${[1, 2, 3, 4, 5].map((n) => `<div class="cell ${x.stage > n ? 'd' : x.stage === n ? 'a' : ''}">${x.stage > n ? '✓' : x.stage === n ? '●' : '🔒'}</div>`).join('')}</div><div class="score">${sc}</div></div>`).join('');
    const slots = [1, 2, 3, 4, 5].map((p) => {
      const t = D.teams.find((x) => x.name === D.holders[p]), on = t && S.teams[t.id].stage === 6;
      return `<div class="slot ${on ? 'on' : ''}">SLOT_0${p}<br>▸ ${on ? 'HELD BY ' + esc(t.name.replace('Team ', '').toUpperCase()) : '[ REDACTED ]'}</div>`;
    }).join('');
    $app.innerHTML = `<div class="scr"><div style="display:flex;justify-content:space-between;align-items:baseline"><h1>&gt;_ DECODE ME IF YOU CAN</h1><div class="clock">${clock}${S.pausedAt ? ' · PAUSED' : ''}</div></div>
      ${S.broadcast ? `<div class="bcast" style="font-size:1.8vw;margin-top:1vw">&gt; ${esc(S.broadcast.text)}</div>` : ''}
      <div class="stand"><div class="standhd"><span>TEAM STANDINGS</span><span class="red live"><i class="dot off"></i>LIVE</span></div>${rows}</div><div class="lbl" style="margin-top:2vw;font-size:1.2vw">// THE VAULT</div><div class="slots">${slots}</div>
      ${S.revealed ? `<div class="reveal"><div id="rt" class="grn"></div><div class="closed" id="cc" style="visibility:hidden">CASE CLOSED</div></div>` : ''}</div>`;
    if (S.revealed) {
      const full = S.revealed.plaintext, el = $app.querySelector('#rt'), cc = $app.querySelector('#cc');
      const done = () => { el.textContent = full; cc.style.visibility = 'visible'; };
      if (reduced || typedFor === S.revealed.t) done();
      else {
        typedFor = S.revealed.t; let i = 0;
        clearInterval(typer); typer = setInterval(() => { i += 2; el.textContent = full.slice(0, i); if (i >= full.length) { clearInterval(typer); typer = null; cc.style.visibility = 'visible'; } }, 35);
      }
    }
  }
  function scoreOnly(S, id) {
    // the projector has no stage data, so the admin console stores each team's score
    return (S.scores && S.scores[id]) || 0;
  }
  const onStore = (e) => { if (e.key === AKEY && !typer) render(); };
  window.addEventListener('storage', onStore);
  const tick = setInterval(() => { if (!typer) render(); }, 1000);
  teardown = () => { window.removeEventListener('storage', onStore); clearInterval(tick); clearInterval(typer); };
  render();
}

route();
