// „TOPP DAS!“ im Browser: Lobby, Bomben-Karten-Baukasten, Tisch.

import { CARD_BRAND, EFFECTS, TARGETS, MAX_EFFECTS_PER_CARD, ROLES, CHARACTERS, BASIC_SPECIALS, PLAYER_CARDS, JESTER_COMBO, RULES, describe, cardText, validateEffects } from '/shared/cards.js';
import { fileToAvatar } from '/js/avatar.js';
import { cardEl } from './card-ui.js';
import { connect, SERVER } from '/js/net.js';

const $ = (id) => document.getElementById(id);
const saved = JSON.parse(localStorage.getItem('karten-profile') || '{}');

// ── Branding ─────────────────────────────────────────────
document.title = CARD_BRAND.title;
$('title').textContent = CARD_BRAND.title;
$('tagline').textContent = CARD_BRAND.tagline;

// ── 1 · Du ───────────────────────────────────────────────
let avatar = saved.avatar || JSON.parse(localStorage.getItem('profile') || '{}').avatar || null;
$('name').value = saved.name || JSON.parse(localStorage.getItem('profile') || '{}').name || '';
$('room').value = new URLSearchParams(location.search).get('raum') || '';
function showAvatar() {
  const ctx = $('avatar-preview').getContext('2d');
  ctx.fillStyle = '#3a3760'; ctx.fillRect(0, 0, 160, 160);
  if (!avatar) { ctx.font = '64px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🙂', 80, 84); return; }
  const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, 160, 160); img.src = avatar;
}
showAvatar();
$('avatar-input').onchange = async (e) => { if (e.target.files[0]) { avatar = await fileToAvatar(e.target.files[0]); showAvatar(); } };

// ── 2 · Zeichenfläche ────────────────────────────────────
const draw = $('draw');
const dctx = draw.getContext('2d');
let pen = '#111';
let drawn = false;
function clearDraw() { dctx.fillStyle = '#fff'; dctx.fillRect(0, 0, 300, 300); drawn = false; }
clearDraw();
if (saved.art) { const i = new Image(); i.onload = () => { dctx.drawImage(i, 0, 0, 300, 300); drawn = true; }; i.src = saved.art; }
for (const c of ['#111', '#ff3d7f', '#3dc6ff', '#ffd23d', '#5cff8a', '#b47cff', '#ff8a3d', '#fff']) {
  const b = document.createElement('button');
  b.type = 'button'; b.style.background = c;
  b.onclick = () => { pen = c; document.querySelectorAll('#pens button').forEach((x) => x.classList.toggle('active', x === b)); };
  if (c === pen) b.classList.add('active');
  $('pens').append(b);
}
let last = null;
const pos = (e) => { const r = draw.getBoundingClientRect(); return [(e.clientX - r.left) * 300 / r.width, (e.clientY - r.top) * 300 / r.height]; };
draw.addEventListener('pointerdown', (e) => { draw.setPointerCapture(e.pointerId); last = pos(e); stroke(last); });
draw.addEventListener('pointermove', (e) => { if (last) stroke(pos(e)); });
draw.addEventListener('pointerup', () => { last = null; });
function stroke(p) {
  dctx.strokeStyle = pen; dctx.lineWidth = pen === '#fff' ? 24 : 8; dctx.lineCap = 'round';
  dctx.beginPath(); dctx.moveTo(...last); dctx.lineTo(...p); dctx.stroke();
  last = p; drawn = true;
}
$('draw-clear').onclick = clearDraw;
$('draw-upload').onchange = async (e) => {
  if (!e.target.files[0]) return;
  const i = new Image();
  i.onload = () => { dctx.drawImage(i, 0, 0, 300, 300); drawn = true; };
  i.src = await fileToAvatar(e.target.files[0]);
};

// ── 2 · Effekt-Baukasten ─────────────────────────────────
$('special-name').value = saved.specialName || '';
let effects = validateEffects(saved.effects) ?? [{ type: 'give', n: 2, target: 'next' }];

