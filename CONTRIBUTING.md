# Mitmachen – so bauen wir zusammen

## Der Ablauf (immer gleich)

1. **Issue aussuchen** unter *Issues*. Mit `good first issue` markierte sind ideal zum Einstieg.
   Schreib „Ich nehm das!“ als Kommentar, damit nicht zwei dasselbe bauen.
2. **Branch anlegen** (eigene Arbeitskopie):
   ```bash
   git checkout main && git pull
   git checkout -b dein-name/kurze-beschreibung     # z. B. lena/powerup-schild
   ```
3. **Bauen & testen:** `npm run dev`, im Browser ausprobieren, `npm test` muss grün sein.
4. **Hochladen:**
   ```bash
   git add .
   git commit -m "Schild-Power-up hinzugefügt"
   git push -u origin dein-name/kurze-beschreibung
   ```
5. **Pull Request** auf GitHub öffnen und im Text „Closes #12“ (Issue-Nummer) schreiben.
   Jemand schaut drüber → Merge → alle haben es beim nächsten `git pull`.

Ohne Schreibrechte im Repo: erst oben rechts auf **Fork** klicken und im eigenen Fork arbeiten.
Der Rest läuft genauso.

## Regeln, damit es nicht knallt (also, außerhalb vom Spiel)

- **Kleine Pull Requests.** Ein Feature pro PR. Kleine PRs lassen sich viel leichter mergen als riesige.
- **Spiellogik nur in `server/game.js`.** Der Browser zeigt nur an. Sonst können Leute schummeln.
- **Neue Einstellungen in `shared/config.js`** statt Zahlen mitten im Code.
- **Keine Fotos, Passwörter oder `.env` committen.**
- Kommentare dürfen deutsch sein, Variablennamen bitte englisch.

## Hilfe, Konflikt!

Wenn `git pull` „CONFLICT“ meldet: Ruhe bewahren, Datei öffnen und die Stelle zwischen `<<<<<<<` und `>>>>>>>` von Hand zusammenführen.
Danach `git add` + `git commit`. Wenn du festhängst, frag im Workshop. Das passiert allen.
