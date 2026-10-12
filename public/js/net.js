// Verbindet zum Spielserver – egal ob die Seite vom Server selbst oder von Vercel kommt.

import { GAME_SERVER_URL } from '/shared/config.js';

const separate = location.hostname.endsWith('.vercel.app');
export const SERVER = separate ? GAME_SERVER_URL : '';

// Socket.io-Client vom Spielserver laden (der liefert ihn passend zur Version mit)
await new Promise((resolve, reject) => {
  if (window.io) return resolve();
  const s = document.createElement('script');
  s.src = SERVER + '/socket.io/socket.io.js';
  s.onload = resolve;
  s.onerror = () => reject(new Error('Spielserver nicht erreichbar'));
  document.head.append(s);
});

export const connect = (namespace = '/') => window.io(SERVER + namespace);
