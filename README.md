# Mardow

Schlichte Notizen-App für macOS. Du schreibst Markdown, und es wird direkt formatiert angezeigt (`# ` wird zur Überschrift, `- [ ] ` zur Checkliste, `/` öffnet das Befehlsmenü). Alle Notizen liegen als `.md`-Dateien in einem Ordner deiner Wahl.

## Starten

Voraussetzungen: Node.js (für den Frontend-Build) und Rust (`rustup`, liegt in `~/.cargo/bin`; die Skripte setzen den Pfad selbst).

```bash
npm install
```

| Befehl | Was passiert |
|---|---|
| `npm run desktop` | Startet die Desktop-App im Entwicklungsmodus |
| `npm run dist` | Baut `src-tauri/target/release/bundle/macos/Mardow.app` (ca. 12 MB) |
| `npm run web` | Startet nur den Server, dann im Browser auf http://localhost:4321 (Port änderbar mit `PORT=…`) |
| `npm run dev` + `npm run server` | Entwicklung der Oberfläche mit Hot Reload (Vite auf :5173, API auf :4321) |
| `npm test` | Tests für die Dateilogik (`cargo test`) und das Board-Format |

Die `.app` kannst du nach `/Programme` ziehen. Sie ist nur lokal signiert, deshalb warnt macOS auf einem anderen Mac beim ersten Öffnen.

## Tastenkürzel (auch unter Einstellungen › Tastenkürzel)

| Kürzel | Aktion |
|---|---|
| ⌘N | Neue Notiz (im Browser ⌥⌘N, weil ⌘N dort ein neues Fenster öffnet) |
| ⇧⌘N | Neuer Ordner (nur Desktop, im Browser reserviert) |
| ⌘K oder ⇧⌘F | Suche, dann Enter öffnet den ersten Treffer und Esc schließt die Suche |
| ⌥⌘↑ / ⌥⌘↓ | Vorherige / nächste Notiz in der Sidebar |
| ⌘S | Sofort speichern (gespeichert wird ohnehin automatisch) |
| ⌘⌫ | Notiz in den Papierkorb, wenn der Fokus nicht im Text liegt |
| ⌥⌘S | Sidebar ein- oder ausblenden |
| ⌘, | Einstellungsfenster (Sprache, Sortierung, Erscheinungsbild, Tastenkürzel), in der App auch über Mardow › Einstellungen … |
| ⌘B, ⌘I, ⌘E, ⌘Z | Fett, kursiv, Inline-Code, Rückgängig (vom Editor) |

Die Menüleiste der App (Mardow, Bearbeiten, Fenster) folgt der eingestellten Sprache. Widerrufen und Wiederholen stehen bewusst nicht im Menü, damit ⌘Z und ⇧⌘Z beim Editor ankommen.
| ⌥⌘1–3 | Überschrift 1–3 (vom Editor) |

## Boards (Kanban)

Ein Board legst du über das Board-Symbol oben in der Sidebar an oder über das „+“ an einem Ordner, das Notiz oder Board zur Auswahl anbietet. Es ist eine ganz normale `.md`-Datei:

```markdown
---
mardow: board
---

## Offen

- Logo entwerfen
  Details zur Karte, normales Markdown, um zwei Leerzeichen eingerückt.

  - [ ] Farben festlegen

- Texte schreiben

## Erledigt
```

- `## Überschriften` sind Spalten, Listenpunkte sind Karten, eingerückter Text darunter sind die Details der Karte.
- Karten und Spalten verschiebst du per Drag & Drop. Spalten fasst du dazu am Kopf an.
- Den Titel änderst du über den Stift auf der Karte oder per Klick auf den Spaltennamen. Enter speichert, Esc bricht ab.
- Ein Klick auf eine Karte öffnet die Details mit dem gleichen Editor wie bei Notizen. Checklisten darin zeigt die Karte als Fortschritt, z. B. „1/3“.
- Ohne die Zeile `mardow: board` oben öffnet Mardow die Datei als normale Notiz.

## Sidebar

- Oben stehen drei Symbole: neuer Ordner, neues Board und neue Notiz.
- **Wichtig:** Über `…` an einer Notiz wählst du „Als wichtig markieren“. Die Notiz wandert dann in den rosa markierten Bereich „Wichtig“ ganz oben. Ziehst du sie wieder in einen Ordner, ist sie nicht mehr wichtig.
- **Sortierung** (Einstellungen › Allgemein): zuletzt bearbeitet, zuletzt erstellt, alphabetisch oder manuell. Angepinnte Notizen stehen immer oben.
- **Einzelne Dateien:** Beliebige Textdateien (z. B. `.txt`, `.json`, `.md`) ziehst du aus dem Finder ins Fenster oder öffnest sie über „Öffnen mit › Mardow“. Sie stehen dann unter „Hello!“ im gestrichelten Bereich „Einzelne Dateien“, unabhängig von jedem Notizordner. Markdown öffnet im Editor, alles andere in einer Code-Ansicht wie in VS Code: Zeilennummern, Syntaxfarben passend zur Dateiendung, aktuelle Zeile, Klammerpaare, Einklappen und Suche mit ⌘F. Der Knopf rechts in der Kopfzeile schaltet den Zeilenumbruch um und gilt für alle Dateien. Das × entfernt eine Datei nur aus der Liste. Damit die Leertasten-Vorschau im Finder „Mit Mardow öffnen“ anbietet, machst du Mardow im Finder unter „Informationen › Öffnen mit › Alle ändern“ zum Standard für diesen Dateityp.
- **Mehrere Notizordner:** Ein Klick auf den Pfad unten in der Sidebar öffnet die Liste deiner Notizordner. Dort wechselst du zwischen ihnen, fügst weitere hinzu oder entfernst einen aus der Liste (die Dateien bleiben liegen). Pins, „Wichtig“ und die manuelle Reihenfolge gelten je Ordner, weil sie in dessen `.mardow.json` stehen. Mardow öffnet beim Wechsel die zuletzt offene Notiz des Ordners.
- **Ziehen:** Notizen lassen sich in der Sidebar verschieben. Innerhalb eines Ordners sortiert das um. Auf einen anderen Ordner oder dessen Notizen gezogen, wandert die Datei in diesen Ordner. Nach dem ersten Ziehen steht die Sortierung auf „Manuell“.

