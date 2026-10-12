// Kartenspiel „TOPP DAS!“ – Regeln, Effekt-Baukasten und Charakterkarten.
// Diese Datei laden Server UND Browser. Hier passt ihr das Spiel an.

export const CARD_BRAND = {
  title: 'TOPP DAS!',
  tagline: 'Leg höher. Oder friss den Stapel.',
};

export const RULES = {
  handSize: 10,          // Karten pro Kopf
  minValue: 1,
  maxValue: 15,
  colors: ['#ff3d7f', '#3dc6ff', '#ffd23d', '#5cff8a'],
  equalAllowed: true,    // darf man die gleiche Zahl legen?
  maxPlayers: 8,
  introSeconds: 6,       // so lange laufen Rollen- und Karten-Animation am Anfang
  awaySkipSeconds: 15,   // wer die Verbindung verliert und dran ist, wird danach übersprungen
  awayKickSeconds: 120,  // … und nach so langer Abwesenheit ganz rausgenommen
};

// ─────────────────────────────────────────────────────────────
// EFFEKT-BAUKASTEN
// Jede Special-Karte besteht aus 1–2 dieser Effekte. Mehr gibt es nicht.
// So bleibt alles „innerhalb der Grenzen“: nichts Unendliches, kein Sofort-Verlieren.
// n: [min, max] = erlaubter Zahlenbereich · targets: wen es treffen darf
// ─────────────────────────────────────────────────────────────
export const TARGETS = {
  next:   'die nächste Person',
  prev:   'die vorherige Person',
  random: 'eine zufällige Person',
  fewest: 'wer am wenigsten Karten hat',
  most:   'wer am meisten Karten hat',
  all:    'alle anderen',
};

export const EFFECTS = {
  reset:    { label: '🔄 Reset',            text: () => 'Stapel zählt wieder ab 0' },
  burn:     { label: '🔥 Feuer',            text: () => 'Stapel verbrennen' },
  lower:    { label: '⬇️ Unter',            text: () => 'Nächste*r muss niedriger legen' },
  reverse:  { label: '🔁 Richtungswechsel', text: () => 'Spielrichtung umdrehen' },
  again:    { label: '⚡ Nochmal',          text: () => 'Du bist nochmal dran' },
  boss:     { label: '👑 Boss',             text: () => 'Zählt als 16 – die höchste Karte' },
  rotate:   { label: '🌀 Karussell',        text: () => 'Alle geben 1 Karte weiter' },
  skip:     { label: '⏭️ Aussetzen', n: [1, 2], text: (e) => `${e.n} Person${e.n > 1 ? 'en' : ''} aussetzen` },
  give:     { label: '🎁 Abgeben',   n: [1, 3], targets: ['next', 'prev', 'random', 'fewest', 'most'],
              text: (e) => `Gib ${e.n} Karte${e.n > 1 ? 'n' : ''} an ${TARGETS[e.target]}` },
  draw:     { label: '📥 Ziehen lassen', n: [1, 3], targets: Object.keys(TARGETS),
              text: (e) => `${cap(TARGETS[e.target])} ${e.target === 'all' ? 'ziehen' : 'zieht'} ${e.n}` },
  takePile: { label: '🗑️ Stapel kassieren', targets: ['next', 'prev', 'random', 'fewest', 'most'],
              text: (e) => `${cap(TARGETS[e.target])} nimmt den Stapel` },
  swap:     { label: '🃏 Hand tauschen', targets: ['next', 'prev', 'random', 'fewest', 'most'],
              text: (e) => `Tausche deine Hand mit ${TARGETS[e.target]}` },
};
export const MAX_EFFECTS_PER_CARD = 2;

