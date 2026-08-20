# 🏐 Mannschaftskasse L.E. Volleys IV

Web-Dashboard für die Mannschaftskasse: Kassenstand, offene Strafen, Zahlungseingänge, Strafenkatalog und QR-Codes zum Bezahlen. Read-only für alle Spieler, Admin-Bereich passwortgeschützt.

---

## 1. Überblick

### Dateien

| Datei | Zweck | Wohin |
|---|---|---|
| `index.html` | Die komplette App (HTML + CSS + JS in einer Datei) | GitHub-Repo |
| `Code.gs` | Backend-Skript | Google Apps Script Editor |
| `README.md` | Diese Doku | GitHub-Repo |

### Architektur

```
Spieler zahlt (PayPal / GiroCode)
        │
        ▼
Make.com PayPal-Webhook ──► schreibt Zeile ins Google Sheet   [Status: "Auf PayPal"]
                                        │
index.html (GitHub Pages) ◄── liest ────┤
        │                               │
        └── Admin "Kassensturz" ── setzt Status ──► "Im C24-Pocket verschoben"
```

Kein eigener Server nötig. Google Sheet = Datenbank, Apps Script = API, GitHub Pages = Hosting. Alles kostenlos.

### Warum Apps Script statt Google-Sheets-API direkt?

Die Sheets-API bräuchte einen API-Key im Frontend (unsicher, jeder kann ihn im Quelltext lesen) oder OAuth-Login (nervig für die Spieler). Apps Script läuft unter *deinem* Google-Account, prüft das Admin-Passwort serverseitig und liefert nur die Daten zurück, die es soll.

### Datensicherheit — es geht nichts verloren

1. **Google Drive Cloud** — Sheet liegt redundant bei Google, Handy/Laptop kaputt ist egal
2. **Versionsverlauf** — `Datei → Versionsverlauf` stellt jeden Stand der Saison wieder her
3. **Monats-Backup** — `backupTriggerAnlegen()` im Apps Script einmal ausführen, dann landet am 1. jedes Monats eine Kopie im Drive-Ordner „Baggerkasse-Backups"
4. **Append-only-Prinzip** — die App löscht nie Zeilen, sie ändert nur die Status-Spalte. Am Saisonende hast du ein lückenloses Kassenbuch.

---

## 2. Setup am Laptop — Schritt für Schritt

Gesamtdauer ca. 45 Minuten. Reihenfolge einhalten, jeder Schritt braucht das Ergebnis des vorherigen.

### Schritt 1 — Google Sheet anlegen (5 Min)

