// Tests für das Kartenspiel „TOPP DAS!“ – läuft mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CardRoom } from '../server/cards/game.js';
import { RULES, ROLES } from '../shared/cards.js';

function table(n = 3) {
  const r = new CardRoom('t');
  for (let i = 0; i < n; i++) r.addPlayer('p' + i, { name: 'P' + i, special: { effects: [{ type: 'reset' }] } });
  assert.equal(r.start('p0').ok, true);
  r.introUntil = 0;   // Intro-Animation im Test überspringen
  return r;
}
const num = (value) => ({ id: Math.random(), kind: 'number', value, color: '#fff' });

test('Jede*r bekommt genau eine Special-Karte und eine Rolle', () => {
  const r = table(5);
  for (const p of r.players) {
    assert.equal(p.hand.filter((c) => c.kind === 'special').length, 1);
    assert.equal(p.hand.length, RULES.handSize + ROLES[p.role].cards);
  }
});

test('Rollen sind geheim – nur die eigene ist sichtbar', () => {
  const v = table(3).view('p0');
  assert.ok(v.players.find((p) => p.id === 'p0').role);
  assert.equal(v.players.find((p) => p.id === 'p1').role, null);
  assert.equal(v.players.find((p) => p.id === 'p1').secret, true);
});

test('Man muss gleich hoch oder höher legen', () => {
  const r = table(2);
  const p = r.current();
  p.hand = [num(3), num(9), num(9)];
  r.top = 5;
  assert.match(r.play(p.id, [p.hand[0].id]).error, /≥ 5/);
  assert.equal(r.play(p.id, [p.hand[1].id, p.hand[2].id]).ok, true);   // zwei Neunen zusammen
  assert.equal(r.top, 9);
  assert.notEqual(r.current().id, p.id);                                 // nächste Person dran
});

test('Wer nicht kann, nimmt den Stapel', () => {
  const r = table(2);
  const p = r.current();
  r.pile = [num(10), num(12)];
  r.top = 12;
  const before = p.hand.length;
  assert.equal(r.take(p.id).ok, true);
  assert.equal(p.hand.length, before + 2);
  assert.equal(r.top, 0);
});

test('Spielende: Erste*r ohne Karten gewinnt, Rest nach Kartenzahl', () => {
  const r = table(3);
  const p = r.current();
  p.hand = [num(15)];
  r.top = 0;
  const others = r.players.filter((o) => o !== p);
  others[0].hand = [num(1), num(2), num(3), num(4)];
  others[1].hand = [num(1)];
  r.play(p.id, [p.hand[0].id]);
  assert.equal(r.state, 'over');
  assert.equal(r.winner, p.id);
  assert.deepEqual(r.ranking.map((x) => x.id), [p.id, others[1].id, others[0].id]);
});

test('Nicht dran → kein Zug', () => {
  const r = table(3);
  const notMe = r.players.find((o) => o !== r.current());
  assert.match(r.play(notMe.id, [notMe.hand[0].id]).error, /nicht dran/);
});

test('Verbindung weg und zurück: Platz und Karten bleiben', () => {
  const r = table(3);
  const p = r.players[1];
  const hand = p.hand.map((c) => c.id);
  r.disconnect(p.id);
  assert.equal(r.players.length, 3);
  r.addPlayer(p.id, { name: p.name });
  assert.deepEqual(p.hand.map((c) => c.id), hand);
  assert.equal(p.connected, true);
});

test('Wer weg ist und dran wäre, wird nach Wartezeit übersprungen', () => {
  const r = table(3);
  const p = r.current();
  r.disconnect(p.id);
  assert.equal(r.tick(Date.now() + 1000), false);
  assert.equal(r.tick(Date.now() + (RULES.awaySkipSeconds + 1) * 1000), true);
  assert.notEqual(r.current().id, p.id);
});

test('Während der Intro-Animation darf niemand ziehen', () => {
  const r = table(2);
  r.introUntil = Date.now() + 5000;
  const p = r.current();
  assert.match(r.play(p.id, [p.hand[0].id]).error, /warten/);
});

test('Effekt „Unter“: nächste Person muss niedriger legen', () => {
  const r = table(2);
  const p = r.current();
  p.hand = [{ id: 'u', kind: 'special', key: 'lower', name: 'Unter', emoji: '⬇️', effects: [{ type: 'lower' }] }, num(1)];
  r.top = 8;
  r.play(p.id, ['u']);
  const q = r.current();
  q.hand = [num(12), num(4)];
  assert.ok(r.play(q.id, [q.hand[0].id]).error);
  assert.equal(r.play(q.id, [q.hand[1].id]).ok, true);
});

test('Niemand bekommt die eigene selbst gebaute Karte', () => {
  for (let run = 0; run < 50; run++) {
    const r = table(4);
    for (const p of r.players) assert.notEqual(p.drawn.owner, p.id);
  }
});
