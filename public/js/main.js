// Startpunkt im Browser: Lobby → Verbinden → Eingaben senden → Zeichnen.

import { BRAND } from '/shared/config.js';
import { initInput, readInput } from './input.js';
import { fileToAvatar, avatarImage } from './avatar.js';
import { resize, draw } from './render.js';

const $ = (id) => document.getElementById(id);

// ── Branding ─────────────────────────────────────────────
document.title = BRAND.title;
$('title').textContent = BRAND.title;
$('tagline').textContent = BRAND.tagline;
document.documentElement.style.setProperty('--accent', BRAND.colors.accent);
document.documentElement.style.setProperty('--bg', BRAND.colors.background);

// ── Lobby ────────────────────────────────────────────────
const saved = JSON.parse(localStorage.getItem('profile') || '{}');
let avatar = saved.avatar || null;
let color = saved.color || BRAND.playerColors[Math.floor(Math.random() * BRAND.playerColors.length)];
$('name').value = saved.name || '';
$('room').value = new URLSearchParams(location.search).get('raum') || '';

for (const c of BRAND.playerColors) {
  const b = document.createElement('button');
  b.style.background = c;
  b.onclick = () => { color = c; renderColors(); preview(); };
  b.dataset.color = c;
  $('colors').append(b);
}
const renderColors = () => document.querySelectorAll('#colors button')
  .forEach((b) => b.classList.toggle('active', b.dataset.color === color));
renderColors();

function preview() {
  const ctx = $('avatar-preview').getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, 160, 160);
  if (!avatar) {
    ctx.fillStyle = '#fff'; ctx.font = '64px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🙂', 80, 84);
    return;
  }
  const img = new Image();
  img.onload = () => ctx.drawImage(img, 0, 0, 160, 160);
  img.src = avatar;
}
preview();

$('avatar-input').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  avatar = await fileToAvatar(file);
  preview();
};

$('play').onclick = () => {
  const name = $('name').value.trim() || 'Anonym';
  localStorage.setItem('profile', JSON.stringify({ name, color, avatar }));
  socket.emit('join', { name, color, avatar, room: $('room').value.trim() }, (res) => {
    if (res.error) { $('error').textContent = res.error; return; }
    me = res.id;
    if (res.room !== 'lobby') history.replaceState(null, '', `?raum=${res.room}`);
    $('lobby').hidden = true;
    $('game').hidden = false;
    startGame();
  });
};

// ── Netzwerk ─────────────────────────────────────────────
const socket = io();
let me = null;
let state = null;
let faces = {};
socket.on('state', (s) => { state = s; });
socket.on('avatars', (a) => { faces = a; });
socket.on('disconnect', () => { $('error').textContent = 'Verbindung weg – Seite neu laden.'; });

// ── Spiel-Schleife ───────────────────────────────────────
function startGame() {
  initInput();
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  let T = resize(canvas);
  addEventListener('resize', () => { T = resize(canvas); });

  const view = new Map(); // geglättete Positionen pro Spieler
  let last = performance.now();
  let lastSent = '';

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    // Eingabe nur senden, wenn sie sich geändert hat
    const input = readInput();
    const key = `${input.x.toFixed(2)},${input.y.toFixed(2)},${input.bomb}`;
    if (key !== lastSent) { socket.emit('input', input); lastSent = key; }

    if (state) {
      // Weiches Hinterherziehen statt Ruckeln zwischen den Server-Updates
      for (const p of state.players) {
        let v = view.get(p.id);
        if (!v || Math.hypot(v.x - p.x, v.y - p.y) > 2) { v = { x: p.x, y: p.y, vx: 0, vy: 0 }; view.set(p.id, v); }
        const k = Math.min(1, dt * 18);
        v.vx = (p.x - v.x) * k; v.vy = (p.y - v.y) * k;
        v.x += v.vx; v.y += v.vy;
      }
      draw(ctx, T, state, view, me, (id) => avatarImage(id, faces[id]), now);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
