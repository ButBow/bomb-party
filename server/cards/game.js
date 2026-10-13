// „TOPP DAS!“ – die komplette Spiellogik. Läuft nur auf dem Server.
// Spieler*innen haben eine feste ID (pid), die das Handy sich merkt – so kommt man nach
// Sperrbildschirm oder Funkloch wieder auf denselben Platz zurück.
// Jede*r bekommt eine eigene Sicht (view): die eigene Hand ganz, von den anderen nur die Anzahl.

import { RULES, BASIC_SPECIALS, CHARACTERS, PLAYER_CARDS, JESTER_COMBO, ROLES, EFFECTS, cardText, validateEffects } from '../../shared/cards.js';

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
    this.wild = null;         // Zwillings-Parade: { colors: [a, b], owner } – diese Farben passen auf alles
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
      ...Object.entries(PLAYER_CARDS).map(([key, c]) => card({ kind: 'special', key, effects: [], ...c })),
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
  // payload: entweder [Karten-IDs] oder { ids, choice: { target, targets, colors } }
  play(id, payload) {
    const cardIds = Array.isArray(payload) ? payload : payload?.ids;
    const choice = (!Array.isArray(payload) && payload?.choice) || {};
    const p = this.current();
    if (this.state !== 'playing' || p?.id !== id) return { error: 'Du bist nicht dran.' };
    if (Date.now() < this.introUntil) return { error: 'Kurz warten – die Lose laufen noch 🎰' };
    if (!Array.isArray(cardIds) || !cardIds.length) return { error: 'Keine Karte gewählt.' };
    const cards = cardIds.map((cid) => p.hand.find((c) => c.id === cid));
    if (cards.some((c) => !c) || new Set(cardIds).size !== cardIds.length) return { error: 'Karte nicht auf deiner Hand.' };
    const why = this.whyNot(cards);
    if (why) return { error: why };

    // 🥔 wird weitergereicht, nicht abgelegt
    if (cards[0].ability === 'potato') return this.passPotato(p, cards[0], choice.target);

    // Auswahl prüfen, BEVOR Karten die Hand verlassen
    const opp = (tid) => this.active().find((o) => o.id === tid && o !== p);
    const combo = cards.length === 2 && cards[0].kind === 'special';
    if (combo && !(opp(choice.targets?.[0]) && opp(choice.targets?.[1]) && choice.targets[0] !== choice.targets[1])) return { error: 'Wähle zwei verschiedene Personen.' };
    if (!combo && cards[0].ability === 'sadJester' && !opp(choice.target)) return { error: 'Wähle, wer mit dir weinen soll.' };
    if (cards[0].ability === 'twins') {
      const cs = choice.colors;
      if (!Array.isArray(cs) || cs.length !== 2 || cs[0] === cs[1] || !cs.every((c) => RULES.colors.includes(c))) return { error: 'Wähle zwei Farben.' };
    }

    p.hand = p.hand.filter((c) => !cardIds.includes(c.id));
    this.pile.push(...cards);

    if (cards[0].kind === 'number') {
      this.top = cards[0].value;
      this.lower = false;
      this.say(`${p.name} legt ${cards.length > 1 ? cards.length + '× ' : ''}${cards[0].value}.`);
      return this.endTurn(p, { skip: 0, again: false });
    }

    const ctx = { skip: 0, again: false };
    if (combo) {
      const [a, b2] = choice.targets.map(opp);
      this.say(`${p.name} spielt 😆😢 ${JESTER_COMBO.name}!`);
      // Person 1: Hand (ohne Kartoffel) in den Ziehstapel mischen, gleich viele neu ziehen
      const keep = a.hand.filter((c) => c.ability === 'potato');
      const old = a.hand.filter((c) => c.ability !== 'potato');
      this.deck.push(...old); shuffle(this.deck);
      a.hand = keep;
      for (let i = 0; i < old.length && this.deck.length; i++) a.hand.push(this.deck.pop());
      sortHand(a.hand);
      this.say(`   → ${a.name} mischt die Hand neu (${old.length} Karten)`);
      this.draw(b2, 3, { from: p });
      return this.endTurn(p, ctx);
    }

    const sp = cards[0];
    // Spielerkarten haben lange Texte → im Protokoll nur der Name (Details per Antippen)
    this.say(`${p.name} spielt ${sp.emoji} ${sp.name}${sp.text ? '!' : ': ' + cardText(sp)}`);
    if (sp.ability === 'twins') {
      this.wild = { colors: choice.colors, owner: p.id };
      this.say(`   → ♊ Bis ${p.name} wieder dran ist, passen diese 2 Farben auf alles.`);
    } else if (sp.ability === 'gamble') {
      // 🎲 Münzwurf: 4 ziehen oder 4 loswerden (die Kartoffel bleibt immer auf der Hand)
      if (Math.random() < 0.5) {
        this.fx(`🎲 ${p.name}: KRIEGE 4! 😱`);
        this.draw(p, 4, { global: true });
      } else {
        const loose = p.hand.filter((c) => c.ability !== 'potato');
        const gone = shuffle(loose).slice(0, 4);
        p.hand = p.hand.filter((c) => !gone.includes(c));
        this.deck.unshift(...gone);
        this.fx(`🎲 ${p.name}: VERLIERE ${gone.length}! 🥳`);
      }
    } else if (sp.ability === 'sadJester') {
      this.draw(opp(choice.target), p.hand.length, { from: p });
    }
    for (const e of sp.effects ?? []) this.runEffect(p, e, ctx);
    return this.endTurn(p, ctx);
  }

  // 🥔 Weiterreichen: Ziel zieht 3 und bekommt die Kartoffel (nie zurück an die Herkunft)
  passPotato(p, potato, targetId) {
    const others = this.active().filter((o) => o !== p);
    const allowed = others.filter((o) => o.id !== potato.cameFrom);
    const valid = allowed.length ? allowed : others;      // zu zweit geht's notfalls doch zurück
    const t = valid.find((o) => o.id === targetId);
    if (!t) return { error: targetId === potato.cameFrom ? 'Nicht zurück an die Person, von der du sie hast!' : 'Wähle, wer die Kartoffel bekommt.' };
    if (this.reflects(t, p)) {
      this.say(`😆 ${t.name} lacht zuletzt – die Kartoffel bleibt bei ${p.name}, und ${p.name} zieht 3!`);
      this.draw(p, 3, { global: true });
      return this.endTurn(p, { skip: 0, again: false });
    }
    p.hand = p.hand.filter((c) => c !== potato);
    this.say(`🥔 ${p.name} reicht die Heiße Kartoffel an ${t.name} weiter!`);
    this.draw(t, 3, { from: p, noReflect: true });
    potato.cameFrom = p.id;
    t.hand.push(potato);
    sortHand(t.hand);
    return this.endTurn(p, { skip: 0, again: false });
  }

  // Zentrales Ziehen – hier greifen alle Reaktionskarten
  draw(t, n, { from = null, global = false, noReflect = false } = {}) {
    if (!t || n <= 0) return;
    if (from && t !== from && !global) {
      if (!noReflect && this.reflects(t, from)) {
        this.say(`😆 ${t.name} lacht zuletzt – ${from.name} zieht ${n} statt ${t.name}!`);
        return this.draw(from, n, { global: true });
      }
      const twins = t.hand.find((c) => c.ability === 'twins');
      if (twins) {
        t.hand = t.hand.filter((c) => c !== twins);
        this.pile.push(twins);
        const half = Math.ceil(n / 2);
        const nbs = [this.seatFrom(t, 1), this.seatFrom(t, -1)];
        this.say(`♊ ${t.name} kontert mit der Zwillings-Parade – ${[...new Set(nbs)].map((x) => x.name).join(' & ')} ziehen je ${half}!`);
        for (const nb of nbs) this.draw(nb, half, { global: true });
        return;
      }
    }
    if (t.hand.some((c) => c.ability === 'potato')) {
      this.say(`🥔 ${t.name} hält die Kartoffel → zieht ${n * 3} statt ${n}!`);
      n *= 3;
    }
    let got = 0;
    for (; got < n && this.deck.length; got++) t.hand.push(this.deck.pop());
    sortHand(t.hand);
    if (got) this.say(`   → ${t.name} zieht ${got}${got < n ? ' (Stapel leer)' : ''}`);
  }

  // 😆 Glücklicher Schelm: verbraucht sich und wirft einen gezielten Angriff zurück
  reflects(t, from) {
    if (!from || t === from) return false;
    const lucky = t.hand.find((c) => c.ability === 'luckyJester');
    if (!lucky) return false;
    t.hand = t.hand.filter((c) => c !== lucky);
    this.pile.splice(Math.max(0, this.pile.length - 1), 0, lucky);   // unter die oberste Karte
    return true;
  }

  seatFrom(p, step) {
    const n = this.players.length;
    let i = this.players.indexOf(p);
    do { i = (i + step * this.dir + n) % n; } while (!this.players[i].inGame);
    return this.players[i];
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
    if (cards[0].kind === 'special' || cards.some((c) => c.kind === 'special')) {
      if (cards.length === 1) return null;
      const ab = cards.map((c) => c.ability).sort().join('+');
      return ab === 'luckyJester+sadJester' ? null : 'Specials nur einzeln (Ausnahme: beide Schelme).';
    }
    if (cards.some((c) => c.value !== cards[0].value)) return 'Nur gleiche Zahlen zusammen.';
    const v = cards[0].value;
    if (this.top === 0) return null;
    // ♊ freie Farben: passen auf alles
    if (this.wild && cards.every((c) => this.wild.colors.includes(c.color))) return null;
    // ♊ Sphäre: liegt die Zwillings-Parade oben, geht auch genau 1 drunter
    if (this.pile[this.pile.length - 1]?.ability === 'twins' && v === this.top - 1) return null;
    if (this.lower) return v < this.top || (RULES.equalAllowed && v === this.top) ? null : `Muss ${RULES.equalAllowed ? '≤' : '<'} ${this.top} sein.`;
    return v > this.top || (RULES.equalAllowed && v === this.top) ? null : `Muss ${RULES.equalAllowed ? '≥' : '>'} ${this.top} sein.`;
  }

  endTurn(p, { skip, again }) {
    // Gewonnen? Wer zuerst keine Karten mehr hat.
    const out = p.hand.length === 0 ? p : this.active().find((o) => o.hand.length === 0);
    if (out) { this.finish(out); return { ok: true }; }
    // 🥔 Ist die Kartoffel jemandes letzte Karte: Sieg, alle anderen ziehen 3, Kartoffel zurück in den Stapel
    const potatoWin = this.active().find((o) => o.hand.length === 1 && o.hand[0].ability === 'potato');
    if (potatoWin) {
      const potato = potatoWin.hand.pop();
      delete potato.cameFrom;
      this.deck.unshift(potato);
      this.say(`🥔 ${potatoWin.name} hat nur noch die Kartoffel – Sieg! Alle anderen ziehen 3.`);
      for (const o of this.active()) if (o !== potatoWin) this.draw(o, 3, { global: true });
      this.finish(potatoWin);
      return { ok: true };
    }
    if (!again) this.advance(1 + skip);
    return { ok: true };
  }

  advance(steps) {
    const n = this.players.length;
    if (!this.active().length) return;
    for (let s = 0; s < steps; s++) {
      do { this.turn = (this.turn + this.dir + n) % n; } while (!this.players[this.turn].inGame);
    }
    if (this.wild && this.current()?.id === this.wild.owner) {
      this.wild = null;
      this.say('♊ Die zwei Welten schließen sich wieder.');
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
    const global = e.target === 'all';
    const targets = this.resolveTargets(p, e.target);
    const isPotato = (c) => c.ability === 'potato';
    const tradable = (h) => h.filter((c) => !isPotato(c));
    if (targets.length && EFFECTS[e.type].targets) this.say(`   → trifft ${targets.map((t) => t.name).join(', ')}`);
    switch (e.type) {
      case 'reset': this.top = 0; this.lower = false; break;
      case 'burn': this.pile = []; this.top = 0; this.lower = false; break;
      case 'lower': this.lower = true; break;
      case 'reverse': this.dir *= -1; break;
      case 'again': ctx.again = true; break;
      case 'boss': this.top = RULES.maxValue + 1; this.lower = false; break;
      case 'skip': ctx.skip += e.n; break;
      case 'draw':
        for (const t of targets) this.draw(t, e.n, { from: p, global });
        break;
      case 'give':
        for (const t of targets) {
          if (!global && this.reflects(t, p)) { this.say(`😆 ${t.name} lacht zuletzt – ${p.name} behält die Karten.`); continue; }
          for (let i = 0; i < e.n; i++) {
            const pool = tradable(p.hand);
            if (!pool.length) break;
            const c = pool[randIdx(pool)];
            p.hand = p.hand.filter((x) => x !== c);
            t.hand.push(c);
          }
          sortHand(t.hand);
        }
        break;
      case 'takePile':
        for (const t of targets) {
          const who = !global && this.reflects(t, p) ? p : t;
          if (who === p) this.say(`😆 ${t.name} lacht zuletzt – ${p.name} nimmt den Stapel selbst!`);
          who.hand.push(...this.pile); sortHand(who.hand);
        }
        this.pile = []; this.top = 0; this.lower = false;
        break;
      case 'swap':
        for (const t of targets) {
          if (t.hand.some(isPotato)) { this.say(`🥔 ${t.name} hält die Kartoffel – immun gegen Tausch!`); continue; }
          if (!global && this.reflects(t, p)) { this.say(`😆 ${t.name} lacht zuletzt – kein Tausch.`); continue; }
          const keepP = p.hand.filter(isPotato);
          const mine = tradable(p.hand);
          p.hand = [...keepP, ...t.hand];
          t.hand = mine;
          sortHand(p.hand); sortHand(t.hand);
        }
        break;
      case 'rotate': {
        const act = this.active();
        const passed = act.map((pl) => {
          const pool = tradable(pl.hand);
          if (!pool.length) return null;
          const c = pool[randIdx(pool)];
          pl.hand = pl.hand.filter((x) => x !== c);
          return c;
        });
        act.forEach((pl, i) => {
          const c = passed[(i - this.dir + act.length) % act.length];
          if (c) { pl.hand.push(c); sortHand(pl.hand); }
        });
        break;
      }
    }
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
  // Großes Banner für alle (z. B. Münzwurf-Ergebnis)
  fx(text) { this.lastFx = { id: (this.lastFx?.id ?? 0) + 1, text }; this.say(text); }

  // ── Chat ──────────────────────────────────────────────────
  chatSay(pid, text) {
    const p = this.players.find((o) => o.id === pid);
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!p || !clean) return null;
    const now = Date.now();
    if (now - (p.lastChat || 0) < 700) return null;     // kleine Spam-Bremse
    p.lastChat = now;
    const msg = { id: pid, name: p.name, text: clean, t: now };
    this.chat = [...(this.chat ?? []), msg].slice(-60);
    return msg;
  }

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
      wild: this.wild?.colors ?? null,
      sphere: this.pile[this.pile.length - 1]?.ability === 'twins',
      fx: this.lastFx ?? null,
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
