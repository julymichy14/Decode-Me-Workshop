'use strict';
/* Decode Me If You Can: The Vault — static client. All locked content in DATA is AES-GCM encrypted. */
const D = window.DATA;
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
const chrome = (right) => `<div class="bar"><span class="mono grn">&gt;_</span><b>DECODE ME IF YOU CAN</b><span class="sp"></span>${right || ''}</div>`;
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

/* ---------- router ---------- */
let teardown = null;
function route() {
  if (teardown) { teardown(); teardown = null; }
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'team') return teamView(parts[1]);
  if (parts[0] === 'admin') return adminView();
  if (parts[0] === 'screen') return screenView();
  landing();
}
window.addEventListener('hashchange', route);

/* ---------- landing ---------- */
function landing() {
  $app.innerHTML = chrome(`<span><span class="dot"></span>SYS.STATUS: ONLINE</span>`) + `<main>
  <div class="hero"><div class="lbl">// ACCESS LEVEL: RESTRICTED</div>
  <h1>The intruder left<br>the key in <span>five pieces.</span></h1>
  <p>NullPhantom broke into the CampusConnect student portal and hid a vault key across five compromised systems. Your team investigates one. Decode every layer in <a href="https://gchq.github.io/CyberChef/" target="_blank" rel="noopener">CyberChef</a>, bring the code word to the admin, and unlock the next file. The vault only opens when all five teams work together.</p>
  <div class="lbl" style="margin:26px 0 8px">// ENTER TEAM CODE</div>
  <form class="prompt" id="f"><span class="grn">&gt;</span><input id="c" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ALPHA-XXX" autofocus><button class="btn">EXECUTE</button></form>
  <div class="err" id="e"></div>
  <p class="lbl">Admin? <a href="#/admin">/admin</a> &nbsp; Projector? <a href="#/screen">/screen</a></p></div></main>`;
  const saved = ls.get('dmc_team');
  if (saved && D.teams.some((t) => t.id === saved)) {
    $app.querySelector('#e').innerHTML = `<a href="#/team/${esc(saved)}">&gt; resume session as ${esc(saved.toUpperCase())}</a>`;
  }
  $app.querySelector('#f').onsubmit = async (ev) => {
    ev.preventDefault();
    const h = await sha256hex(norm($app.querySelector('#c').value));
    const t = D.teams.find((x) => x.joinHash === h);
    if (!t) { $app.querySelector('#e').textContent = 'ERR: unknown team code'; return; }
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
  let sel = 1, pending = false, msg = '';
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
  const score = () => { let s = 0; for (let n = 1; n <= 5; n++) if (solved(n)) s += stagePts(got['s' + n].points, hintsOn(n)); return s; };
  const recap = (n) => (n < 5 ? got['s' + (n + 1)] : got.done).prev;

  function render() {
    const c = cur(), s1 = got.s1, st = got['s' + sel];
    const status = (n) => (solved(n) ? ['DECRYPTED', 'ok'] : n === c ? ['ACTIVE', 'grn'] : ['LOCKED', 'dim']);
    let tree = '<div class="hd lbl">▾ INVESTIGATION</div>';
    for (let n = 1; n <= 5; n++) {
      const [lab, cls] = status(n), opened = !!got['s' + n];
      tree += `<button data-n="${n}" class="${n === c && !solved(n) ? 'act ' : ''}${n === sel ? 'sel' : ''}" ${opened ? '' : 'disabled'}>
        <span class="dim">${n === 5 ? '└──' : '├──'}</span><span>${opened ? esc(got['s' + n].file.split('/').pop()) : String(n).padStart(2, '0') + '_██████'}</span>
        <span class="st ${cls}">${opened ? lab : '🔒'}</span></button>`;
    }
    let main = '';
    if (!st) {
      main = `<div class="body"><div class="lbl">// STANDING BY</div><h2 class="t">Waiting for clearance<span class="cur"></span></h2>
      <p class="dim">Nothing is visible until the host starts the game. When the START code is announced, enter it below.</p></div>`;
    } else {
      const isActive = sel === c && !solved(sel);
      const lines = (st.evidence_extra || [st.encoded]).map((t) => ({ t }));
      main = `<div class="tabs"><div class="on">${esc(st.file)}</div></div><div class="body">
        <div class="lbl">// CHALLENGE_${String(st.n).padStart(3, '0')} ${solved(sel) ? '· DECRYPTED' : ''}</div>
        <h2 class="t">${esc(st.title)}</h2>
        <div class="meta"><span>PTS <b>${st.points}</b></span><span>LAYERS <b>${st.layers}</b></span><span>FILE <b>${esc(st.file)}</b></span></div>
        <div class="mission">Evidence recovered from <b>${esc(s1.host)}</b>. ${st.layers} layer${st.layers > 1 ? 's' : ''} of encoding. Decode it in <a href="https://gchq.github.io/CyberChef/" target="_blank" rel="noopener">CyberChef</a>, then bring the code word to the admin.</div>
        ${termBox(st.file, lines)}`;
      if (isActive) {
        main += `<div class="lbl">// HINTS</div>`;
        for (let k = 1; k <= 2; k++) {
          const h = got[`h${st.n}_${k}`];
          main += h ? `<div class="hint on"><span class="am mono">HINT ${k} · −${hintCost(st.points)} pts</span><br>${esc(h.text)}</div>`
            : `<div class="hint off">HINT ${k} — LOCKED · ask the admin (costs ${hintCost(st.points)} pts)</div>`;
        }
        main += `<div class="wait">AWAITING VERIFICATION — bring your code word to the admin.<span class="cur"></span></div>`;
      } else if (solved(sel)) {
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
    }
    let side = '';
    if (got.vault) side += vaultPanel();
    if (got.reveal) side += revealPanel();
    $app.innerHTML = chrome(`<span class="mono">${esc(T.name.toUpperCase())}</span><span class="mono dim">${s1 ? esc(s1.host) : '—'}</span>
      <span class="mono">STAGE ${Math.max(c, 1)}/5</span><span class="mono grn">SCORE ${score()}</span><span><span class="dot"></span><span class="mono dim">LOCAL</span></span><a class="mono" href="#/" id="out">EXIT</a>`) +
      `<main>${msg ? '' : ''}<div class="ws"><div class="panel tree">${tree}</div><div><div class="panel">${main}</div>${side}
      <form class="unlock" id="uf"><span class="lbl">// CLEARANCE CODE FROM ADMIN</span><div class="prompt" style="max-width:300px"><span class="grn">&gt;</span><input id="uc" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX"><button class="btn">UNLOCK</button></div><span class="err" id="ue">${esc(msg)}</span></form>
      <p class="lbl">Codes unlock content on this device only. Enter them on each phone or laptop you use.</p></div></div></main>`;
    $app.querySelectorAll('.tree button').forEach((b) => (b.onclick = () => { sel = +b.dataset.n; render(); }));
    if (st) wireCopy($app, st.encoded);
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
      <div class="lbl">// VAULT OPEN · COLLABORATIVE MODE</div>
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
  const b = S.bonus.indexOf(id);
  return sc + (b >= 0 ? [200, 100, 50][b] || 0 : 0);
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
    <div class="panel" style="padding:16px"><div class="lbl">// SELECTED: ${esc(tm.name)}</div>${detail}</div></div>
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
      <div style="margin-top:1.5vw">${rows}</div><div class="lbl" style="margin-top:2vw;font-size:1.2vw">// THE VAULT</div><div class="slots">${slots}</div>
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
