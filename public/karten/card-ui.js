// Baut eine Karte als HTML-Element. Wird im Spiel UND im Editor benutzt.

import { describe } from '/shared/cards.js';
import { SERVER } from '/js/net.js';

export function cardEl(c, arts = {}) {
  const el = document.createElement('div');
  el.className = 'card ' + c.kind;
  el.dataset.id = c.id;

  if (c.kind === 'number') {
    el.style.background = c.color;
    el.innerHTML = `<span class="corner">${c.value}</span><span class="v">${c.value}</span>`;
    return el;
  }

  // Special-Karte: Bild oben, Name + Fähigkeit unten
  const isCustom = c.key === 'custom';
  const isChar = !!c.art && !isCustom;
  if (isCustom) el.classList.add('custom');
  if (isChar) el.classList.add('character');
  const art = document.createElement('div');
  art.className = 'art';
  const src = isCustom ? arts[c.owner]?.art : c.art && SERVER + c.art;
  if (src) {
    // Erst prüfen, ob das Bild existiert – sonst bleibt das Emoji stehen
    const probe = new Image();
    probe.onload = () => { art.style.backgroundImage = `url("${src}")`; art.textContent = ''; };
    probe.src = src;
  }
  art.textContent = c.emoji || '✨';
  const label = document.createElement('div');
  label.className = 'label';
  label.innerHTML = `<b></b><i></i>`;
  label.querySelector('b').textContent = c.title ? `${c.name} · ${c.title}` : c.name;
  label.querySelector('i').textContent = describe(c.effects);
  el.append(art, label);
  return el;
}
