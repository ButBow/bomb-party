// „TOPP DAS!“ – die komplette Spiellogik. Läuft nur auf dem Server.
// Jede*r bekommt eine eigene Sicht (view): die eigene Hand ganz, von den anderen nur die Anzahl.

import { RULES, BASIC_SPECIALS, CHARACTERS, ROLES, EFFECTS, describe, validateEffects } from '../../shared/cards.js';

let nextCardId = 1;
const card = (props) => ({ id: nextCardId++, ...props });

export class CardRoom {
  constructor(id) {
    this.id = id;
    this.players = [];        // Sitzreihenfolge = Spielreihenfolge im Uhrzeigersinn
    this.state = 'lobby';     // 'lobby' | 'playing' | 'over'
    this.log = [];
    this.reset();
  }

  reset() {
    this.deck = [];
    this.pile = [];
    this.top = 0;             // Wert, der getoppt werden muss (0 = alles geht)
    this.lower = false;       // „Unter“ aktiv: nächste Karte muss ≤ top sein
    this.dir = 1;             // 1 = Uhrzeigersinn, -1 = andersrum
    this.turn = 0;            // Index in this.players
    this.winner = null;
  }

  // ── Leute ──────────────────────────────────────────────────
  addPlayer(id, { name, avatar, special }) {
    if (this.players.length >= RULES.maxPlayers) return { error: 'Raum ist voll.' };
    const effects = validateEffects(special?.effects) ?? [{ type: 'reset' }];
    this.players.push({
      id, name, avatar, hand: [], role: null, inGame: false,
      special: { name: String(special?.name || `${name}s Bombe`).slice(0, 24), art: special?.art || null, effects },
    });
    this.say(`${name} ist da.`);
    return { ok: true };
  }

  removePlayer(id) {
    const i = this.players.findIndex((p) => p.id === id);
    if (i < 0) return;
    const [p] = this.players.splice(i, 1);
    this.say(`${p.name} ist weg.`);
    if (this.state !== 'playing') return;
    if (i < this.turn) this.turn--;
    if (this.turn >= this.players.length) this.turn = 0;
    if (this.active().length < 2) this.finish(this.active()[0] ?? null);
    else if (!this.current().inGame) this.advance(1);
  }

  // ── Spielstart ────────────────────────────────────────────
  start(byId) {
    if (this.state === 'playing') return { error: 'Läuft schon.' };
    if (this.players[0]?.id !== byId) return { error: 'Nur der Host startet.' };
    if (this.players.length < 2) return { error: 'Mindestens 2 Leute.' };
    this.reset();
    this.state = 'playing';
    this.log = [];

    // Deck bauen: Zahlenkarten (bei vielen Leuten doppelt) + Specials + Charaktere
    const copies = this.players.length > 4 ? 2 : 1;
    for (let c = 0; c < copies; c++) {
      for (const color of RULES.colors) {
        for (let v = RULES.minValue; v <= RULES.maxValue; v++) this.deck.push(card({ kind: 'number', value: v, color }));
      }
      for (const [key, count] of Object.entries(RULES.basicSpecialsPerDeck)) {
        for (let i = 0; i < count; i++) this.deck.push(basicCard(key));
      }
    }
    for (const [key, ch] of Object.entries(CHARACTERS)) {
      this.deck.push(card({ kind: 'special', key, name: ch.name, title: ch.title, emoji: ch.emoji, effects: ch.effects, art: `/card-art/${key}.jpg` }));
    }
    shuffle(this.deck);

    // Rollen verteilen, dann austeilen
    for (const p of this.players) {
      p.inGame = true;
      p.role = pickRole();
      const role = ROLES[p.role];
      p.hand = [
        card({ kind: 'special', key: 'custom', owner: p.id, name: p.special.name, emoji: '💣', effects: p.special.effects }),
        ...role.bonus.map(basicCard),
      ];
      while (p.hand.length < RULES.handSize + role.cards && this.deck.length) p.hand.push(this.deck.pop());
      sortHand(p.hand);
    }
    this.turn = Math.floor(Math.random() * this.players.length);
    this.say(`Neues Spiel! ${this.current().name} fängt an.`);
    return { ok: true };
  }