function renderEffects() {
  const box = $('effects');
  box.innerHTML = '';
  for (let i = 0; i < MAX_EFFECTS_PER_CARD; i++) {
    const e = effects[i];
    const row = document.createElement('div');
    row.className = 'fx-row';
    const type = select(
      [['', i === 0 ? '— Effekt wählen —' : '+ zweiter Effekt (optional)'], ...Object.entries(EFFECTS)
        .filter(([k]) => k === e?.type || !effects.some((x) => x.type === k)).map(([k, d]) => [k, d.label])],
      e?.type ?? '',
      (v) => {
        if (!v) effects.splice(i, 1);
        else {
          const d = EFFECTS[v];
          effects[i] = { type: v, ...(d.n && { n: d.n[0] }), ...(d.targets && { target: d.targets[0] }) };
        }
        renderEffects();
      });
    row.append(type);
    if (e && EFFECTS[e.type].n) {
      const [lo, hi] = EFFECTS[e.type].n;
      row.append(select(range(lo, hi).map((n) => [n, `${n}×`]), e.n, (v) => { e.n = Number(v); renderEffects(); }));
    }
    if (e && EFFECTS[e.type].targets) {
      row.append(select(EFFECTS[e.type].targets.map((t) => [t, TARGETS[t]]), e.target, (v) => { e.target = v; renderEffects(); }));
    }
    box.append(row);
    if (!e) break;
  }
  $('special-desc').textContent = effects.length ? '💣 ' + describe(effects) : 'Wähle mindestens einen Effekt.';
}
renderEffects();

function select(options, value, onChange) {
  const s = document.createElement('select');
  for (const [v, t] of options) { const o = document.createElement('option'); o.value = v; o.textContent = t; s.append(o); }
  s.value = value;
  s.onchange = () => onChange(s.value);
  return s;
}
function range(a, b) { return Array.from({ length: b - a + 1 }, (_, i) => a + i); }

// ── 3 · Beitreten ────────────────────────────────────────
const socket = connect('/karten');
let me = null, view = null, arts = {};
let selected = new Set();
let focus = 0;

// Feste Spieler-ID: überlebt Neuladen, Sperrbildschirm und Funkloch
const pid = localStorage.getItem('karten-pid') || (crypto.randomUUID?.() ?? String(Math.random()).slice(2));
localStorage.setItem('karten-pid', pid);
let lastJoin = null;

function join(roomName) {
  const name = $('name').value.trim();
  if (!name) { $('error').textContent = 'Erst deinen Namen eingeben (oben).'; $('name').focus(); return; }
  if (!effects.length) { $('error').textContent = 'Deine Karte braucht einen Effekt.'; return; }
  const art = drawn ? draw.toDataURL('image/jpeg', 0.75) : null;
  const specialName = $('special-name').value.trim();
  localStorage.setItem('karten-profile', JSON.stringify({ name, avatar, art, specialName, effects }));
  lastJoin = { pid, name, avatar, room: roomName, special: { name: specialName || `${name}s Bombe`, art, effects } };
  socket.emit('join', lastJoin, (res) => {
    if (res.error) { $('error').textContent = res.error; return; }
    me = res.id;
    lastJoin.room = res.room;
    clearInterval(tablePoll);
    history.replaceState(null, '', `?raum=${res.room}`);
    $('lobby').hidden = true;
    $('table').hidden = false;
    initControls();
  });
}
$('join').onclick = () => join($('room').value.trim() || `tisch-${Math.floor(Math.random() * 900 + 100)}`);