// Standard-Specials – liegen zusammen mit allen anderen Specials im Los-Topf (1 pro Person)
export const BASIC_SPECIALS = {
  reset:   { name: 'Reset',  emoji: '🔄', effects: [{ type: 'reset' }] },
  burn:    { name: 'Feuer',  emoji: '🔥', effects: [{ type: 'burn' }, { type: 'again' }] },
  lower:   { name: 'Unter',  emoji: '⬇️', effects: [{ type: 'lower' }] },
  reverse: { name: 'Wende',  emoji: '🔁', effects: [{ type: 'reverse' }] },
  skip:    { name: 'Stopp',  emoji: '⏭️', effects: [{ type: 'skip', n: 1 }] },
  // Von Spieler*innen gestaltet (Bild in public/karten/art/) – fullArt = Bild füllt die ganze Karte
  joker:   { name: 'Joker',  emoji: '🃏', effects: [{ type: 'again' }], art: '/karten/art/joker.jpg', fullArt: true },
};

// ─────────────────────────────────────────────────────────────
// CHARAKTERKARTEN – jede gibt es einmal im Deck.
// ⚠️ Die Fähigkeiten sind PLATZHALTER. Jede Person denkt sich ihre selbst aus!
// Bild: fertige Karten-Designs nach public/karten/art/<key>.jpg + art/fullArt eintragen,
// oder schnell im Browser unter /karten/editor.html hochladen.
// ─────────────────────────────────────────────────────────────
export const CHARACTERS = {
  adrian: { name: 'Adrian', title: 'Der Chef',         emoji: '👔',
            effects: [{ type: 'reset' }, { type: 'again' }] },
  aylen:  { name: 'Aylen',  title: 'Die Tauschbörse',  emoji: '💱',
            effects: [{ type: 'swap', target: 'fewest' }] },
  louis:  { name: 'Louis',  title: 'Der Dreizack',   emoji: '🔱', art: '/karten/art/louis.jpg', fullArt: true,
            effects: [{ type: 'give', n: 3, target: 'next' }] },
  bernd:  { name: 'Bernd',  title: 'Der Lieferdienst', emoji: '🚚',
            effects: [{ type: 'takePile', target: 'next' }] },
  niclas: { name: 'Niclas', title: 'Der Turbo',        emoji: '🏎️',
            effects: [{ type: 'skip', n: 2 }] },
  andre:  { name: 'Andre',  title: 'Die Himmelskriegerin', emoji: '⚔️', art: '/karten/art/andre.jpg', fullArt: true,
            effects: [{ type: 'reverse' }, { type: 'draw', n: 1, target: 'all' }] },
  ruben:  { name: 'Ruben',  title: 'Das Feuerwerk',    emoji: '🎆',
            effects: [{ type: 'burn' }, { type: 'give', n: 1, target: 'random' }] },
};

// ─────────────────────────────────────────────────────────────
// ROLLEN – zu Spielbeginn zufällig verteilt, für alle sichtbar.
// cards: wie viele Karten mehr (+) oder weniger (−) als normal
// weight: wie häufig (höher = öfter) · Die Rolle sieht nur man selbst – bis zum Spielende
// ─────────────────────────────────────────────────────────────
export const ROLES = {
  dorfdepp:  { name: 'Dorfdepp',    emoji: '🤪', cards: +2, weight: 3, text: 'Du startest mit 2 Karten mehr. Viel Glück.' },
  pechvogel: { name: 'Pechvogel',   emoji: '🐦‍⬛', cards: +1, weight: 4, text: 'Du startest mit 1 Karte mehr.' },
  buerger:   { name: 'Bürger*in',   emoji: '🧑', cards: 0,  weight: 5, text: 'Ganz normal. Langweilig, aber sicher.' },
  held:      { name: 'Held*in',     emoji: '🦸', cards: -1, weight: 3, text: 'Du startest mit 1 Karte weniger.' },
  junggott:  { name: 'Junger Gott', emoji: '⚡', cards: -2, weight: 2, text: 'Du startest mit 2 Karten weniger.' },
  gott:      { name: 'Gott',        emoji: '☀️', cards: -3, weight: 1, text: 'Du startest mit 3 Karten weniger. Göttlich.' },
};