  // ── Züge ───────────────────────────────────────────────────
  play(id, cardIds) {
    const p = this.current();
    if (this.state !== 'playing' || p?.id !== id) return { error: 'Du bist nicht dran.' };
    if (!Array.isArray(cardIds) || !cardIds.length) return { error: 'Keine Karte gewählt.' };
    const cards = cardIds.map((cid) => p.hand.find((c) => c.id === cid));
    if (cards.some((c) => !c) || new Set(cardIds).size !== cardIds.length) return { error: 'Karte nicht auf deiner Hand.' };
    const why = this.whyNot(cards);
    if (why) return { error: why };

    p.hand = p.hand.filter((c) => !cardIds.includes(c.id));
    this.pile.push(...cards);

    if (cards[0].kind === 'number') {
      this.top = cards[0].value;
      this.lower = false;
      this.say(`${p.name} legt ${cards.length > 1 ? cards.length + '× ' : ''}${cards[0].value}.`);
      return this.endTurn(p, { skip: 0, again: false });
    }

    const sp = cards[0];
    this.say(`${p.name} spielt ${sp.emoji} ${sp.name}: ${describe(sp.effects)}`);
    const ctx = { skip: 0, again: false };
    for (const e of sp.effects) this.runEffect(p, e, ctx);
    return this.endTurn(p, ctx);
  }

  take(id) {
    const p = this.current();
    if (this.state !== 'playing' || p?.id !== id) return { error: 'Du bist nicht dran.' };
    if (!this.pile.length) return { error: 'Der Stapel ist leer – leg einfach was.' };
    this.say(`${p.name} nimmt den Stapel (${this.pile.length} Karten). 😬`);
    p.hand.push(...this.pile);
    sortHand(p.hand);
    this.pile = [];
    this.top = 0;
    this.lower = false;
    return this.endTurn(p, { skip: 0, again: false });
  }

  whyNot(cards) {
    if (cards[0].kind === 'special') return cards.length === 1 ? null : 'Specials nur einzeln.';
    if (cards.some((c) => c.kind !== 'number' || c.value !== cards[0].value)) return 'Nur gleiche Zahlen zusammen.';
    const v = cards[0].value;
    if (this.top === 0) return null;
    if (this.lower) return v < this.top || (RULES.equalAllowed && v === this.top) ? null : `Muss ${RULES.equalAllowed ? '≤' : '<'} ${this.top} sein.`;
    return v > this.top || (RULES.equalAllowed && v === this.top) ? null : `Muss ${RULES.equalAllowed ? '≥' : '>'} ${this.top} sein.`;
  }

  endTurn(p, { skip, again }) {
    // Gewonnen? Wer zuerst keine Karten mehr hat.
    const out = p.hand.length === 0 ? p : this.active().find((o) => o.hand.length === 0);
    if (out) { this.finish(out); return { ok: true }; }
    if (!again) this.advance(1 + skip);
    return { ok: true };
  }

  advance(steps) {
    const n = this.players.length;
    for (let s = 0; s < steps; s++) {
      do { this.turn = (this.turn + this.dir + n) % n; } while (!this.players[this.turn].inGame);
    }
  }

  finish(winner) {
    this.state = 'over';
    this.winner = winner?.id ?? null;
    if (winner) this.say(`🏆 ${winner.name} hat keine Karten mehr und gewinnt!`);
  }