// Offene Tische anzeigen (alle 3 Sekunden aktualisiert)
async function loadTables() {
  try {
    const list = await (await fetch(SERVER + '/api/karten/tables')).json();
    const box = $('tables');
    box.innerHTML = '';
    if (!list.length) box.innerHTML = '<p class="hint">Noch kein Tisch offen – eröffne einen! 👇</p>';
    for (const t of list) {
      const full = t.players.length >= t.max;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tbl' + (full ? ' full' : '');
      b.innerHTML = '<span class="ic"></span><span class="tx"><b></b><small></small></span><span class="go"></span>';
      b.querySelector('.ic').textContent = t.state === 'playing' ? '🔥' : '🃏';
      b.querySelector('b').textContent = `${t.id} · ${t.players.length}/${t.max}`;
      b.querySelector('small').textContent = (t.state === 'playing' ? 'läuft – du steigst nächste Runde ein · ' : 'wartet auf Start · ') + t.players.join(', ');
      b.querySelector('.go').textContent = full ? 'voll' : 'Beitreten';
      b.onclick = () => join(t.id);
      box.append(b);
    }
  } catch { $('tables').innerHTML = '<p class="hint">Server wacht gerade auf … ⏳</p>'; }
}
const tablePoll = setInterval(loadTables, 3000);
loadTables();
// Nach automatischem Neuladen (neue Version) direkt wieder an den Tisch
const autojoin = sessionStorage.getItem('karten-autojoin');
if (autojoin) { sessionStorage.removeItem('karten-autojoin'); setTimeout(() => join(autojoin), 400); }
// Direktlink ?raum=xyz → Feld vorausfüllen
if ($('room').value) $('join').textContent = `➡️ ${$('room').value} beitreten`;

socket.on('arts', (a) => { arts = a; if (view) render(); });
socket.on('view', (v) => {
  const myTurnBefore = view?.turn === me;
  view = v;
  const ids = new Set(v.hand.map((c) => c.id));
  selected = new Set([...selected].filter((id) => ids.has(id)));
  focus = Math.min(focus, Math.max(0, v.hand.length - 1));
  render();
  if (!myTurnBefore && v.turn === me && v.state === 'playing') navigator.vibrate?.(60);
  if (v.state === 'playing' && v.game !== seenGame && v.drawn) { seenGame = v.game; $('ranking').hidden = true; playIntro(v); }
  if (v.state === 'over' && v.ranking && shownRanking !== v.game) { shownRanking = v.game; showRanking(v); }
});
let seenGame = 0, shownRanking = 0;
socket.on('disconnect', () => { if (me) toast('📵 Verbindung weg – verbinde neu …'); });
// Nach jedem (Wieder-)Verbinden automatisch zurück an denselben Platz
socket.on('connect', () => {
  if (!lastJoin || !me) return;
  socket.emit('join', lastJoin, (res) => { if (res.ok) toast('✅ Wieder da!'); });
});
// Neue Server-Version? Seite neu laden und automatisch wieder an den Tisch
let knownBuild = null;
socket.on('hello', ({ build }) => {
  if (knownBuild && build !== knownBuild) {
    if (lastJoin) sessionStorage.setItem('karten-autojoin', lastJoin.room);
    location.reload();
    return;
  }
  knownBuild = build;
});

// Aktion senden – war der Server „vergesslich“ (Neustart), erst wieder hinsetzen, dann nochmal
function act(event, data, onError = toast) {
  socket.emit(event, data, (res) => {
    if (res.rejoin && lastJoin) {
      return socket.emit('join', lastJoin, (j) => {
        if (!j.ok) return onError(j.error);
        socket.emit(event, data, (again) => again.error && onError(again.error));
      });
    }
    if (res.error) onError(res.error);
    else if (event === 'play') selected.clear();
  });
}