1. [sheets.new](https://sheets.new) → neues Sheet, Name z.B. „Mannschaftskasse LEV IV"
2. Tab unten umbenennen in **`Kasse`** (exakt so, das Skript sucht danach)
3. Zeile 1 als Header ausfüllen:

| A | B | C | D | E | F |
|---|---|---|---|---|---|
| Datum | Name | Grund | Betrag | Typ | Status |

**Spaltenwerte:**
- **Typ:** `Strafe` (offene Forderung) oder `Zahlung` (Geldeingang)
- **Status Strafe:** `Offen` / `Bezahlt` / `Verwarnung`
- **Status Zahlung:** `Auf PayPal` / `Im C24-Pocket verschoben`

Zum Testen zwei Beispielzeilen eintragen:

| 21.07.2026 | Paul | Zu spät zum Training | 2,50 | Strafe | Offen |
| 22.07.2026 | Marie | Strafe 14.07. | 2,50 | Zahlung | Auf PayPal |

### Schritt 2 — Apps Script einrichten (10 Min)

1. Im Sheet: **Erweiterungen → Apps Script**
2. Den vorhandenen Beispielcode löschen, kompletten Inhalt von `Code.gs` einfügen, speichern (Strg+S)
3. **Zahnrad (Projekteinstellungen) → Skript-Eigenschaften → Eigenschaft hinzufügen:**
   - Name: `ADMIN_PASS`
   - Wert: dein Kassenwart-Passwort
4. **Bereitstellen → Neue Bereitstellung → Zahnrad → Web-App**
   - Beschreibung: „v1"
   - Ausführen als: **Ich**
   - Zugriff: **Jeder** ← wichtig, sonst können die Spieler nichts lesen
5. Beim ersten Mal Google-Berechtigungen bestätigen („Erweitert" → „Zu Projekt wechseln" → Zulassen)
6. Die angezeigte URL kopieren, endet auf `/exec`

**Backup aktivieren:** Oben im Editor die Funktion `backupTriggerAnlegen` auswählen → „Ausführen". Einmalig, danach läuft es automatisch.

### Schritt 3 — index.html konfigurieren (5 Min)

Datei im Texteditor öffnen (VS Code, Notepad++, oder Notepad tut's auch). Etwa Zeile 380, `CONFIG`-Block:

```js
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfy.../exec",  // aus Schritt 2
  PAYPAL_ME:       "https://paypal.me/DeinName",
  IBAN:            "DE00 0000 0000 0000 0000 00",   // C24 Pocket IBAN
  KONTOINHABER:    "Jakob Gross",                    // ohne Umlaute
  BIC:             "",                               // optional, darf leer bleiben
};
```

Speichern. Datei per Doppelklick im Browser öffnen — der gelbe Demo-Banner muss verschwunden sein und deine Sheet-Testzeilen erscheinen. **Wenn das hier nicht klappt, nicht weitermachen** — Fehler auf GitHub zu suchen ist deutlich unangenehmer.

### Schritt 4 — GitHub Pages (15 Min)

1. Account auf [github.com](https://github.com) anlegen (falls noch nicht vorhanden)
2. **New repository** → Name z.B. `kasse` → **Public** (nötig für kostenlose Pages) → Create
3. **Add file → Upload files** → `index.html` und `README.md` reinziehen → Commit
4. **Settings → Pages** → Source: „Deploy from a branch", Branch: `main`, Ordner: `/ (root)` → Save
5. 1–2 Minuten warten, dann ist die Seite unter `https://DEINNAME.github.io/kasse` live

> **Wichtig:** Das Repo ist public, also ist auch der Quelltext lesbar. Deine IBAN und der PayPal-Link stehen darin. Das ist unkritisch (eine IBAN erlaubt keine Abbuchung), aber sei dir dessen bewusst. Das **Admin-Passwort steht nicht im Code** — es wird nur serverseitig im Apps Script geprüft.

### Schritt 5 — Eigene Domain (optional, 10 Min)

1. Domain kaufen (Netcup / INWX / Hetzner, ca. 5–15 €/Jahr)
2. Im Repo: **Add file → Create new file** → Name `CNAME`, Inhalt nur die Domain: `baggerkasse.de`
3. Beim Domain-Anbieter vier A-Records anlegen auf:
   ```
   185.199.108.153
   185.199.109.153
   185.199.110.153
   185.199.111.153
   ```
4. In Settings → Pages die Domain eintragen und **„Enforce HTTPS"** anhaken (erscheint erst, wenn das Zertifikat ausgestellt ist, kann eine Stunde dauern)

### Schritt 6 — Make.com anpassen (5 Min)

Ans Ende deines PayPal-Szenarios ein **Google Sheets → Add a Row**-Modul:

| Spalte | Wert |
|---|---|
| Datum | `{{now}}` |
| Name | Zahler-Name aus dem Webhook |
| Grund | Verwendungszweck / Note |
| Betrag | Betrag |
| Typ | `Zahlung` (fest) |
| Status | `Auf PayPal` (fest) |

### Schritt 7 — Testlauf

1. Admin-Bereich öffnen (Link ganz unten), Passwort eingeben
2. Testweise eine Strafe eintragen → muss als neue Zeile im Sheet auftauchen
3. „Wöchentlichen Kassensturz machen" durchklicken → Status der Zahlung im Sheet muss auf „Im C24-Pocket verschoben" springen
4. Testzeilen im Sheet löschen, Link ins Team teilen

---

## 3. Späteres Anpassen

**Kleinigkeiten (Texte, Beträge, Farben, CONFIG):** direkt auf GitHub — Datei öffnen, Stift-Symbol, ändern, „Commit changes". Nach ~1 Minute ist die Seite aktualisiert. Geht auch vom Handy.

**Größere Änderungen:** Datei bei Claude hochladen und beschreiben, was rein soll. **Wichtig:** immer die *aktuelle* Version hochladen, sonst gehen deine zwischenzeitlichen Anpassungen verloren.

**Wenn nach einer Änderung nichts passiert:** Browser-Cache. Strg+Shift+R erzwingt Neuladen.

### Wo was in der Datei steht

| Was | Wo |
|---|---|
| Farben, Design | `:root { }` ganz oben im `<style>` |
| Strafenkatalog-Text | Sektion `<!-- Strafenkatalog -->` |
| PayPal-Link, IBAN | `const CONFIG` im `<script>` |
| Absage-Staffel (×1,5) | Funktion `absageStrafe()` |

---

## 4. Strafenkatalog (in der App hinterlegt)

Gilt bei Absage weniger als 24 Stunden vor dem Training, nachdem man sich angemeldet hatte:

| Absage | Konsequenz |
|---|---|
| 1. Mal | Verwarnung (wird mit 0 € protokolliert) |
| 2. Mal | 1,00 € + weniger Spielzeit am Spieltag |
| jedes weitere | × 1,5 vom vorherigen Betrag |

Ergibt: 3. Mal 1,50 € · 4. Mal 2,25 € · 5. Mal 3,38 € · 6. Mal 5,06 €

**Absage-Zähler:** Das Dashboard hat eine eigene Sektion, die für jeden Spieler zeigt, wie viele Absagen er in der Saison hat und was die nächste kosten würde. Die Verwarnung beim 1. Mal wird dort sichtbar — sie kostet 0 €, taucht also nicht unter „offene Strafen" auf, ist aber lückenlos dokumentiert. Für alle sichtbar, das ist die eigentliche Abschreckung.

**Eintragen:** Im Admin-Formular „Spontane Absage" wählen und den Namen tippen — die App zählt die bisherigen Absagen selbst und schlägt Nummer und Betrag automatisch vor. Nur bei abweichender Schreibweise des Namens (z.B. „Paul" vs. „Paul M.") musst du die Nummer korrigieren.

---

## 5. Offene Entscheidung: PayPal Pool

Alternative zum PayPal.me-Setup. Ein Pool läuft maximal 6 Monate, das Enddatum ist vorher jederzeit verschiebbar, Geld bleibt auch nach Ablauf abrufbar. Vorteil: Alle sehen die gesammelte Summe.

**Vor der Umstellung unbedingt testen:** ob Pool-Einzahlungen dieselben Make.com-Webhook-Events auslösen wie normale Zahlungen. Falls nicht, müsstest du Eingänge manuell ins Sheet eintragen — dann lohnt sich der Wechsel nicht.

Der Pool ersetzt das Dashboard nicht: Er zeigt, was reingekommen ist, nicht wer noch schuldet. Und er überlebt die Saison nicht — das Sheet schon.

---

## 6. Team-Info für WhatsApp

> 🏐 **Mannschaftskasse ist jetzt online**
>
> Ab sofort könnt ihr hier jederzeit sehen, wie es um die Kasse steht:
> 👉 https://DEINLINK
>
> Was ihr da findet:
> • aktueller Kassenstand
> • wer noch offene Strafen hat
> • den kompletten Strafenkatalog
> • QR-Codes zum direkt Bezahlen (PayPal oder Überweisung)
>
> Kein Login, keine App-Installation — einfach Link öffnen. Am besten zum Startbildschirm hinzufügen.
>
> ⚠️ Wichtig beim Zahlen: **Verwendungszweck nicht vergessen** (Name – Grund – Datum), sonst kann ich die Zahlung nicht zuordnen. In der App gibt's dafür einen Button, der euch den Text fertig zum Kopieren baut.
>
> Fragen → an mich.