// ─────────────────────────────────────────────────────────────
// KARTEN VON SPIELER*INNEN mit eigenen Regeln.
// Die Logik dazu steht in server/cards/game.js (Suche nach „ability“).
// needs: welche Auswahl man beim Ausspielen trifft – 'target' (eine Person), 'colors2' (zwei Farben)
// ─────────────────────────────────────────────────────────────
export const PLAYER_CARDS = {
  kartoffel: {
    name: 'Heiße Kartoffel', emoji: '🥔', ability: 'potato', needs: 'target',
    text: 'Kann nicht abgelegt, nur weitergereicht werden (nie zurück an die Person, von der du sie hast). '
      + 'Wer sie bekommt, zieht 3. Wer sie hält, ist immun gegen Tausch, zieht aber bei Zieh-Effekten das Dreifache. '
      + 'Ist sie deine letzte Karte: Du gewinnst, alle anderen ziehen 3.',
  },
  zwillinge: {
    name: 'Zwillings-Parade', title: 'Blick der zwei Welten', emoji: '♊', by: 'NoRevanell Morningstar', ability: 'twins', needs: 'colors2',
    text: 'Aktiv: Wähle 2 Farben – bis du wieder dran bist, passen sie auf jede Karte. '
      + 'Sphäre: Solange sie oben liegt, darf man auch 1 drunter legen. '
      + 'Passiv: Sollst du ziehen, wird sie automatisch abgeworfen – je die Hälfte ziehen deine beiden Sitznachbar*innen.',
  },
  gluecklich: {
    name: 'Glücklicher Schelm', title: 'Wer zuletzt lacht', emoji: '😆', by: 'Luis/Pilzi', ability: 'luckyJester',
    text: 'Passiv: Spielt jemand gezielt eine Karte gegen dich, fliegt der ganze Effekt automatisch zurück (nicht bei Effekten gegen alle). '
      + 'Zusammen mit dem Traurigen Schelm legbar: „Lachen und Weinen“.',
  },
  traurig: {
    name: 'Trauriger Schelm', title: 'Geteiltes Leid', emoji: '😢', by: 'Luis/Pilzi', ability: 'sadJester', needs: 'target',
    text: 'Wähle jemanden: zieht so viele Karten, wie du danach noch auf der Hand hast. '
      + 'Zusammen mit dem Glücklichen Schelm legbar: „Lachen und Weinen“.',
  },
};
export const JESTER_COMBO = {
  name: 'Lachen und Weinen',
  text: 'Beide Schelme zusammen: Person 1 mischt ihre ganze Hand in den Ziehstapel und zieht gleich viele neu. Person 2 zieht 3.',
};

// Text einer Karte: eigener Text (Spielerkarten) oder automatisch aus den Effekten
export function cardText(c) {
  return c.text ?? describe(c.effects ?? []);
}

export function describe(effects) {
  return effects.map((e) => EFFECTS[e.type]?.text(e) ?? '?').join(' + ');
}

// Prüft eine selbstgebaute Karte. Gibt eine bereinigte Version zurück – oder null.
export function validateEffects(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_EFFECTS_PER_CARD) return null;
  const seen = new Set();
  const clean = [];
  for (const raw of list) {
    const def = EFFECTS[raw?.type];
    if (!def || seen.has(raw.type)) return null;
    seen.add(raw.type);
    const e = { type: raw.type };
    if (def.n) {
      const n = Math.round(Number(raw.n));
      if (!(n >= def.n[0] && n <= def.n[1])) return null;
      e.n = n;
    }
    if (def.targets) {
      if (!def.targets.includes(raw.target)) return null;
      e.target = raw.target;
    }
    clean.push(e);
  }
  return clean;
}

function cap(s) { return s[0].toUpperCase() + s.slice(1); }