// ── Tisch zeichnen ───────────────────────────────────────
function render() {
  const v = view;
  // Gegenüber am Tisch: alle anderen im Halbkreis, in Spielreihenfolge ab dir
  $('players').innerHTML = '';
  const meIdx = Math.max(0, v.players.findIndex((p) => p.id === me));
  const others = [...v.players.slice(meIdx + 1), ...v.players.slice(0, meIdx)];
  others.forEach((p, i) => {
    const t = others.length === 1 ? 0.5 : i / (others.length - 1);
    const seat = document.createElement('div');
    seat.className = 'seat' + (p.id === v.turn ? ' turn' : '') + (p.inGame || v.state === 'lobby' ? '' : ' out');
    seat.style.left = `${12 + t * 76}%`;
    seat.style.top = `${10 + Math.sin(Math.PI * t) * -6 + 6}%`;
    const face = arts[p.id]?.avatar;
    seat.innerHTML = '<div class="face"></div><div class="nm"></div><div class="role"></div><div class="backs"></div>';
    if (face) seat.querySelector('.face').style.backgroundImage = `url("${face}")`;
    else seat.querySelector('.face').textContent = p.name.slice(0, 2).toUpperCase();
    seat.querySelector('.nm').textContent = p.name + (p.id === v.host ? ' 👑' : '');
    if (p.inGame) seat.querySelector('.nm').dataset.count = p.count;
    seat.querySelector('.role').textContent = p.role ? `${p.role.emoji} ${p.role.name}` : p.secret ? '❓ geheim' : (v.state === 'lobby' ? 'wartet …' : 'schaut zu');
    if (!p.connected) seat.querySelector('.role').textContent = '📵 weg …';
    if (p.inGame) {
      const backs = seat.querySelector('.backs');
      const n = Math.min(p.count, 7);
      for (let k = 0; k < n; k++) {
        const m = document.createElement('div');
        m.className = 'mini back-pattern';
        m.style.transform = `rotate(${(k - (n - 1) / 2) * 9}deg)`;
        backs.append(m);
      }
      const b = document.createElement('b'); b.textContent = p.count; backs.append(b);
    } else seat.querySelector('.backs').remove();
    $('players').append(seat);
  });

  // Deine Rolle + Host-Hinweis an den Ärmeln
  const mine = v.players.find((p) => p.id === me);
  $('pov').title = mine?.role ? `${mine.role.emoji} ${mine.role.name}: ${mine.role.text}` : '';

  // Stapel
  $('pile').innerHTML = '';
  if (!v.pile.length) $('pile').innerHTML = '<div class="empty">leer</div>';
  v.pile.forEach((c, i) => {
    const el = cardEl(c, arts);
    el.style.transform = `rotate(${(c.id * 37 % 21) - 10}deg) translate(${i * 3}px, ${i * 2}px)`;
    $('pile').append(el);
  });
  const dirArrow = v.dir === 1 ? '↻' : '↺';
  $('pile').querySelectorAll('.card').forEach((el) => { el.style.cursor = 'default'; });
  $('pile-info').textContent = v.state === 'playing'
    ? (v.top ? `Zu toppen: ${v.lower ? '≤' : '≥'} ${v.top}` : 'Alles geht!') + (v.sphere && v.top ? ` (oder ${v.top - 1})` : '') + `  ·  ${v.pileCount} im Stapel  ·  ${dirArrow}`
    : v.state === 'over' ? 'Runde vorbei' : `${v.players.length} am Tisch`;

  // ♊ freie Farben als Punkte hinter der Stapel-Info
  if (v.wild && v.state === 'playing') {
    const dots = document.createElement('span');
    dots.className = 'wild-dots';
    dots.title = 'Diese Farben passen gerade auf alles';
    for (const c of v.wild) { const d = document.createElement('i'); d.style.background = c; dots.append(d); }
    $('pile-info').append(' ♊', dots);
  }

  // Log (+ Ticker mit der letzten Aktion fürs Handy)
  $('ticker').textContent = v.log[v.log.length - 1] ?? '';
  $('log').innerHTML = '';
  for (const l of v.log) { const li = document.createElement('li'); li.textContent = l; $('log').append(li); }

  // Hand: Fächer zwischen deinen Händen
  const myTurn = v.turn === me && v.state === 'playing';
  $('hand').innerHTML = '';
  const n = v.hand.length;
  // Flacher Bogen über die verfügbare Breite: so viel Abstand wie möglich, max. 85 % Kartenbreite
  const cw = parseFloat(getComputedStyle($('table')).getPropertyValue('--cw')) || 124;
  const avail = Math.min($('table').clientWidth - 70, 1200);
  const stepX = n > 1 ? Math.min(cw * 0.85, (avail - cw) / (n - 1)) : 0;
  const half = ((n - 1) * stepX + cw) / 2;
  $('pov').style.setProperty('--fan-half', `${Math.max(half, cw)}px`);
  $('pov').classList.toggle('my-turn', myTurn);
  v.hand.forEach((c, i) => {
    const el = cardEl(c, arts);
    const t = n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0;   // -1 (links) … 1 (rechts)
    el.style.setProperty('--x', `${(i - (n - 1) / 2) * stepX}px`);
    el.style.setProperty('--y', `${t * t * 22}px`);
    el.style.setProperty('--r', `${t * 9}deg`);
    el.style.zIndex = i;
    if (selected.has(c.id)) el.classList.add('selected');
    if (myTurn && i === focus && usingPad) el.classList.add('focus');
    if (myTurn && !playable([c])) el.classList.add('dim');
    el.onclick = () => { focus = i; toggle(c); };
    $('hand').append(el);
  });
  $('turn-banner').classList.toggle('show', myTurn);

  // Erklärfeld: angetippte Special-Karte → was draufsteht und was sie macht
  const sel = selectedCards();
  const isCombo = isJesterCombo(sel);
  const sp = isCombo ? { emoji: '😆😢', name: JESTER_COMBO.name, text: JESTER_COMBO.text } : sel.length === 1 && sel[0].kind === 'special' ? sel[0] : null;
  $('explain').hidden = !sp;
  if (sp) {
    $('explain').innerHTML = '<b></b><span></span><small></small>';
    $('explain').querySelector('b').textContent = `${sp.emoji ?? ''} ${sp.name}${sp.title ? ' · ' + sp.title : ''}${sp.by ? ' (von ' + sp.by + ')' : ''}`;
    $('explain').querySelector('span').textContent = cardText(sp);
    $('explain').querySelector('small').textContent = sp.ability === 'potato' ? (myTurn ? '→ „Weitergeben“ drücken und Person wählen.' : 'Weitergeben, wenn du dran bist.')
      : sp.ability === 'luckyJester' && !isCombo ? 'Wirkt automatisch, solange du sie hältst.'
      : myTurn ? 'Passt auf jede Karte → „Legen“ drücken.' : 'Passt auf jede Karte – leg sie, wenn du dran bist.';
  }
  $('play').textContent = sel[0]?.ability === 'potato' ? '🥔 Weitergeben' : 'Legen ⬆️';

  // Knöpfe
  const isHost = v.host === me;
  $('start').hidden = !(isHost && v.state !== 'playing');
  $('start').textContent = v.state === 'over' ? '🔁 Nochmal' : '▶️ Spiel starten';
  $('start').disabled = v.players.length < 2;
  $('play').disabled = !myTurn || !selected.size || !playable(selectedCards());
  $('take').disabled = !myTurn || !v.pileCount;
  if (v.state === 'over' && v.winner) {
    const w = v.players.find((p) => p.id === v.winner);
    $('pile-info').textContent = `🏆 ${w?.name ?? '?'} gewinnt!`;
  }
}

