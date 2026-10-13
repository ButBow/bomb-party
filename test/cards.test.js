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

// ── Spielerkarten ────────────────────────────────────────────
import { PLAYER_CARDS } from '../shared/cards.js';
const sp = (key) => ({ id: key + Math.random(), kind: 'special', key, effects: [], ...PLAYER_CARDS[key] });
const drawFx = (n, target = 'next') => ({ id: 'd' + Math.random(), kind: 'special', key: 'x', name: 'Zieh', emoji: '📥', effects: [{ type: 'draw', n, target }] });

test('🥔 Kartoffel kann nicht abgelegt, nur weitergereicht werden – Ziel zieht 3', () => {
  const r = table(3);
  for (const o of r.players) o.hand = [num(1)];
  const p = r.current();
  const potato = sp('kartoffel');
  p.hand = [potato, num(3), num(4)];
  const t = r.players.find((o) => o !== p);
  const before = t.hand.length;
  assert.ok(r.play(p.id, { ids: [potato.id], choice: {} }).error);           // ohne Ziel geht nicht
  assert.equal(r.play(p.id, { ids: [potato.id], choice: { target: t.id } }).ok, true);
  assert.equal(t.hand.length, before + 3 + 1);
  assert.equal(r.pile.includes(potato), false);
  assert.equal(potato.cameFrom, p.id);
});

test('🥔 Nicht zurück an die Person, von der man sie hat', () => {
  const r = table(3);
  const p = r.current();
  const potato = { ...sp('kartoffel'), cameFrom: r.players.find((o) => o !== p).id };
  p.hand = [potato, num(3)];
  assert.match(r.play(p.id, { ids: [potato.id], choice: { target: potato.cameFrom } }).error, /zurück/);
});

test('🥔 Wer sie hält, zieht dreifach und ist immun gegen Tausch', () => {
  const r = table(2);
  for (const o of r.players) o.hand = [num(1)];
  const p = r.current();
  const t = r.players.find((o) => o !== p);
  t.hand = [sp('kartoffel'), num(1)];
  const c = drawFx(2);
  p.hand = [c, num(5), num(6)];
  r.play(p.id, [c.id]);
  assert.equal(t.hand.length, 2 + 6);
  r.turn = r.players.indexOf(p);
  const swap = { id: 's', kind: 'special', key: 'x', name: 'Tausch', emoji: '🃏', effects: [{ type: 'swap', target: 'next' }] };
  p.hand = [swap, num(5)];
  const tHand = t.hand.length;
  r.play(p.id, ['s']);
  assert.equal(t.hand.length, tHand);
});

test('🥔 Letzte Karte = Sieg, alle anderen ziehen 3', () => {
  const r = table(3);
  for (const o of r.players) o.hand = [num(1), num(2)];
  const p = r.current();
  p.hand = [sp('kartoffel'), num(9)];
  r.top = 0;
  const others = r.players.filter((o) => o !== p).map((o) => [o, o.hand.length]);
  r.play(p.id, [p.hand.find((c) => c.kind === 'number').id]);
  assert.equal(r.state, 'over');
  assert.equal(r.winner, p.id);
  for (const [o, n] of others) assert.equal(o.hand.length, n + 3);
});

test('😆 Glücklicher Schelm wirft Ziehen auf den Angreifer zurück', () => {
  const r = table(2);
  for (const o of r.players) o.hand = [num(1)];
  const p = r.current();
  const t = r.players.find((o) => o !== p);
  t.hand = [sp('gluecklich'), num(1)];
  const c = drawFx(3);
  p.hand = [c, num(5)];
  r.play(p.id, [c.id]);
  assert.equal(t.hand.length, 1);         // Schelm verbraucht, nichts gezogen
  assert.equal(p.hand.length, 1 + 3);
});

test('😆 … aber nicht bei Effekten gegen alle', () => {
  const r = table(3);
  for (const o of r.players) o.hand = [num(1)];
  const p = r.current();
  const t = r.players.find((o) => o !== p);
  t.hand = [sp('gluecklich'), num(1)];
  const c = drawFx(2, 'all');
  p.hand = [c, num(5)];
  r.play(p.id, [c.id]);
  assert.equal(t.hand.length, 4);
});

