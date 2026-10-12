// Die komplette Spiellogik. Läuft NUR auf dem Server – die Browser zeigen nur an.
// Koordinaten sind in Kacheln: x=3, y=5 ist die Mitte der Kachel (3|5).

import { GAME, TILE } from '../shared/config.js';

const W = GAME.cols;
const H = GAME.rows;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Startpositionen: erst die vier Ecken, dann die Mitten der Ränder
const SPAWNS = [
  [1, 1], [W - 2, H - 2], [W - 2, 1], [1, H - 2],
  [Math.floor(W / 2) | 1, 1], [Math.floor(W / 2) | 1, H - 2], [1, Math.floor(H / 2)], [W - 2, Math.floor(H / 2)],
];

// ─────────────────────────────────────────────────────────────
// WORKSHOP-AUFGABE #1: Was fällt aus einer zerstörten Kiste?
// Gib 'bomb', 'fire', 'speed' oder null (nichts) zurück.
// Das ist reines Game-Design: zu viele Power-ups = Chaos, zu wenige = langweilig.
// ─────────────────────────────────────────────────────────────
export function rollPowerup() {
  // TODO: Workshop – hier eure Verteilung einbauen
  return null;
}

let nextBombId = 1;

export class Room {
  constructor(id) {
    this.id = id;
    this.players = new Map();   // socketId → Spieler
    this.order = [];            // Beitrittsreihenfolge (für Startplätze)
    this.state = 'playing';     // 'playing' | 'roundOver'
    this.timer = 0;
    this.winner = null;
    this.startRound();
  }

  // ── Spieler kommen & gehen ─────────────────────────────────
  addPlayer(id, { name, color, avatar }) {
    if (this.players.size >= GAME.maxPlayers) return { error: 'Raum ist voll.' };
    const p = { id, name, color, avatar, score: 0, input: { x: 0, y: 0, bomb: false } };
    this.players.set(id, p);
    this.order.push(id);
    // Bis zu 2 Spieler*innen: sofort neue Runde. Danach: zuschauen bis zur nächsten Runde.
    if (this.players.size <= 2) this.startRound();
    else p.alive = false;
    return { ok: true };
  }

  removePlayer(id) {
    this.players.delete(id);
    this.order = this.order.filter((o) => o !== id);
  }

  setInput(id, input) {
    const p = this.players.get(id);
    if (!p || typeof input !== 'object') return;
    const bomb = !!input.bomb;
    // Druck merken – auch wenn Drücken+Loslassen zwischen zwei Ticks passiert
    if (bomb && !p.input.bomb) p.bombQueued = true;
    p.input = {
      x: clamp(Number(input.x) || 0, -1, 1),
      y: clamp(Number(input.y) || 0, -1, 1),
      bomb,
    };
  }

  // ── Runden ─────────────────────────────────────────────────
  startRound() {
    this.grid = makeGrid();
    this.bombs = [];
    this.flames = [];
    this.powerups = [];
    this.state = 'playing';
    this.winner = null;
    this.order.forEach((id, i) => {
      const p = this.players.get(id);
      const [sx, sy] = SPAWNS[i % SPAWNS.length];
      Object.assign(p, {
        x: sx, y: sy, alive: true, dir: 'down',
        bombs: GAME.start.bombs, range: GAME.start.range, speed: GAME.start.speed,
        ghost: new Set(), bombQueued: false,
      });
    });
  }

  // ── Ein Server-Tick ────────────────────────────────────────
  update(dt) {
    if (this.state === 'roundOver') {
      this.timer -= dt;
      if (this.timer <= 0) this.startRound();
      return;
    }

    for (const p of this.players.values()) {
      if (!p.alive) continue;
      this.movePlayer(p, dt);
      // Bombe nur beim Drücken legen, nicht beim Gedrückthalten
      if (p.bombQueued) this.placeBomb(p);
      p.bombQueued = false;
      // Power-up einsammeln
      const tx = Math.round(p.x), ty = Math.round(p.y);
      const pu = this.powerups.find((u) => u.x === tx && u.y === ty);
      if (pu) {
        this.applyPowerup(p, pu.type);
        this.powerups.splice(this.powerups.indexOf(pu), 1);
      }
    }

    // Bomben ticken – Kettenreaktionen inklusive
    for (const b of this.bombs) b.timer -= dt;
    let exploding;
    while ((exploding = this.bombs.find((b) => b.timer <= 0))) this.explode(exploding);

    // Feuer brennt aus
    for (const f of this.flames) f.timer -= dt;
    this.flames = this.flames.filter((f) => f.timer > 0);

    // Wer im Feuer steht, ist raus
    for (const p of this.players.values()) {
      if (p.alive && this.flames.some((f) => f.x === Math.round(p.x) && f.y === Math.round(p.y))) {
        p.alive = false;
      }
    }

    this.checkRoundEnd();
  }

  checkRoundEnd() {
    const all = [...this.players.values()];
    const alive = all.filter((p) => p.alive);
    const over = all.length >= 2 ? alive.length <= 1 : all.length === 1 && alive.length === 0;
    if (!over) return;
    this.state = 'roundOver';
    this.timer = GAME.roundOverTime;
    if (all.length >= 2 && alive.length === 1) {
      alive[0].score += 1;
      this.winner = alive[0].id;
    }
  }