// Gleiche Logik wie auf dem Server – nur damit man im Browser direkt sieht, was geht
function playable(cards) {
  if (!cards.length) return false;
  if (cards.some((c) => c.kind === 'special')) return cards.length === 1 || isJesterCombo(cards);
  if (cards.some((c) => c.value !== cards[0].value)) return false;
  const v = cards[0].value;
  if (!view.top) return true;
  if (view.wild && cards.every((c) => view.wild.includes(c.color))) return true;
  if (view.sphere && v === view.top - 1) return true;
  return view.lower ? v <= view.top : v >= view.top;
}
function isJesterCombo(cards) {
  return cards.length === 2 && cards.map((c) => c.ability).sort().join('+') === 'luckyJester+sadJester';
}
const selectedCards = () => view.hand.filter((c) => selected.has(c.id));

function toggle(c) {
  if (selected.has(c.id)) selected.delete(c.id);
  else {
    // Andere Zahl/Special gewählt? Dann neu anfangen statt mischen.
    const cur = selectedCards();
    const jesters = cur.length === 1 && isJesterCombo([cur[0], c]);
    if (cur[0] && !jesters && (c.kind === 'special' || cur[0].kind === 'special' || cur[0].value !== c.value)) selected.clear();
    selected.add(c.id);
  }
  render();
}

