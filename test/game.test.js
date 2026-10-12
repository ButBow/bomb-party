// Läuft mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/game.js';
import { GAME, TILE } from '../shared/config.js';

const tick = (room, seconds) => { for (let t = 0; t < seconds; t += 1 / 30) room.update(1 / 30); };

test('Spieler*innen starten in verschiedenen Ecken', () => {
  const room = new Room('t');
  room.addPlayer('a', { name: 'A' });
  room.addPlayer('b', { name: 'B' });
  const [a, b] = room.players.values();
  assert.notDeepEqual([a.x, a.y], [b.x, b.y]);
});

test('Eigene Bombe trifft, wer stehen bleibt – Runde endet mit Sieg', () => {
  const room = new Room('t');
  room.addPlayer('a', { name: 'A' });
  room.addPlayer('b', { name: 'B' });
  room.setInput('a', { x: 0, y: 0, bomb: true });
  tick(room, GAME.bombFuse + 0.2);
  assert.equal(room.players.get('a').alive, false);
  assert.equal(room.state, 'roundOver');
  assert.equal(room.players.get('b').score, 1);
});

test('Explosion zerstört Kisten', () => {
  const room = new Room('t');
  room.addPlayer('a', { name: 'A' });
  room.grid[1][3] = TILE.CRATE;
  room.bombs.push({ id: 999, x: 2, y: 1, owner: 'x', range: 2, timer: 0 });
  room.update(1 / 30);
  assert.equal(room.grid[1][3], TILE.EMPTY);
});

test('Wände stoppen die Bewegung', () => {
  const room = new Room('t');
  room.addPlayer('a', { name: 'A' });
  room.setInput('a', { x: -1, y: 0 });       // links ist die Außenwand
  tick(room, 1);
  assert.equal(room.players.get('a').x, 1);
});