  // ── Effekte aus dem Baukasten ──────────────────────────────
  runEffect(p, e, ctx) {
    const targets = this.resolveTargets(p, e.target);
    const names = targets.map((t) => t.name).join(', ');
    switch (e.type) {
      case 'reset': this.top = 0; this.lower = false; break;
      case 'burn': this.pile = []; this.top = 0; this.lower = false; break;
      case 'lower': this.lower = true; break;
      case 'reverse': this.dir *= -1; break;
      case 'again': ctx.again = true; break;
      case 'boss': this.top = RULES.maxValue + 1; this.lower = false; break;
      case 'skip': ctx.skip += e.n; break;
      case 'give':
        for (const t of targets) {
          for (let i = 0; i < e.n && p.hand.length; i++) t.hand.push(...p.hand.splice(randIdx(p.hand), 1));
          sortHand(t.hand);
        }
        break;
      case 'draw':
        for (const t of targets) {
          for (let i = 0; i < e.n && this.deck.length; i++) t.hand.push(this.deck.pop());
          sortHand(t.hand);
        }
        if (!this.deck.length) this.say('(Der Ziehstapel ist leer.)');
        break;
      case 'takePile':
        for (const t of targets) { t.hand.push(...this.pile); sortHand(t.hand); }
        this.pile = []; this.top = 0; this.lower = false;
        break;
      case 'swap':
        for (const t of targets) { [p.hand, t.hand] = [t.hand, p.hand]; }
        break;
      case 'rotate': {
        const act = this.active();
        const passed = act.map((pl) => (pl.hand.length ? pl.hand.splice(randIdx(pl.hand), 1)[0] : null));
        act.forEach((pl, i) => {
          const c = passed[(i - this.dir + act.length) % act.length];
          if (c) { pl.hand.push(c); sortHand(pl.hand); }
        });
        break;
      }
    }
    if (names && EFFECTS[e.type].targets) this.say(`   → trifft ${names}`);
  }

  resolveTargets(p, target) {
    const others = this.active().filter((o) => o !== p);
    if (!target || !others.length) return [];
    const n = this.players.length;
    const seat = (step) => {
      let i = this.players.indexOf(p);
      do { i = (i + step * this.dir + n) % n; } while (!this.players[i].inGame);
      return this.players[i];
    };
    const by = (f) => [others.reduce((a, b) => (f(b.hand.length, a.hand.length) ? b : a))];
    switch (target) {
      case 'next': return [seat(1)];
      case 'prev': return [seat(-1)];
      case 'random': return [others[randIdx(others)]];
      case 'fewest': return by((x, y) => x < y);
      case 'most': return by((x, y) => x > y);
      case 'all': return others;
    }
    return [];
  }

  // ── Was die Browser sehen ─────────────────────────────────
  active() { return this.players.filter((p) => p.inGame); }
  current() { return this.players[this.turn]; }
  say(text) { this.log.push(text); this.log = this.log.slice(-8); }

  view(forId) {
    const me = this.players.find((p) => p.id === forId);
    return {
      state: this.state,
      host: this.players[0]?.id,
      turn: this.state === 'playing' ? this.current()?.id : null,
      winner: this.winner,
      top: this.top, lower: this.lower, dir: this.dir,
      deckCount: this.deck.length,
      pile: this.pile.slice(-4),
      pileCount: this.pile.length,
      log: this.log,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, count: p.hand.length, inGame: p.inGame,
        role: p.role ? { key: p.role, ...ROLES[p.role] } : null,
      })),
      hand: me?.hand ?? [],
    };
  }

  // Bilder (Avatare + selbstgezeichnete Karten) – getrennt, weil groß
  arts() {
    return Object.fromEntries(this.players.map((p) => [p.id, { avatar: p.avatar, art: p.special.art }]));
  }
}

function basicCard(key) {
  const b = BASIC_SPECIALS[key];
  return card({ kind: 'special', key, name: b.name, emoji: b.emoji, effects: b.effects });
}

function pickRole() {
  const entries = Object.entries(ROLES);
  let r = Math.random() * entries.reduce((s, [, ro]) => s + ro.weight, 0);
  for (const [key, ro] of entries) { r -= ro.weight; if (r <= 0) return key; }
  return entries[0][0];
}

function sortHand(hand) {
  hand.sort((a, b) => (a.kind === b.kind ? (a.value ?? 0) - (b.value ?? 0) : a.kind === 'number' ? -1 : 1));
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
}
const randIdx = (a) => Math.floor(Math.random() * a.length);