async function playSelected() {
  if (!selected.size) return;
  const cards = selectedCards();
  const ids = [...selected];
  const others = view.players.filter((p) => p.inGame && p.id !== me);
  let choice = {};
  if (isJesterCombo(cards)) {
    const a = await pick('😆 Wer mischt die ganze Hand neu?', others);
    if (!a) return;
    const b = await pick('😢 Wer zieht 3?', others.filter((p) => p.id !== a));
    if (!b) return;
    choice = { targets: [a, b] };
  } else if (cards[0].ability === 'potato') {
    let ok = others.filter((p) => p.id !== cards[0].cameFrom);
    if (!ok.length) ok = others;
    const t = await pick('🥔 An wen geht die Kartoffel? (zieht 3)', ok);
    if (!t) return;
    choice = { target: t };
  } else if (cards[0].ability === 'sadJester') {
    const t = await pick('😢 Wer soll mit dir weinen?', others);
    if (!t) return;
    choice = { target: t };
  } else if (cards[0].ability === 'twins') {
    const cs = await pickColors();
    if (!cs) return;
    choice = { colors: cs };
  }
  act('play', { ids, choice });
}

// Auswahlfenster: eine Person wählen
function pick(title, people) {
  return new Promise((resolve) => {
    const ov = $('picker');
    ov.hidden = false;
    ov.innerHTML = '<div class="intro-window"><h2></h2><div class="pick-list"></div><button class="cancel">Abbrechen</button></div>';
    ov.querySelector('h2').textContent = title;
    for (const p of people) {
      const b = document.createElement('button');
      b.className = 'pick';
      const face = arts[p.id]?.avatar;
      b.innerHTML = '<span class="pf"></span><b></b><small></small>';
      if (face) b.querySelector('.pf').style.backgroundImage = `url("${face}")`; else b.querySelector('.pf').textContent = p.name.slice(0, 2).toUpperCase();
      b.querySelector('b').textContent = p.name;
      b.querySelector('small').textContent = `${p.count} Karten`;
      b.onclick = () => { ov.hidden = true; resolve(p.id); };
      ov.querySelector('.pick-list').append(b);
    }
    ov.querySelector('.cancel').onclick = () => { ov.hidden = true; resolve(null); };
  });
}
// Auswahlfenster: zwei Farben wählen
function pickColors() {
  return new Promise((resolve) => {
    const ov = $('picker');
    const chosen = [];
    ov.hidden = false;
    ov.innerHTML = '<div class="intro-window"><h2>♊ Wähle zwei Farben</h2><p class="hint">Bis du wieder dran bist, passen sie auf jede Karte.</p><div class="pick-colors"></div><button class="cancel">Abbrechen</button></div>';
    for (const c of RULES.colors) {
      const b = document.createElement('button');
      b.className = 'pick-color';
      b.style.background = c;
      b.onclick = () => {
        if (chosen.includes(c)) return;
        chosen.push(c); b.classList.add('on');
        if (chosen.length === 2) { ov.hidden = true; resolve(chosen); }
      };
      ov.querySelector('.pick-colors').append(b);
    }
    ov.querySelector('.cancel').onclick = () => { ov.hidden = true; resolve(null); };
  });
}
const take = () => act('take', null);

let toastTimer;
function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 1600);
}

