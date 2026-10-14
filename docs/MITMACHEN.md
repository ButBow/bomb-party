# 🃏 Club Bombe Spiel – so baust du mit

**Spielen:** https://bomb-party-henna.vercel.app/karten/
**Code:** https://github.com/adrianausulmindiewelt/bomb-party
**Ideen & Aufgaben:** https://github.com/adrianausulmindiewelt/bomb-party/issues

Du brauchst nur einen kostenlosen GitHub-Account: https://github.com/signup

---

## Weg 1 – Karte einreichen, ganz ohne Code (3 Minuten)

1. Öffne: https://github.com/adrianausulmindiewelt/bomb-party/issues/new?template=karte.yml
2. Name, „von wem“ und „was macht die Karte“ ausfüllen
3. Bild einfach ins Feld ziehen (optional)
4. **Submit new issue** – fertig. Wir bauen sie ein.

Auch für andere Ideen oder Fehler: https://github.com/adrianausulmindiewelt/bomb-party/issues/new/choose

---

## Weg 2 – Karte selbst einbauen, im Browser (10 Minuten)

Kein Programm installieren nötig.

1. Öffne https://github.com/adrianausulmindiewelt/bomb-party und klick oben rechts auf **Fork** → **Create fork**
   (Das ist deine eigene Kopie – du kannst nichts kaputt machen.)
2. In deinem Fork die Taste **`.`** (Punkt) drücken → es öffnet sich ein Code-Editor im Browser
3. Datei öffnen: `shared/cards.js` → runterscrollen zu `PLAYER_CARDS`
4. Deine Karte nach diesem Muster dazuschreiben (vor der Zeile `};`):

```js
  meinekarte: {
    name: 'Der Ausreden-König', emoji: '👑', by: 'Dein Name',
    effects: [{ type: 'swap', target: 'most' }],
    art: '/karten/art/meinekarte.jpg', fullArt: true,
  },
```

5. Bild (optional): Ordner `public/karten/art/` → Rechtsklick → **Upload** → Dateiname wie bei `art:`
6. Links auf das Symbol **Source Control** (Verzweigung) → Nachricht schreiben → **Commit & Push**
7. Zurück auf GitHub in deinem Fork: **Contribute → Open pull request** → kurz beschreiben → **Create pull request**

Wir schauen drüber, und nach dem Merge ist deine Karte im Spiel. 🎉

### Diese Effekte kannst du ohne Programmieren kombinieren (max. 2)

| `type` | macht | Extras |
|---|---|---|
| `reset` | Stapel zählt wieder ab 0 | – |
| `burn` | Stapel verbrennen | – |
| `lower` | Nächste*r muss niedriger legen | – |
| `reverse` | Richtung umdrehen | – |
| `again` | Du bist nochmal dran | – |
| `boss` | Zählt als 16 (höchste Karte) | – |
| `rotate` | Alle geben 1 Karte weiter | – |
| `skip` | Personen aussetzen | `n: 1–2` |
| `give` | Karten abgeben | `n: 1–3`, `target` |
| `draw` | jemand zieht Karten | `n: 1–3`, `target` |
| `takePile` | jemand nimmt den Stapel | `target` |
| `swap` | Hand tauschen | `target` |

`target` = `'next'` (nächste Person) · `'prev'` (vorherige) · `'random'` · `'fewest'` (wenigste Karten) · `'most'` (meiste) · `'all'` (alle anderen – nicht bei give/swap/takePile)

Beispiel: `effects: [{ type: 'draw', n: 3, target: 'most' }, { type: 'again' }]`

**Ganz neue Fähigkeiten** (wie die Heiße Kartoffel) brauchen echten Code in `server/cards/game.js`. Lieber erst über Weg 1 einreichen – oder im Workshop zusammen bauen.

---

## Weg 3 – für Profis: auf dem eigenen Rechner

Voraussetzung: [Node.js](https://nodejs.org) und [Git](https://git-scm.com)

```bash
git clone https://github.com/DEIN-NAME/bomb-party.git   # deinen Fork klonen
cd bomb-party
npm install
npm run dev          # → http://localhost:3000/karten/
npm test             # muss grün sein, bevor du einen Pull Request machst
```

Mehr dazu: [CONTRIBUTING.md](../CONTRIBUTING.md)

---

## Spielregeln fürs Mitbauen

- **Eine Sache pro Pull Request** – kleine Änderungen werden schneller übernommen
- **Keine Fotos von anderen ohne deren Okay**, keine Passwörter, keine privaten Daten
- Hängst du fest? Schreib in den Tisch-Chat oder frag im Workshop 💬
