// „TOPP DAS!“ im Browser: Lobby, Bomben-Karten-Baukasten, Tisch.

import { CARD_BRAND, EFFECTS, TARGETS, MAX_EFFECTS_PER_CARD, describe, validateEffects } from '/shared/cards.js';
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

function join(roomName) {
  const name = $('name').value.trim();
  if (!name) { $('error').textContent = 'Erst deinen Namen eingeben (oben).'; $('name').focus(); return; }
  if (!effects.length) { $('error').textContent = 'Deine Karte braucht einen Effekt.'; return; }
  const art = drawn ? draw.toDataURL('image/jpeg', 0.75) : null;
  const specialName = $('special-name').value.trim();
  localStorage.setItem('karten-profile', JSON.stringify({ name, avatar, art, specialName, effects }));
  socket.emit('join', {
    name, avatar, room: roomName,
    special: { name: specialName || `${name}s Bombe`, art, effects },
  }, (res) => {
    if (res.error) { $('error').textContent = res.error; return; }
    me = res.id;
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
});
socket.on('disconnect', () => toast('Verbindung weg – Seite neu laden.'));

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
    seat.querySelector('.role').textContent = p.role ? `${p.role.emoji} ${p.role.name}` : (v.state === 'lobby' ? 'wartet …' : 'schaut zu');
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
    ? (v.top ? `Zu toppen: ${v.lower ? '≤' : '≥'} ${v.top}` : 'Alles geht!') + `  ·  ${v.pileCount} im Stapel  ·  ${dirArrow}`
    : v.state === 'over' ? 'Runde vorbei' : `${v.players.length} am Tisch`;

  // Log (+ Ticker mit der letzten Aktion fürs Handy)
  $('ticker').textContent = v.log[v.log.length - 1] ?? '';
  $('log').innerHTML = '';
  for (const l of v.log) { const li = document.createElement('li'); li.textContent = l; $('log').append(li); }

  // Hand: Fächer zwischen deinen Händen
  const myTurn = v.turn === me && v.state === 'playing';
  $('hand').innerHTML = '';
  const n = v.hand.length;
  const spread = Math.min(80, n * 7);                       // Gesamtwinkel des Fächers
  const step = n > 1 ? spread / (n - 1) : 0;
  const cw = parseFloat(getComputedStyle($('pov')).getPropertyValue('--cw')) || 104;
  const radius = cw <= 80 ? 170 : 240;
  const half = Math.sin((spread / 2) * Math.PI / 180) * (radius + cw * 1.4) + cw / 2;
  $('pov').style.setProperty('--fan-half', `${Math.max(half, cw)}px`);
  $('pov').classList.toggle('my-turn', myTurn);
  v.hand.forEach((c, i) => {
    const el = cardEl(c, arts);
    const angle = -spread / 2 + i * step;
    const lift = selected.has(c.id) ? 34 : 0;
    el.style.transform = `rotate(${angle}deg) translateY(${-lift}px)`;
    el.style.zIndex = i;
    if (selected.has(c.id)) el.classList.add('selected');
    if (myTurn && i === focus && usingPad) el.classList.add('focus');
    if (myTurn && !playable([c])) el.classList.add('dim');
    el.onclick = () => { focus = i; toggle(c); };
    $('hand').append(el);
  });
  $('turn-banner').classList.toggle('show', myTurn);

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
  if (cards[0].kind === 'special') return cards.length === 1;
  if (cards.some((c) => c.kind !== 'number' || c.value !== cards[0].value)) return false;
  const v = cards[0].value;
  return !view.top || (view.lower ? v <= view.top : v >= view.top);
}
const selectedCards = () => view.hand.filter((c) => selected.has(c.id));

function toggle(c) {
  if (selected.has(c.id)) selected.delete(c.id);
  else {
    // Andere Zahl/Special gewählt? Dann neu anfangen statt mischen.
    const cur = selectedCards()[0];
    if (cur && (c.kind === 'special' || cur.kind === 'special' || cur.value !== c.value)) selected.clear();
    selected.add(c.id);
  }
  render();
}

function playSelected() {
  if (!selected.size) return;
  socket.emit('play', [...selected], (res) => { if (res.error) toast(res.error); else selected.clear(); });
}
const take = () => socket.emit('take', null, (res) => res.error && toast(res.error));

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
  $('start').onclick = () => socket.emit('start', null, (res) => res.error && toast(res.error));

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