// ── Steuerung: Maus/Touch, Tastatur, Controller ──────────
let usingPad = false;
function initControls() {
  $('play').onclick = playSelected;
  $('take').onclick = take;
  $('start').onclick = () => act('start', null);

  addEventListener('keydown', (e) => {
    if (!view || e.target.tagName === 'INPUT') return;
    const n = view.hand.length;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { focus = (focus + 1) % n; usingPad = true; }
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { focus = (focus - 1 + n) % n; usingPad = true; }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { if (view.hand[focus]) toggle(view.hand[focus]); }
    else if (e.code === 'Space' || e.code === 'Enter') playSelected();
    else if (e.code === 'KeyT' || e.code === 'ArrowDown') take();
    else return;
    e.preventDefault();
    render();
  });

  // Controller: Steuerkreuz/Stick = Karte wählen, A = markieren, B = legen, X = Stapel nehmen
  const prev = {};
  (function poll() {
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad || !view) continue;
      const press = (name, on) => { const fire = on && !prev[name]; prev[name] = on; return fire; };
      const n = view.hand.length || 1;
      if (press('r', pad.buttons[15]?.pressed || pad.axes[0] > 0.6)) { focus = (focus + 1) % n; usingPad = true; render(); }
      if (press('l', pad.buttons[14]?.pressed || pad.axes[0] < -0.6)) { focus = (focus - 1 + n) % n; usingPad = true; render(); }
      if (press('a', pad.buttons[0]?.pressed) && view.hand[focus]) toggle(view.hand[focus]);
      if (press('b', pad.buttons[1]?.pressed)) playSelected();
      if (press('x', pad.buttons[2]?.pressed)) take();
      if (press('s', pad.buttons[9]?.pressed) && view.host === me) $('start').click();
    }
    requestAnimationFrame(poll);
  })();
}

// ═════════ Intro: Rolle drehen → Erklärung → Special-Karte auslosen ═════════

let introTimers = [];
function playIntro(v) {
  const myRole = v.players.find((p) => p.id === me)?.role;
  if (!myRole) return;
  introTimers.forEach(clearTimeout); introTimers = [];
  const ov = $('intro');
  ov.hidden = false;
  ov.innerHTML = `
    <div class="intro-step" id="step-role">
      <h2>Deine Rolle</h2>
      <div class="reel-window"><div class="reel" id="role-reel"></div></div>
    </div>`;
  // Slot-Walze: viele zufällige Rollen, ganz unten deine
  const keys = Object.keys(ROLES);
  const items = Array.from({ length: 28 }, () => keys[Math.floor(Math.random() * keys.length)]);
  items.push(myRole.key);
  const reel = $('role-reel');
  for (const k of items) {
    const d = document.createElement('div'); d.className = 'reel-item';
    d.textContent = `${ROLES[k].emoji} ${ROLES[k].name}`; reel.append(d);
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    reel.style.transform = `translateY(${-(items.length - 1) * 72}px)`;
  }));
  introTimers.push(setTimeout(() => { navigator.vibrate?.(80); showRoleCard(myRole, v); }, 2600));
}

function showRoleCard(role, v) {
  const ov = $('intro');
  ov.innerHTML = `
    <div class="intro-window">
      <div class="big-emoji"></div>
      <h2></h2>
      <p class="role-text"></p>
      <ul>
        <li>🎯 <b>Ziel:</b> Als Erste*r alle Karten loswerden.</li>
        <li>⬆️ Leg <b>gleich hoch oder höher</b> als die oberste Karte – mehrere Gleiche gehen zusammen.</li>
        <li>🗑️ Kannst du nicht? Dann <b>nimmst du den Stapel</b>.</li>
        <li>🏁 Sobald jemand keine Karten mehr hat, ist Schluss. Abgerechnet wird nach Kartenzahl – wer am meisten hat, ist Letzte*r.</li>
        <li>🤫 Deine Rolle ist <b>geheim</b>. Die anderen sehen sie erst am Ende.</li>
      </ul>
      <button class="skip" id="skip-role">Weiter ▶</button>
    </div>`;
  ov.querySelector('.big-emoji').textContent = role.emoji;
  ov.querySelector('h2').textContent = role.name;
  ov.querySelector('.role-text').textContent = role.text;
  $('skip-role').onclick = () => drawSpecial(v);
  introTimers.push(setTimeout(() => { if (!$('intro').hidden && $('skip-role')) drawSpecial(v); }, 9000));
}

