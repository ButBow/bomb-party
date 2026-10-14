// Alle Eingabegeräte → ein gemeinsamer Zustand { x, y, bomb }.
// Tastatur, Gamepad und Touch werden einfach zusammengezählt.

const keys = new Set();
const touch = { x: 0, y: 0, bomb: false };
let bombTap = false; // merkt kurze Drücker, die zwischen zwei Frames passieren

export function initInput() {
  addEventListener('keydown', (e) => {
    if (e.target.closest('input, #music-controls')) return;
    keys.add(e.code);
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) bombTap = true;
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (isTouch) initTouch();
}

export function readInput() {
  let x = 0, y = 0, bomb = false;

  // Tastatur
  if (keys.has('ArrowLeft') || keys.has('KeyA')) x -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) x += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) y -= 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) y += 1;
  if (keys.has('Space') || keys.has('Enter')) bomb = true;

  // Gamepad (Xbox, PlayStation, Switch Pro … alles was der Browser kennt)
  for (const pad of navigator.getGamepads?.() ?? []) {
    if (!pad) continue;
    const [ax = 0, ay = 0] = pad.axes;
    if (Math.abs(ax) > 0.35) x += ax;
    if (Math.abs(ay) > 0.35) y += ay;
    const b = (i) => pad.buttons[i]?.pressed;
    if (b(14)) x -= 1;            // Steuerkreuz links
    if (b(15)) x += 1;            // rechts
    if (b(12)) y -= 1;            // hoch
    if (b(13)) y += 1;            // runter
    if (b(0) || b(1)) bomb = true; // A / B (bzw. ✕ / ◯)
  }

  // Touch
  x += touch.x; y += touch.y;
  if (touch.bomb || bombTap) bomb = true;
  bombTap = false;

  return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), bomb };
}

function initTouch() {
  document.getElementById('touch').hidden = false;
  const stick = document.getElementById('stick');
  const knob = document.getElementById('knob');
  const bombBtn = document.getElementById('bomb-btn');
  let pointer = null;

  const move = (e) => {
    const r = stick.getBoundingClientRect();
    const radius = r.width / 2;
    let dx = e.clientX - (r.left + radius);
    let dy = e.clientY - (r.top + radius);
    const len = Math.hypot(dx, dy);
    if (len > radius) { dx *= radius / len; dy *= radius / len; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    touch.x = dx / radius;
    touch.y = dy / radius;
  };
  const end = () => {
    pointer = null;
    touch.x = touch.y = 0;
    knob.style.transform = '';
  };

  stick.addEventListener('pointerdown', (e) => { pointer = e.pointerId; stick.setPointerCapture(pointer); move(e); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === pointer) move(e); });
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);

  bombBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); touch.bomb = true; bombTap = true; navigator.vibrate?.(20); });
  bombBtn.addEventListener('pointerup', () => { touch.bomb = false; });
  bombBtn.addEventListener('pointercancel', () => { touch.bomb = false; });
}