## Editor-Extras

- `->`, `-->` und `—>` werden beim Tippen zu →. ⌘Z macht das rückgängig.
- `[] `, `[ ]` oder `[x]` am Zeilenanfang (auch nach `- `) macht einen Checklistenpunkt.
- Ein Klick auf den Griff (sechs Punkte) links neben einer Zeile wandelt sie um: Text, Überschrift, Zitat, Liste, Checkliste oder Code. Der Text bleibt erhalten. Gedrückt halten und ziehen verschiebt die Zeile.
- Tabellen legst du über `/` › Erweitert › Tabelle an. Markdown-Tabellen aus Dateien werden als Tabelle angezeigt.

## Wie die Dateien aussehen

```
Notizordner/
├── Lose Notiz.md          ← erscheint unter „Notizen“
├── Ideen/                 ← ein Ordner in der Sidebar (nur eine Ebene)
│   └── Notizen-App.md     ← Dateiname = Titel
└── .mardow.json           ← angepinnt, wichtig und manuelle Reihenfolge
```

- Wenn du den Titel änderst, wird die Datei umbenannt.
- Gelöschte Notizen und Ordner landen im macOS-Papierkorb.
- Änderungen von außen (zum Beispiel in VS Code oder Obsidian) übernimmt die App live.
- Einstellungen stehen in `~/Library/Application Support/Mardow/config.json`.
- Unter dem Titel stehen Erstellungs- und Bearbeitungszeit. Beide kommen aus dem Dateisystem. Programme, die beim Speichern die Datei ersetzen statt sie zu überschreiben, setzen das Erstellungsdatum zurück.

## Release veröffentlichen

```bash
npm run release -- 0.2.0
```

[scripts/release.sh](scripts/release.sh) setzt die Version (package.json, tauri.conf.json, Cargo.toml), führt `npm test` und `npm run dist` aus und packt `Mardow.app` als `Mardow-<version>-macos-<arch>.zip`. Danach entstehen der Commit „Release v<version>“ und der Tag `v<version>`. Beide werden nach `origin` gepusht. Zum Schluss legt das Skript ein GitHub-Release an, mit der ZIP-Datei als Anhang und automatisch erzeugten Release-Notes.

Voraussetzungen: ein sauberer Git-Arbeitsstand, ein `origin`-Remote auf GitHub und ein angemeldetes `gh` (`gh auth login`). Das Skript prüft alles vorher und bricht ab, bevor es eine Datei ändert.

Die App ist nur behelfsmäßig signiert und nicht notarisiert. Auf einem anderen Mac blockiert Gatekeeper sie nach dem Download zunächst: Rechtsklick › Öffnen, oder `xattr -dr com.apple.quarantine Mardow.app`.

## Neue Einstellung hinzufügen

1. In `src/settings.js` ein Feld zu einem Bereich hinzufügen (oder einen neuen Bereich anlegen). Möglich sind die Typen `select`, `segmented`, `folder` und `keys` (nur Anzeige, für die Kürzel-Übersicht).
2. Die Beschriftungen in `src/i18n.js` ergänzen.
3. Den Wert im Code als `state.cfg.<key> ?? <default>` lesen.

Der Server speichert jeden einfachen Wert (Text, Zahl, Ja/Nein) ohne Änderung am Rust-Code.

## Aufbau

Ein Rust-Programm erledigt beides: Ohne Argument öffnet es das Desktop-Fenster, mit `--web` startet es nur den Server.

- `src-tauri/src/vault.rs`: alle Dateioperationen inklusive Pfadprüfung, mit Test
- `src-tauri/src/server.rs`: lokaler HTTP-Server (axum, nur 127.0.0.1) mit JSON-API, Datei-Watcher (notify, per SSE an die Oberfläche) und Auslieferung von `dist/`
- `src-tauri/src/main.rs`: startet den Server auf einem freien Port und öffnet ihn im Fenster des Systems (WebKit). Mit `--web` läuft nur der Server.
- `src/settings.js`: Aufbau des Einstellungsfensters
- `src/board.js`: Lesen und Schreiben des Board-Formats (Test: `node src/board.test.js`, läuft in `npm test` mit), `src/boardview.js`: Board-Ansicht mit Drag & Drop
- `src/`: Oberfläche (Vanilla JS) und Editor [Milkdown Crepe](https://milkdown.dev); Farben stehen als Variablen oben in `src/style.css`