  // ── Bewegung mit „Ecken-Hilfe“ wie im Original ─────────────
  movePlayer(p, dt) {
    let { x: ix, y: iy } = p.input;
    if (Math.abs(ix) < 0.3) ix = 0;
    if (Math.abs(iy) < 0.3) iy = 0;
    if (!ix && !iy) return;

    const horizontal = Math.abs(ix) >= Math.abs(iy);
    const dx = horizontal ? Math.sign(ix) : 0;
    const dy = horizontal ? 0 : Math.sign(iy);
    p.dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';

    let step = p.speed * dt;
    // Wir laufen entlang der x- oder y-Achse; „along“ = Laufrichtung, „across“ = quer dazu
    const along = horizontal ? 'x' : 'y';
    const across = horizontal ? 'y' : 'x';
    const lane = Math.round(p[across]);
    const off = p[across] - lane;
    const cell = Math.round(p[along]);
    const d = horizontal ? dx : dy;
    const aheadFree = !this.blocked(horizontal ? cell + d : lane, horizontal ? lane : cell + d, p);

    // Erst in die Spur rutschen, damit man nicht an Ecken hängen bleibt
    if (Math.abs(off) > 0.001) {
      if (!aheadFree && (p[along] - cell) * d >= 0) return;
      const fix = Math.min(Math.abs(off), step);
      p[across] -= Math.sign(off) * fix;
      step -= fix;
      if (step <= 0) return;
    }

    let next = p[along] + d * step;
    if (!aheadFree) {
      // Nicht über die Kachelmitte hinaus in ein Hindernis laufen
      next = d > 0 ? Math.min(next, Math.max(p[along], cell)) : Math.max(next, Math.min(p[along], cell));
    }
    p[along] = next;

    // Wer von einer eigenen Bombe runtergelaufen ist, kann nicht mehr zurück
    for (const id of p.ghost) {
      const b = this.bombs.find((bb) => bb.id === id);
      if (!b || b.x !== Math.round(p.x) || b.y !== Math.round(p.y)) p.ghost.delete(id);
    }
  }

  blocked(tx, ty, p) {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
    if (this.grid[ty][tx] !== TILE.EMPTY) return true;
    const b = this.bombs.find((bb) => bb.x === tx && bb.y === ty);
    return !!b && !(p && p.ghost.has(b.id));
  }

  // ── Bomben & Explosionen ───────────────────────────────────
  placeBomb(p) {
    const tx = Math.round(p.x), ty = Math.round(p.y);
    const mine = this.bombs.filter((b) => b.owner === p.id).length;
    if (mine >= p.bombs || this.bombs.some((b) => b.x === tx && b.y === ty)) return;
    const bomb = { id: nextBombId++, x: tx, y: ty, owner: p.id, range: p.range, timer: GAME.bombFuse };
    this.bombs.push(bomb);
    // Alle, die gerade auf dem Feld stehen, dürfen noch runterlaufen
    for (const o of this.players.values()) {
      if (o.alive && Math.round(o.x) === tx && Math.round(o.y) === ty) o.ghost.add(bomb.id);
    }
  }

  explode(bomb) {
    this.bombs.splice(this.bombs.indexOf(bomb), 1);
    this.addFlame(bomb.x, bomb.y);
    for (const [dx, dy] of DIRS) {
      for (let i = 1; i <= bomb.range; i++) {
        const x = bomb.x + dx * i, y = bomb.y + dy * i;
        const tile = this.grid[y]?.[x];
        if (tile === undefined || tile === TILE.WALL) break;
        this.addFlame(x, y);
        if (tile === TILE.CRATE) {
          this.grid[y][x] = TILE.EMPTY;
          const type = rollPowerup();
          if (type) this.powerups.push({ x, y, type, fresh: true });
          break;
        }
        // Andere Bombe im Weg? → Kettenreaktion
        const other = this.bombs.find((b) => b.x === x && b.y === y);
        if (other) { other.timer = 0; break; }
        // Power-ups im Feuer verbrennen (frisch gedroppte nicht)
        const pu = this.powerups.findIndex((u) => u.x === x && u.y === y && !u.fresh);
        if (pu >= 0) { this.powerups.splice(pu, 1); break; }
      }
    }
    for (const u of this.powerups) u.fresh = false;
  }

  addFlame(x, y) {
    const f = this.flames.find((ff) => ff.x === x && ff.y === y);
    if (f) f.timer = GAME.flameTime;
    else this.flames.push({ x, y, timer: GAME.flameTime });
  }

  applyPowerup(p, type) {
    if (type === 'bomb') p.bombs = Math.min(p.bombs + 1, GAME.max.bombs);
    if (type === 'fire') p.range = Math.min(p.range + 1, GAME.max.range);
    if (type === 'speed') p.speed = Math.min(p.speed + 0.5, GAME.max.speed);
  }

  // ── Was an die Browser geschickt wird ──────────────────────
  snapshot() {
    return {
      state: this.state,
      timer: this.timer,
      winner: this.winner,
      grid: this.grid.map((row) => row.join('')).join(''),
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, color: p.color, x: round2(p.x), y: round2(p.y),
        alive: p.alive, score: p.score, dir: p.dir,
      })),
      bombs: this.bombs.map((b) => ({ x: b.x, y: b.y, t: round2(b.timer) })),
      flames: this.flames.map((f) => ({ x: f.x, y: f.y })),
      powerups: this.powerups.map((u) => ({ x: u.x, y: u.y, type: u.type })),
    };
  }

  avatars() {
    return Object.fromEntries([...this.players.values()].map((p) => [p.id, p.avatar || null]));
  }
}

function makeGrid() {
  const nearSpawn = (x, y) => SPAWNS.some(([sx, sy]) => Math.abs(sx - x) + Math.abs(sy - y) <= 1);
  const grid = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || (x % 2 === 0 && y % 2 === 0)) row.push(TILE.WALL);
      else if (!nearSpawn(x, y) && Math.random() < GAME.crateDensity) row.push(TILE.CRATE);
      else row.push(TILE.EMPTY);
    }
    grid.push(row);
  }
  return grid;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round2 = (v) => Math.round(v * 100) / 100;
