// „TOPP DAS!“ im Browser: Lobby, Bomben-Karten-Baukasten, Tisch.

import { CARD_BRAND, EFFECTS, TARGETS, MAX_EFFECTS_PER_CARD, describe, validateEffects } from '/shared/cards.js';
import { fileToAvatar } from '/js/avatar.js';
import { cardEl } from './card-ui.js';
import { connect } from '/js/net.js';

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

$('join').onclick = () => {
  const name = $('name').value.trim() || 'Anonym';
  if (!effects.length) { $('error').textContent = 'Deine Karte braucht einen Effekt.'; return; }
  const art = drawn ? draw.toDataURL('image/jpeg', 0.75) : null;
  const specialName = $('special-name').value.trim();
  localStorage.setItem('karten-profile', JSON.stringify({ name, avatar, art, specialName, effects }));
  socket.emit('join', {
    name, avatar, room: $('room').value.trim(),
    special: { name: specialName || `${name}s Bombe`, art, effects },
  }, (res) => {
    if (res.error) { $('error').textContent = res.error; return; }
    me = res.id;
    if (res.room !== 'tisch') history.replaceState(null, '', `?raum=${res.room}`);
    $('lobby').hidden = true;
    $('table').hidden = false;
    initControls();
  });
};

socket.on('arts', (a) => { arts = a; if (view) render(); });
socket.on('view', (v) => {
  const myTurnBefore = view?.turn === me;
  view = v;
  const ids = new Set(v.hand.map((c) => c.id));
  selected = new Set([...selected].filter((id) => ids.has(id)));
  focus = Math.min(focus, Math.max(0, v.hand.length - 1));
  render();
  if (!myTurnBefore && v.turn === me && v.state === 'playing') { toast('Du bist dran!'); navigator.vibrate?.(60); }
});
socket.on('disconnect', () => toast('Verbindung weg – Seite neu laden.'));

// ── Tisch zeichnen ───────────────────────────────────────
function render() {
  const v = view;
  // Spieler*innen
  $('players').innerHTML = '';
  for (const p of v.players) {
    const el = document.createElement('div');
    el.className = 'pl' + (p.id === v.turn ? ' turn' : '') + (p.inGame || v.state === 'lobby' ? '' : ' out');
    const face = arts[p.id]?.avatar;
    el.innerHTML = face ? `<img alt="">` : `<div class="face"></div>`;
    if (face) el.querySelector('img').src = face; else el.querySelector('.face').textContent = p.name.slice(0, 2).toUpperCase();
    const info = document.createElement('div');
    info.innerHTML = '<b></b><small></small>';
    info.querySelector('b').textContent = p.name + (p.id === me ? ' (du)' : '') + (p.id === v.host ? ' 👑' : '');
    info.querySelector('small').textContent = p.role ? `${p.role.emoji} ${p.role.name}` : (v.state === 'lobby' ? 'wartet …' : 'schaut zu');
    el.append(info);
    if (p.inGame) { const c = document.createElement('span'); c.className = 'count'; c.textContent = `🂠${p.count}`; el.append(c); }
    $('players').append(el);
  }

  // Stapel
  $('pile').innerHTML = '';
  if (!v.pile.length) $('pile').innerHTML = '<div class="empty">leer</div>';
  v.pile.forEach((c, i) => {
    const el = cardEl(c, arts);
    el.style.transform = `rotate(${(c.id * 37 % 21) - 10}deg) translate(${i * 3}px, ${i * 2}px)`;
    $('pile').append(el);
  });
  const dirArrow = v.dir === 1 ? '↻' : '↺';
  $('pile-info').textContent = v.state === 'playing'
    ? (v.top ? `Zu toppen: ${v.lower ? '≤' : '≥'} ${v.top}` : 'Alles geht!') + `  ·  ${v.pileCount} im Stapel  ·  ${dirArrow}`
    : v.state === 'over' ? 'Runde vorbei' : `${v.players.length} am Tisch`;

  // Log
  $('log').innerHTML = '';
  for (const l of v.log) { const li = document.createElement('li'); li.textContent = l; $('log').append(li); }

  // Hand
  const myTurn = v.turn === me && v.state === 'playing';
  $('hand').innerHTML = '';
  v.hand.forEach((c, i) => {
    const el = cardEl(c, arts);
    if (selected.has(c.id)) el.classList.add('selected');
    if (myTurn && i === focus && usingPad) el.classList.add('focus');
    if (myTurn && !playable([c])) el.classList.add('dim');
    el.onclick = () => { focus = i; toggle(c); };
    $('hand').append(el);
  });

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
