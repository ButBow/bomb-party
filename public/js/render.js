// Zeichnet einen Spielzustand auf das Canvas. Keine Spiellogik hier!

import { BRAND, GAME, TILE, POWERUPS } from '/shared/config.js';

const C = BRAND.colors;
const HUD = 1.1; // Höhe der Punkteleiste oben, in Kacheln

export function resize(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const tile = Math.floor(Math.min(innerWidth / GAME.cols, innerHeight / (GAME.rows + HUD)));
  canvas.style.width = tile * GAME.cols + 'px';
  canvas.style.height = tile * (GAME.rows + HUD) + 'px';
  canvas.width = tile * GAME.cols * dpr;
  canvas.height = tile * (GAME.rows + HUD) * dpr;
  return tile * dpr;
}

export function draw(ctx, T, s, view, me, faces, now) {
  ctx.fillStyle = C.background;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  drawHud(ctx, T, s, me);
  ctx.save();
  ctx.translate(0, HUD * T);

  // Boden, Wände, Kisten
  for (let y = 0; y < GAME.rows; y++) {
    for (let x = 0; x < GAME.cols; x++) {
      const t = Number(s.grid[y * GAME.cols + x]);
      const px = x * T, py = y * T;
      if (t === TILE.WALL) {
        ctx.fillStyle = C.wall; ctx.fillRect(px, py, T, T);
        ctx.fillStyle = C.wallTop; ctx.fillRect(px, py, T, T * 0.8);
      } else {
        ctx.fillStyle = (x + y) % 2 ? C.floor : C.floorAlt; ctx.fillRect(px, py, T, T);
        if (t === TILE.CRATE) {
          ctx.fillStyle = C.crateEdge; roundRect(ctx, px + T * .06, py + T * .06, T * .88, T * .88, T * .12); ctx.fill();
          ctx.fillStyle = C.crate; roundRect(ctx, px + T * .12, py + T * .1, T * .76, T * .7, T * .1); ctx.fill();
        }
      }
    }
  }

  // Power-ups
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const u of s.powerups) {
    const bob = Math.sin(now / 200 + u.x) * T * 0.05;
    ctx.fillStyle = 'rgba(255,255,255,.15)';
    ctx.beginPath(); ctx.arc((u.x + .5) * T, (u.y + .5) * T, T * .38, 0, 7); ctx.fill();
    ctx.font = `${T * .55}px system-ui`;
    ctx.fillText(POWERUPS[u.type]?.icon ?? '?', (u.x + .5) * T, (u.y + .52) * T + bob);
  }

  // Bomben (pulsieren schneller, je näher die Explosion)
  for (const b of s.bombs) {
    const pulse = 1 + Math.sin(now / (40 + b.t * 60)) * 0.08;
    const cx = (b.x + .5) * T, cy = (b.y + .55) * T, r = T * .36 * pulse;
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.arc(cx - r * .35, cy - r * .35, r * .25, 0, 7); ctx.fill();
    ctx.fillStyle = b.t < 0.8 ? '#ff4040' : C.flame; ctx.beginPath(); ctx.arc(cx + r * .5, cy - r * .9, T * .08, 0, 7); ctx.fill();
  }

  // Feuer
  for (const f of s.flames) {
    ctx.fillStyle = C.flame; roundRect(ctx, f.x * T + T * .04, f.y * T + T * .04, T * .92, T * .92, T * .3); ctx.fill();
    ctx.fillStyle = C.flameCore; roundRect(ctx, f.x * T + T * .25, f.y * T + T * .25, T * .5, T * .5, T * .2); ctx.fill();
  }

  // Spieler*innen (nach y sortiert, damit vordere über hinteren liegen)
  const players = [...s.players].filter((p) => p.alive).sort((a, b) => view.get(a.id).y - view.get(b.id).y);
  for (const p of players) drawPlayer(ctx, T, p, view.get(p.id), faces(p.id), p.id === me, now);

  ctx.restore();

  if (s.state === 'roundOver') {
    const w = s.players.find((p) => p.id === s.winner);
    banner(ctx, w ? `🏆 ${w.name} gewinnt!` : 'Unentschieden 💥', `Nächste Runde in ${Math.ceil(s.timer)} …`);
  } else if (!s.players.find((p) => p.id === me)?.alive) {
    banner(ctx, '👻 Du schaust zu', 'Nächste Runde startet bald', 0.35);
  }
}

function drawPlayer(ctx, T, p, pos, face, isMe, now) {
  const walking = Math.abs(pos.vx) + Math.abs(pos.vy) > 0.01;
  const hop = walking ? Math.abs(Math.sin(now / 90)) * T * 0.08 : 0;
  const cx = (pos.x + .5) * T, cy = (pos.y + .45) * T - hop, r = T * .42;

  // Schatten
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(cx, (pos.y + .88) * T, r * .8, r * .25, 0, 0, 7); ctx.fill();

  // Farbring + Gesicht
  ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r * .84, 0, 7); ctx.clip();
  if (face?.complete && face.naturalWidth) {
    ctx.drawImage(face, cx - r * .84, cy - r * .84, r * 1.68, r * 1.68);
  } else {
    ctx.fillStyle = '#222'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = p.color; ctx.font = `bold ${T * .4}px system-ui`;
    ctx.fillText(p.name.slice(0, 2).toUpperCase(), cx, cy + T * .02);
  }
  ctx.restore();

  // Name
  ctx.font = `bold ${Math.max(10, T * .26)}px system-ui`;
  ctx.lineWidth = Math.max(2, T * .06); ctx.strokeStyle = 'rgba(0,0,0,.8)';
  ctx.strokeText(p.name, cx, cy - r - T * .18);
  ctx.fillStyle = isMe ? '#fff' : 'rgba(255,255,255,.85)';
  ctx.fillText(p.name, cx, cy - r - T * .18);
  if (isMe) { ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(cx - T * .08, cy - r - T * .02); ctx.lineTo(cx + T * .08, cy - r - T * .02); ctx.lineTo(cx, cy - r + T * .08); ctx.fill(); }
}

function drawHud(ctx, T, s, me) {
  ctx.font = `bold ${T * .38}px system-ui`;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = C.accent; ctx.fillText(BRAND.title, T * .3, HUD * T / 2);
  const sorted = [...s.players].sort((a, b) => b.score - a.score);
  let x = ctx.canvas.width - T * .3;
  ctx.textAlign = 'right';
  for (const p of sorted.reverse()) {
    const label = `${p.alive ? '' : '👻'}${p.name} ${p.score}`;
    ctx.fillStyle = p.color;
    ctx.font = `${p.id === me ? 'bold ' : ''}${T * .32}px system-ui`;
    ctx.fillText(label, x, HUD * T / 2);
    x -= ctx.measureText(label).width + T * .5;
  }
  ctx.textAlign = 'center';
}

function banner(ctx, title, sub, alpha = 0.6) {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = `rgba(0,0,0,${alpha})`; ctx.fillRect(0, h * .38, w, h * .24);
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  ctx.font = `900 ${h * .07}px system-ui`; ctx.fillText(title, w / 2, h * .47);
  ctx.font = `${h * .035}px system-ui`; ctx.fillText(sub, w / 2, h * .555);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}
