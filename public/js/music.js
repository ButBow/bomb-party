// Eigener, endloser Club-Loop: warme Akkorde, Arpeggio, Bass und Drumcomputer.
// Alles entsteht im Browser – keine Musikdownloads und keine fremden Aufnahmen.
const AudioContext = window.AudioContext || window.webkitAudioContext;
const controls = document.createElement('div');
controls.id = 'music-controls';
controls.setAttribute('role', 'group');
controls.setAttribute('aria-label', 'Hintergrundmusik');
controls.innerHTML = '<button type="button" aria-pressed="false">♫ Musik starten</button>'
  + '<input type="range" min="0" max="100" step="1" aria-label="Musiklautstärke" />';
document.body.append(controls);
const button = controls.querySelector('button');
const slider = controls.querySelector('input');

let enabled = true, volume = 0.3;
try {
  const saved = JSON.parse(localStorage.getItem('party-music') || 'null');
  if (saved) {
    enabled = saved.enabled !== false;
    if (Number.isFinite(saved.volume)) volume = Math.max(0, Math.min(1, saved.volume));
  }
} catch { /* Musik funktioniert auch ohne verfügbaren Browserspeicher. */ }
slider.value = Math.round(volume * 100);

let context, master, echo, noise;
let timer = null, nextTime = 0, step = 0;
const stepSeconds = 60 / 112 / 4;
const chords = [[45, 48, 52, 55], [41, 45, 48, 52], [48, 52, 55, 59], [43, 47, 50, 53]];
const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

function save() {
  try { localStorage.setItem('party-music', JSON.stringify({ enabled, volume })); } catch { /* optional */ }
}

function showState() {
  const playing = enabled && context?.state === 'running' && !document.hidden;
  button.setAttribute('aria-pressed', String(!!playing));
  button.textContent = playing ? '♫ Musik an' : enabled ? '♫ Musik starten' : '♫ Musik aus';
  button.setAttribute('aria-label', playing ? 'Hintergrundmusik ausschalten' : 'Hintergrundmusik einschalten');
}

function setup() {
  context = new AudioContext();
  master = context.createGain();
  master.gain.value = volume * 0.45;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 4;
  master.connect(compressor).connect(context.destination);

  echo = context.createDelay(1);
  echo.delayTime.value = stepSeconds * 3;
  const feedback = context.createGain();
  feedback.gain.value = 0.22;
  echo.connect(feedback).connect(echo);
  echo.connect(master);

  noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.18), context.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

function voice(source, time, duration, level, destination = master) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(level, time + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  source.connect(gain).connect(destination);
  source.onended = () => { source.disconnect(); gain.disconnect(); };
  source.start(time);
  source.stop(time + duration + 0.01);
}

function note(midi, time, duration, level, type = 'triangle', destination = master) {
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.value = frequency(midi);
  voice(oscillator, time, duration, level, destination);
}

function drum(time, snare = false) {
  const source = context.createBufferSource();
  source.buffer = noise;
  const filter = context.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = snare ? 1200 : 7000;
  filter.connect(master);
  voice(source, time, snare ? 0.15 : 0.035, snare ? 0.22 : 0.1, filter);
  const cleanup = source.onended;
  source.onended = () => { cleanup(); filter.disconnect(); };
}

function schedule() {
  // Nach einer Browserpause keine verpassten Schläge gleichzeitig nachholen.
  if (nextTime < context.currentTime) nextTime = context.currentTime + 0.04;
  while (nextTime < context.currentTime + 0.12) {
    const beat = step % 16;
    const chord = chords[Math.floor(step / 32) % chords.length];
    if (beat % 4 === 0) {
      const kick = context.createOscillator();
      kick.frequency.setValueAtTime(130, nextTime);
      kick.frequency.exponentialRampToValueAtTime(42, nextTime + 0.16);
      voice(kick, nextTime, 0.25, 0.65);
    }
    if (beat === 4 || beat === 12) drum(nextTime, true);
    if (beat % 2 === 0) {
      drum(nextTime);
      note(chord[0] - 12, nextTime, stepSeconds * 1.6, 0.3);
      const pitch = chord[[0, 2, 1, 3, 2, 1, 0, 2][beat / 2]] + 24;
      note(pitch, nextTime, 0.2, 0.07);
      note(pitch, nextTime, 0.2, 0.025, 'triangle', echo);
    }
    if (beat === 0) {
      for (const pitch of chord) note(pitch + 12, nextTime, stepSeconds * 15, 0.045, 'sine');
    }
    nextTime += stepSeconds;
    step = (step + 1) % 128;
  }
}

async function updatePlayback() {
  try {
    if (!enabled || document.hidden) {
      clearInterval(timer); timer = null;
      if (context?.state === 'running') await context.suspend();
    } else {
      if (!context) setup();
      await context.resume();
      if (!enabled || document.hidden) return updatePlayback();
      if (context.state === 'running' && timer === null) {
        nextTime = Math.max(nextTime, context.currentTime + 0.04);
        schedule();
        timer = setInterval(schedule, 25);
      }
    }
  } catch {
    // Bei blockierter Wiedergabe bleibt der Startknopf für den nächsten Klick da.
  }
  showState();
}

button.onclick = () => {
  enabled = !(enabled && context?.state === 'running');
  save();
  void updatePlayback();
};
slider.oninput = () => {
  volume = Number(slider.value) / 100;
  if (master) master.gain.setTargetAtTime(volume * 0.45, context.currentTime, 0.03);
  save();
};

// Browser erlauben Ton erst nach einem Klick oder Tastendruck.
function unlock(event) {
  if (!event.isTrusted || event.target.closest('#music-controls')) return;
  if (enabled && context?.state !== 'running') void updatePlayback();
}
document.addEventListener('pointerdown', unlock);
document.addEventListener('keydown', unlock);
document.addEventListener('visibilitychange', () => { if (context) void updatePlayback(); });
window.addEventListener('pagehide', () => { clearInterval(timer); timer = null; void context?.suspend(); });
window.addEventListener('pageshow', () => { if (context) void updatePlayback(); });

if (!AudioContext) {
  controls.hidden = true;
} else {
  showState();
}
