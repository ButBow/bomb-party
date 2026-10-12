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
  basicSpecialsPerDeck: { reset: 2, burn: 2, lower: 2, reverse: 2, skip: 2 },
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

// Die Standard-Specials im Deck
export const BASIC_SPECIALS = {
  reset:   { name: 'Reset',  emoji: '🔄', effects: [{ type: 'reset' }] },
  burn:    { name: 'Feuer',  emoji: '🔥', effects: [{ type: 'burn' }, { type: 'again' }] },
  lower:   { name: 'Unter',  emoji: '⬇️', effects: [{ type: 'lower' }] },
  reverse: { name: 'Wende',  emoji: '🔁', effects: [{ type: 'reverse' }] },
  skip:    { name: 'Stopp',  emoji: '⏭️', effects: [{ type: 'skip', n: 1 }] },
};

// ─────────────────────────────────────────────────────────────
// CHARAKTERKARTEN – jede gibt es einmal im Deck.
// ⚠️ Die Fähigkeiten sind PLATZHALTER. Jede Person denkt sich ihre selbst aus!
// Bild: im Browser unter /karten/editor.html hochladen.
// ─────────────────────────────────────────────────────────────
export const CHARACTERS = {
  adrian: { name: 'Adrian', title: 'Der Chef',         emoji: '👔',
            effects: [{ type: 'reset' }, { type: 'again' }] },
  aylen:  { name: 'Aylen',  title: 'Die Tauschbörse',  emoji: '💱',
            effects: [{ type: 'swap', target: 'fewest' }] },
  louis:  { name: 'Louis',  title: 'Der Weihnachtsmann', emoji: '🎁',
            effects: [{ type: 'give', n: 3, target: 'next' }] },
  bernd:  { name: 'Bernd',  title: 'Der Lieferdienst', emoji: '🚚',
            effects: [{ type: 'takePile', target: 'next' }] },
  niclas: { name: 'Niclas', title: 'Der Turbo',        emoji: '🏎️',
            effects: [{ type: 'skip', n: 2 }] },
  andre:  { name: 'Andre',  title: 'Der Bumerang',     emoji: '🪃',
            effects: [{ type: 'reverse' }, { type: 'draw', n: 1, target: 'all' }] },
  ruben:  { name: 'Ruben',  title: 'Das Feuerwerk',    emoji: '🎆',
            effects: [{ type: 'burn' }, { type: 'give', n: 1, target: 'random' }] },
};

// ─────────────────────────────────────────────────────────────
// ROLLEN – zu Spielbeginn zufällig verteilt, für alle sichtbar.
// cards: wie viele Karten mehr (+) oder weniger (−) als normal
// bonus: Extra-Specials auf die Hand (zählen mit) · weight: wie häufig (höher = öfter)
// ─────────────────────────────────────────────────────────────
export const ROLES = {
  dorfdepp:  { name: 'Dorfdepp',    emoji: '🤪', cards: +2, bonus: [],         weight: 3, text: 'Startet mit 2 Karten mehr' },
  pechvogel: { name: 'Pechvogel',   emoji: '🐦‍⬛', cards: +1, bonus: [],         weight: 4, text: 'Startet mit 1 Karte mehr' },
  buerger:   { name: 'Bürger*in',   emoji: '🧑', cards: 0,  bonus: [],         weight: 5, text: 'Ganz normal. Langweilig, aber sicher.' },
  held:      { name: 'Held*in',     emoji: '🦸', cards: 0,  bonus: ['reset'],  weight: 3, text: 'Eine Reset-Karte als Rettung' },
  junggott:  { name: 'Junger Gott', emoji: '⚡', cards: -1, bonus: ['burn'],   weight: 2, text: '1 Karte weniger + eine Feuer-Karte' },
  gott:      { name: 'Gott',        emoji: '☀️', cards: -2, bonus: [],         weight: 1, text: 'Startet mit 2 Karten weniger' },
};

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