test('♊ Zwillings-Parade kontert Ziehen: Nachbar*innen ziehen je die Hälfte', () => {
  const r = table(4);
  const p = r.current();
  for (const o of r.players) o.hand = [num(1), num(2)];
  const t = r.seatFrom(p, 1);
  t.hand = [sp('zwillinge'), num(1)];
  const c = drawFx(4);
  p.hand = [c, num(5)];
  r.play(p.id, [c.id]);
  assert.equal(t.hand.length, 1);
  assert.equal(p.hand.length, 1 + 2);                          // p sitzt neben t
  assert.equal(r.seatFrom(t, 1).hand.length, 2 + 2);
});

test('♊ Aktiv: zwei Farben passen auf alles, bis man wieder dran ist', () => {
  const r = table(2);
  const p = r.current();
  const tw = sp('zwillinge');
  p.hand = [tw, num(5)];
  r.top = 12;
  const [c1, c2] = RULES.colors;
  assert.equal(r.play(p.id, { ids: [tw.id], choice: { colors: [c1, c2] } }).ok, true);
  const q = r.current();
  q.hand = [{ ...num(2), color: c1 }, num(3)];
  assert.equal(r.play(q.id, [q.hand[0].id]).ok, true);   // 2 auf 12, weil freie Farbe
  assert.equal(r.wild, null);                              // p wieder dran → vorbei
});

test('😢 Trauriger Schelm: Ziel zieht so viele, wie man danach hält', () => {
  const r = table(2);
  for (const o of r.players) o.hand = [num(1)];
  const p = r.current();
  const t = r.players.find((o) => o !== p);
  const sad = sp('traurig');
  p.hand = [sad, num(1), num(2), num(3), num(4)];
  const before = t.hand.length;
  assert.equal(r.play(p.id, { ids: [sad.id], choice: { target: t.id } }).ok, true);
  assert.equal(t.hand.length, before + 4);
});

test('😆😢 Lachen und Weinen: beide Schelme zusammen', () => {
  const r = table(3);
  const p = r.current();
  const [a, b] = r.players.filter((o) => o !== p);
  a.hand = [num(1), num(2), num(3)]; b.hand = [num(4)];
  const lucky = sp('gluecklich'), sad = sp('traurig');
  p.hand = [lucky, sad, num(7)];
  const aCount = a.hand.length, bCount = b.hand.length, aIds = a.hand.map((c) => c.id).join();
  assert.equal(r.play(p.id, { ids: [lucky.id, sad.id], choice: { targets: [a.id, b.id] } }).ok, true);
  assert.equal(a.hand.length, aCount);
  assert.notEqual(a.hand.map((c) => c.id).join(), aIds);
  assert.equal(b.hand.length, bCount + 3);
});

test('🎲 Kriege 4 oder verliere 4 – beide Ausgänge', () => {
  const real = Math.random;
  try {
    for (const [roll, delta] of [[0.1, +4 - 1], [0.9, -4 - 1]]) {
      const r = table(2);
      for (const o of r.players) o.hand = [num(1)];
      const p = r.current();
      const g = sp('gluecksspiel');
      p.hand = [g, ...[2, 3, 4, 5, 6, 7].map(num)];
      const before = p.hand.length;
      Math.random = () => roll;
      r.play(p.id, [g.id]);
      Math.random = real;
      assert.equal(p.hand.length, before + delta);
      assert.ok(r.lastFx.text.includes(roll < 0.5 ? 'KRIEGE' : 'VERLIERE'));
    }
  } finally { Math.random = real; }
});

test('🎲 Wer dabei alle Karten verliert, gewinnt', () => {
  const r = table(2);
  for (const o of r.players) o.hand = [num(1)];
  const p = r.current();
  const g = sp('gluecksspiel');
  p.hand = [g, num(2), num(3)];
  const real = Math.random; Math.random = () => 0.9;
  try { r.play(p.id, [g.id]); } finally { Math.random = real; }
  assert.equal(r.state, 'over');
  assert.equal(r.winner, p.id);
});

test('💬 Chat: Text wird gekürzt, Spam gebremst', () => {
  const r = table(2);
  const m = r.chatSay('p0', '  hallo   welt  ' + 'x'.repeat(300));
  assert.equal(m.text.length, 200);
  assert.ok(m.text.startsWith('hallo welt'));
  assert.equal(r.chatSay('p0', 'nochmal'), null);
  assert.equal(r.chatSay('niemand', 'hi'), null);
});
