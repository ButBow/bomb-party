// „TOPP DAS!“ – die komplette Spiellogik. Läuft nur auf dem Server.
// Spieler*innen haben eine feste ID (pid), die das Handy sich merkt – so kommt man nach
// Sperrbildschirm oder Funkloch wieder auf denselben Platz zurück.
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
    this.game = 0;            // zählt Spiele hoch – der Browser erkennt daran „neues Spiel → Intro zeigen“
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
    this.ranking = null;
    this.introUntil = 0;
  }

  // ── Leute ──────────────────────────────────────────────────
  addPlayer(pid, { name, avatar, special }) {
    const back = this.players.find((p) => p.id === pid);
    if (back) {                                   // Wiederkehr nach Verbindungsabbruch
      back.connected = true;
      back.awaySince = 0;
      if (avatar) back.avatar = avatar;
      this.say(`${back.name} ist wieder da.`);
      return { ok: true, rejoined: true };
    }
    if (this.players.length >= RULES.maxPlayers) return { error: 'Tisch ist voll.' };
    const effects = validateEffects(special?.effects) ?? [{ type: 'reset' }];
    this.players.push({
      id: pid, name, avatar, hand: [], role: null, inGame: false, connected: true, awaySince: 0,
      special: { name: String(special?.name || `${name}s Bombe`).slice(0, 24), art: special?.art || null, effects },
    });
    this.say(this.state === 'playing' ? `${name} schaut zu und steigt nächste Runde ein.` : `${name} ist da.`);
    return { ok: true };
  }

  // Verbindung weg: im laufenden Spiel Platz freihalten, sonst sofort gehen
  disconnect(pid) {
    const p = this.players.find((o) => o.id === pid);
    if (!p) return;
    if (this.state !== 'playing' || !p.inGame) return this.removePlayer(pid);
    p.connected = false;
    p.awaySince = Date.now();
    this.say(`📵 ${p.name} hat die Verbindung verloren …`);
  }

  removePlayer(pid) {
    const i = this.players.findIndex((p) => p.id === pid);
    if (i < 0) return;
    const wasTurn = this.state === 'playing' && i === this.turn;
    const [p] = this.players.splice(i, 1);
    this.say(`${p.name} ist weg.`);
    if (this.state !== 'playing') return;
    this.deck.unshift(...p.hand);
    if (i < this.turn) this.turn--;
    if (this.turn >= this.players.length) this.turn = 0;
    if (this.active().length < 2) return this.finish(this.active()[0] ?? null);
    // Wer jetzt auf dem Platz sitzt, war eigentlich schon „als Nächstes“ dran
    if (wasTurn && this.dir === -1) this.advance(1);
    else if (!this.current().inGame) this.advance(1);
  }

  // Jede Sekunde vom Server aufgerufen: Abwesende überspringen bzw. rausnehmen.
  // Gibt true zurück, wenn sich etwas geändert hat.
  tick(now = Date.now()) {
    if (this.state !== 'playing') return false;
    let changed = false;
    for (const p of [...this.players]) {
      if (!p.connected && now - p.awaySince > RULES.awayKickSeconds * 1000) {
        this.removePlayer(p.id);
        changed = true;
      }
    }
    const cur = this.current();
    if (this.state === 'playing' && cur && !cur.connected && now - cur.awaySince > RULES.awaySkipSeconds * 1000
        && now - (cur.lastSkipped || 0) > RULES.awaySkipSeconds * 1000) {
      cur.lastSkipped = now;
      this.say(`⏭️ ${cur.name} ist nicht da – wird übersprungen.`);
      this.advance(1);
      changed = true;
    }
    return changed;
  }

  // ── Spielstart ────────────────────────────────────────────
  start(byId) {
    if (this.state === 'playing') return { error: 'Läuft schon.' };
    if (this.host()?.id !== byId) return { error: 'Nur der Host startet.' };
    if (this.players.filter((p) => p.connected).length < 2) return { error: 'Mindestens 2 Leute.' };
    this.players = this.players.filter((p) => p.connected);
    this.reset();
    this.state = 'playing';
    this.game++;
    this.log = [];
    this.introUntil = Date.now() + RULES.introSeconds * 1000;

    // Deck: nur Zahlenkarten (bei vielen Leuten doppelt). Specials gibt es nur über das Los.
    const copies = this.players.length > 4 ? 2 : 1;
    for (let c = 0; c < copies; c++) {
      for (const color of RULES.colors) {
        for (let v = RULES.minValue; v <= RULES.maxValue; v++) this.deck.push(card({ kind: 'number', value: v, color }));
      }
    }
    shuffle(this.deck);

    // Los-Topf: alle selbstgebauten Bomben + Charaktere + Standard-Specials. Jede*r zieht genau eine.
    const pot = shuffle([
      ...this.players.map((p) => card({ kind: 'special', key: 'custom', owner: p.id, by: p.name, name: p.special.name, emoji: '💣', effects: p.special.effects })),
      ...Object.entries(CHARACTERS).map(([key, ch]) => card({ kind: 'special', key, name: ch.name, title: ch.title, emoji: ch.emoji, effects: ch.effects, art: ch.art ?? `/card-art/${key}.jpg`, fullArt: !!ch.fullArt })),
      ...Object.keys(BASIC_SPECIALS).map(basicCard),
    ]);

    for (const p of this.players) {
      p.inGame = true;
      p.role = pickRole();
      // Zufällig aus dem Topf – aber nie die selbst gebaute Bombe
      const i = pot.findIndex((c) => c.owner !== p.id);
      p.drawn = pot.splice(i >= 0 ? i : pot.length - 1, 1)[0];
      p.hand = [p.drawn];
      const size = Math.max(3, RULES.handSize + ROLES[p.role].cards);
      while (p.hand.length < size && this.deck.length) p.hand.push(this.deck.pop());
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
    if (Date.now() < this.introUntil) return { error: 'Kurz warten – die Lose laufen noch 🎰' };
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
    if (Date.now() < this.introUntil) return { error: 'Kurz warten – die Lose laufen noch 🎰' };
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
    if (!this.active().length) return;
    for (let s = 0; s < steps; s++) {
      do { this.turn = (this.turn + this.dir + n) % n; } while (!this.players[this.turn].inGame);
    }
  }

  // Spielende: sobald eine Person keine Karten mehr hat. Dann wird abgerechnet –
  // Platz 1 = Sieg, danach nach Kartenzahl. Wer am meisten hat, ist Letzte*r.
  finish(winner) {
    this.state = 'over';
    this.winner = winner?.id ?? null;
    if (winner) this.say(`🏆 ${winner.name} hat keine Karten mehr und gewinnt!`);
    this.ranking = this.active()
      .sort((a, b) => (a === winner ? -1 : b === winner ? 1 : a.hand.length - b.hand.length))
      .map((p) => ({ id: p.id, name: p.name, count: p.hand.length, role: p.role && { key: p.role, ...ROLES[p.role] } }));
    for (const p of [...this.players]) if (!p.connected) this.removePlayer(p.id);
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
  host() { return this.players.find((p) => p.connected) ?? this.players[0]; }
  say(text) { this.log.push(text); this.log = this.log.slice(-8); }

  view(forId) {
    const me = this.players.find((p) => p.id === forId);
    const reveal = this.state === 'over';
    return {
      state: this.state,
      game: this.game,
      introLeft: Math.max(0, this.introUntil - Date.now()),
      host: this.host()?.id,
      turn: this.state === 'playing' ? this.current()?.id : null,
      winner: this.winner,
      ranking: this.ranking,
      top: this.top, lower: this.lower, dir: this.dir,
      deckCount: this.deck.length,
      pile: this.pile.slice(-4),
      pileCount: this.pile.length,
      log: this.log,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, count: p.hand.length, inGame: p.inGame, connected: p.connected,
        // Rollen sind geheim – man sieht nur die eigene, alle anderen erst am Spielende
        role: p.role && (p.id === forId || reveal) ? { key: p.role, ...ROLES[p.role] } : null,
        secret: !!p.role && !(p.id === forId || reveal),
      })),
      hand: me?.hand ?? [],
      drawn: me?.drawn ?? null,      // deine ausgeloste Special-Karte (für die Animation)
    };
  }

  // Bilder (Avatare + selbstgezeichnete Karten) – getrennt, weil groß
  arts() {
    return Object.fromEntries(this.players.map((p) => [p.id, { avatar: p.avatar, art: p.special.art }]));
  }
}

function basicCard(key) {
  const b = BASIC_SPECIALS[key];
  return card({ kind: 'special', key, name: b.name, emoji: b.emoji, effects: b.effects, art: b.art, fullArt: !!b.fullArt });
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
  return a;
}
const randIdx = (a) => Math.floor(Math.random() * a.length);