function drawSpecial(v) {
  introTimers.forEach(clearTimeout); introTimers = [];
  const ov = $('intro');
  ov.innerHTML = `
    <div class="intro-step">
      <h2>Deine Special-Karte</h2>
      <div class="case-window"><div class="case-marker"></div><div class="case-strip" id="case-strip"></div></div>
      <div id="drawn-explain" class="explain-big"></div>
      <button class="skip" id="skip-intro" hidden>Los geht's ▶</button>
    </div>`;
  // Kisten-Öffnen: Streifen voller möglicher Specials rauscht vorbei und stoppt bei deiner
  const pool = [
    ...Object.entries(CHARACTERS).map(([key, c]) => ({ kind: 'special', key, ...c })),
    ...Object.entries(BASIC_SPECIALS).map(([key, c]) => ({ kind: 'special', key, ...c })),
    ...Object.entries(PLAYER_CARDS).map(([key, c]) => ({ kind: 'special', key, effects: [], ...c })),
  ];
  const strip = $('case-strip');
  const target = 30;
  const cw = 110, gap = 12;
  for (let i = 0; i < target + 4; i++) {
    const c = i === target ? v.drawn : pool[Math.floor(Math.random() * pool.length)];
    const el = cardEl({ ...c, id: 'i' + i }, arts);
    el.style.setProperty('--card-w', cw + 'px');
    if (i === target) el.classList.add('target');
    strip.append(el);
  }
  const winW = strip.parentElement.clientWidth;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    strip.style.transform = `translateX(${winW / 2 - (target * (cw + gap) + cw / 2) + (Math.random() * 40 - 20)}px)`;
  }));
  introTimers.push(setTimeout(() => {
    navigator.vibrate?.([60, 40, 120]);
    strip.querySelector('.target')?.classList.add('won');
    const ex = $('drawn-explain');
    ex.innerHTML = '<b></b><span></span>';
    ex.querySelector('b').textContent = `${v.drawn.emoji ?? ''} ${v.drawn.name}${v.drawn.title ? ' · ' + v.drawn.title : ''}${v.drawn.by ? ' (gebaut von ' + v.drawn.by + ')' : ''}`;
    ex.querySelector('span').textContent = cardText(v.drawn);
    $('skip-intro').hidden = false;
    $('skip-intro').onclick = closeIntro;
    introTimers.push(setTimeout(closeIntro, 6000));
  }, 3300));
}
function closeIntro() { introTimers.forEach(clearTimeout); introTimers = []; $('intro').hidden = true; }

// ═════════ Abrechnung am Spielende ═════════
function showRanking(v) {
  closeIntro();
  const box = $('ranking');
  box.hidden = false;
  box.innerHTML = '<div class="intro-window"><h2>🏁 Abrechnung</h2><ol class="rank"></ol><p class="hint"></p><button class="skip" id="close-ranking">Zum Tisch</button></div>';
  const medals = ['🥇', '🥈', '🥉'];
  v.ranking.forEach((r, i) => {
    const li = document.createElement('li');
    if (r.id === me) li.classList.add('me');
    const last = i === v.ranking.length - 1 && v.ranking.length > 1;
    li.innerHTML = '<span class="pos"></span><span class="who"></span><span class="cnt"></span>';
    li.querySelector('.pos').textContent = i === 0 ? '🏆' : last ? '💩' : medals[i] ?? `${i + 1}.`;
    li.querySelector('.who').textContent = `${r.name}${r.role ? ' · ' + r.role.emoji + ' ' + r.role.name : ''}`;
    li.querySelector('.cnt').textContent = i === 0 ? 'keine Karten!' : `${r.count} Karten`;
    box.querySelector('.rank').append(li);
  });
  box.querySelector('.hint').textContent = v.host === me ? 'Du bist Host – starte die nächste Runde unten.' : 'Der Host startet gleich die nächste Runde.';
  $('close-ranking').onclick = () => { box.hidden = true; };
}
