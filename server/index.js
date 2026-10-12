// Webserver + Multiplayer. Liefert die Seite aus und hält die Räume am Laufen.

import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Room } from './game.js';
import { CardRoom } from './cards/game.js';
import { CHARACTERS } from '../shared/cards.js';
import { GAME, BRAND } from '../shared/config.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const app = express();
app.use(express.static(root + 'public'));
app.use('/shared', express.static(root + 'shared'));

// Bilder der Charakterkarten: liegen in data/card-art/ (nicht im Repo!)
const artDir = root + 'data/card-art/';
mkdirSync(artDir, { recursive: true });
app.use('/card-art', express.static(artDir, { maxAge: 0 }));
app.post('/api/card-art/:key', express.json({ limit: '2mb' }), (req, res) => {
  const { key } = req.params;
  const m = /^data:image\/jpeg;base64,(.+)$/.exec(req.body?.image || '');
  if (!CHARACTERS[key] || !m) return res.status(400).json({ error: 'Ungültig' });
  writeFileSync(artDir + key + '.jpg', Buffer.from(m[1], 'base64'));
  res.json({ ok: true });
});

const http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 1_000_000 });
const rooms = new Map();

const MAX_AVATAR = 200_000; // ~200 KB als Data-URL reicht für 256×256 JPEG locker

io.on('connection', (socket) => {
  let room = null;

  socket.on('join', (data = {}, ack = () => {}) => {
    if (room) return ack({ error: 'Schon in einem Raum.' });
    const roomId = String(data.room || 'lobby').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'lobby';
    const name = String(data.name || 'Anonym').trim().slice(0, 16) || 'Anonym';
    const color = BRAND.playerColors.includes(data.color) ? data.color : BRAND.playerColors[0];
    const avatar = typeof data.avatar === 'string' && data.avatar.startsWith('data:image/')
      && data.avatar.length < MAX_AVATAR ? data.avatar : null;

    const r = rooms.get(roomId) ?? new Room(roomId);
    const res = r.addPlayer(socket.id, { name, color, avatar });
    if (res.error) return ack(res);
    rooms.set(roomId, r);
    room = r;
    socket.join(roomId);
    ack({ ok: true, id: socket.id, room: roomId });
    io.to(roomId).emit('avatars', room.avatars());
  });

  socket.on('input', (input) => room?.setInput(socket.id, input));

  socket.on('disconnect', () => {
    if (!room) return;
    room.removePlayer(socket.id);
    if (room.players.size === 0) rooms.delete(room.id);
    else io.to(room.id).emit('avatars', room.avatars());
  });
});

// ── Kartenspiel „TOPP DAS!“ (eigener Kanal /karten) ──────────
const cardRooms = new Map();
const cards = io.of('/karten');

cards.on('connection', (socket) => {
  let room = null;
  const sync = () => {
    if (!room) return;
    for (const p of room.players) cards.to(p.id).emit('view', room.view(p.id));
  };
  const act = (fn) => (data, ack = () => {}) => {
    if (!room) return ack({ error: 'Nicht im Raum.' });
    const res = fn(data);
    ack(res);
    if (res.ok) sync();
  };

  socket.on('join', (data = {}, ack = () => {}) => {
    if (room) return ack({ error: 'Schon in einem Raum.' });
    const roomId = String(data.room || 'tisch').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'tisch';
    const img = (v) => (typeof v === 'string' && v.startsWith('data:image/') && v.length < MAX_AVATAR ? v : null);
    const r = cardRooms.get(roomId) ?? new CardRoom(roomId);
    const res = r.addPlayer(socket.id, {
      name: String(data.name || 'Anonym').trim().slice(0, 16) || 'Anonym',
      avatar: img(data.avatar),
      special: { name: data.special?.name, art: img(data.special?.art), effects: data.special?.effects },
    });
    if (res.error) return ack(res);
    cardRooms.set(roomId, r);
    room = r;
    ack({ ok: true, id: socket.id, room: roomId });
    cards.to(roomId).emit('arts', room.arts());
    socket.join(roomId);
    socket.emit('arts', room.arts());
    sync();
  });

  socket.on('start', act(() => room.start(socket.id)));
  socket.on('play', act((ids) => room.play(socket.id, ids)));
  socket.on('take', act(() => room.take(socket.id)));

  socket.on('disconnect', () => {
    if (!room) return;
    room.removePlayer(socket.id);
    if (!room.players.length) cardRooms.delete(room.id);
    else { cards.to(room.id).emit('arts', room.arts()); sync(); }
  });
});

// Spiel-Schleife: alle Räume updaten und den Zustand verschicken
const dt = 1 / GAME.tickRate;
setInterval(() => {
  for (const room of rooms.values()) {
    room.update(dt);
    io.to(room.id).volatile.emit('state', room.snapshot());
  }
}, 1000 * dt);

const PORT = Number(process.env.PORT) || 3000;
http.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎮 ${BRAND.title} läuft!\n`);
  console.log(`   Auf diesem Rechner:  http://localhost:${PORT}`);
  for (const nets of Object.values(networkInterfaces())) {
    for (const n of nets ?? []) {
      if (n.family === 'IPv4' && !n.internal) console.log(`   Im selben WLAN:      http://${n.address}:${PORT}`);
    }
  }
  console.log('');
});
