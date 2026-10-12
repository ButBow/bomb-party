// Webserver + Multiplayer. Liefert die Seite aus und hält die Räume am Laufen.

import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { Room } from './game.js';
import { GAME, BRAND } from '../shared/config.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const app = express();
app.use(express.static(root + 'public'));
app.use('/shared', express.static(root + 'shared'));

const http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 300_000 });
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
