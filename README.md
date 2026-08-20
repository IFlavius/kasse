# 🏐 Mannschaftskasse L.E. Volleys IV

Web-Dashboard für die Mannschaftskasse: Kassenstand, Absagen pro Spieler, offene Beträge, Zahlungseingänge und QR-Codes zum Bezahlen. Read-only für alle Spieler, Admin-Bereich passwortgeschützt.

**Live:** https://iflavius.github.io/kasse

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

Kein eigener Server. Google Sheet = Datenbank, Apps Script = API, GitHub Pages = Hosting. Alles kostenlos.

> ⚠️ **Die wichtigste Regel des Projekts:** `index.html` und `Code.gs` müssen zusammenpassen — sie einigen sich auf dieselben JSON-Feldnamen. Wird eine geändert, im Zweifel beide tauschen. Und Änderungen am Skript brauchen **immer eine neue Bereitstellung**, Speichern allein reicht nicht.

### Warum Apps Script statt Google-Sheets-API?

Die Sheets-API bräuchte einen API-Key im Frontend (unsicher, steht im Quelltext) oder OAuth-Login (nervig für die Spieler). Apps Script läuft unter deinem Google-Account, prüft das Admin-Passwort serverseitig und liefert nur aggregierte Daten zurück.

---

## 2. Die Regel (in der App hinterlegt)

Es gibt genau **einen** Strafgrund: Wer sich anmeldet und dann weniger als 24 Stunden vor dem Training ohne wichtigen Grund absagt, zahlt.

| Absage | Kostet |
|---|---|
| 1. Mal | Verwarnung – 0 € |
| 2. Mal | 1,00 € + weniger Spielzeit am Spieltag |
| jedes weitere | × 1,5 vom vorherigen |

Ergibt: 3. Mal 1,50 € · 4. Mal 2,25 € · 5. Mal 3,38 € · 6. Mal 5,06 €

**Eintragen dauert zwei Sekunden:** Im Admin-Bereich nur den Namen tippen (Autovervollständigung aus bisherigen Spielern), die Vorschau zeigt sofort „Jonas · 4. Absage → 2,25 €", dann „Eintragen". Nummer und Betrag berechnet die App selbst aus der Sheet-Historie.

**Dashboard:** Eine Zeile pro Spieler mit Absage-Anzahl, Punkte-Anzeige, offenem Betrag und was die nächste kosten würde. Farbcodiert: rot = offener Betrag, gelb = Verwarnung, grün = bezahlt.

> **Wichtig:** Der Zähler matcht über den Namen. Immer gleich schreiben — nicht mal „Paul", mal „Paul M.", sonst zählt die App zwei Spieler.

---

## 3. Das Google Sheet

Tab-Name muss exakt **`Kasse`** lauten. Header in Zeile 1:

| A | B | C | D | E | F |
|---|---|---|---|---|---|
| Datum | Name | Grund | Betrag | Typ | Status |

**Erlaubte Werte — hier entstehen die meisten Fehler:**

| Typ | Erlaubter Status | Bedeutung |
|---|---|---|
| `Strafe` | `Offen` | Absage, noch nicht bezahlt |
| `Strafe` | `Bezahlt` | erledigt |
| `Strafe` | `Verwarnung` | 1. Absage, **Betrag muss 0 sein** |
| `Zahlung` | `Auf PayPal` | Geld eingegangen, liegt noch bei PayPal |
| `Zahlung` | `Im C24-Pocket verschoben` | manuell aufs Konto übertragen |

Häufige Fehler: `Offen` bei einer **Zahlung** (gibt es nicht — muss `Auf PayPal` sein) und eine Verwarnung mit Betrag 1 statt 0.

Die App ist bewusst tolerant gebaut: Eine Zahlung mit unbekanntem Status gilt als „noch auf PayPal" und taucht im nächsten Kassensturz auf, statt still verloren zu gehen.

**Append-only:** Es werden nie Zeilen gelöscht, nur die Status-Spalte geändert. Am Saisonende steht dort ein lückenloses Kassenbuch.

---

## 4. Setup — Schritt für Schritt

### Schritt 1 — Sheet anlegen (5 Min)

[sheets.new](https://sheets.new) → Tab unten umbenennen in `Kasse` → Header aus Abschnitt 3 eintragen. Zum Testen zwei Zeilen:

| 21.07.2026 | Paul | Spontane Absage (2. Mal) | 1 | Strafe | Offen |
| 22.07.2026 | Marie | Absage | 1 | Zahlung | Auf PayPal |

### Schritt 2 — Apps Script (10 Min)

1. Im Sheet: **Erweiterungen → Apps Script**
2. Beispielcode löschen, kompletten Inhalt von `Code.gs` einfügen, speichern
3. Projekt oben links benennen — nicht „Unbenanntes Projekt" lassen, der Name taucht in jedem Berechtigungsdialog auf
4. **Zahnrad → Skript-Eigenschaften → Eigenschaft hinzufügen:** `ADMIN_PASS` = dein Passwort
5. **Bereitstellen → Neue Bereitstellung → Zahnrad → Web-App**
   - Ausführen als: **Ich**
   - Zugriff: **Jeder** ← nicht „Jeder mit Google-Konto"
6. Berechtigungen bestätigen. Die Warnung *„This app hasn't been verified"* ist normal — die unverifizierte App bist du selbst. Über **Advanced → Go to … (unsafe)** → Allow.
   - *Sheets-Zugriff* braucht das Skript zwingend. *Drive-Zugriff* kommt nur von der Backup-Funktion; wer das nicht will, löscht `backupTriggerAnlegen` und `monatsBackup_` am Ende von `Code.gs`.
7. URL kopieren — endet auf `/exec`, **nicht** `/dev`

**Backup aktivieren:** Im Editor die Funktion `backupTriggerAnlegen` auswählen → Ausführen. Einmalig, danach automatisch.

### Schritt 3 — index.html konfigurieren (5 Min)

Etwa Zeile 327, `CONFIG`-Block:

```js
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfy.../exec",
  PAYPAL_ME:       "https://paypal.me/DeinName",
  IBAN:            "DE00 0000 0000 0000 0000 00",   // C24 Pocket
  KONTOINHABER:    "Jakob Gross",                    // ohne Umlaute
  BIC:             "",                               // darf leer bleiben
};
```

> ⚠️ **Nicht per Doppelklick testen.** Bei `file://` blockiert Chrome den Abruf („'file:' URLs are treated as unique security origins"). Entweder lokalen Server starten — im Explorer in den Ordner, `cmd` in die Adressleiste, dann `python -m http.server 8000` und http://localhost:8000 aufrufen — oder direkt zu GitHub Pages hochladen und dort testen.

### Schritt 4 — GitHub Pages (15 Min)

1. **New repository** → Name z.B. `baggerkasse` (steht später im Link) → **Public** → Create
2. Dateien hochladen, oder gleich per VS Code (Abschnitt 5)
3. **Settings → Pages** → Source „Deploy from a branch", Branch `main`, Ordner `/ (root)` → Save
4. 1–2 Minuten warten → live unter `https://iflavius.github.io/baggerkasse`

> Das Repo ist public, der Quelltext also lesbar. IBAN und PayPal-Link stehen darin — unkritisch, eine IBAN erlaubt keine Abbuchung. Das **Admin-Passwort steht nicht im Code**, es wird nur serverseitig geprüft.

### Schritt 5 — Make.com anpassen (5 Min)

Ans Ende des PayPal-Szenarios ein **Google Sheets → Add a Row**-Modul:

| Spalte | Wert |
|---|---|
| Datum | `{{now}}` |
| Name | Zahler-Name |
| Grund | Verwendungszweck / Note |
| Betrag | Betrag |
| Typ | `Zahlung` (fest) |
| Status | `Auf PayPal` (fest) |

### Schritt 6 — Testlauf

1. Admin-Bereich öffnen (Link ganz unten), Passwort eingeben
2. Absage eintragen → muss als neue Zeile im Sheet erscheinen
3. Kassensturz durchklicken → Status der Zahlung springt auf „Im C24-Pocket verschoben"
4. Testzeilen im Sheet löschen, Link ins Team teilen

### Optional — eigene Domain

Domain kaufen (Netcup/INWX/Hetzner, 5–15 €/Jahr), im Repo eine Datei `CNAME` mit nur der Domain anlegen, beim Anbieter vier A-Records setzen:

```
185.199.108.153   185.199.109.153   185.199.110.153   185.199.111.153
```

Dann in Settings → Pages eintragen und „Enforce HTTPS" anhaken — erscheint erst, wenn das Zertifikat ausgestellt ist.

---

## 5. Workflow zum Anpassen

**Einmalig einrichten:** Git installieren ([git-scm.com](https://git-scm.com)), in VS Code `Strg+Shift+G` → „Clone Repository" → „Clone from GitHub" → Repo wählen. GitHub Desktop ist damit überflüssig.

**Danach jede Änderung:** Datei bearbeiten und speichern → Source Control → Nachricht tippen → Commit → Sync Changes. Nach ~1 Minute ist Pages aktualisiert.

**Komfort:** In den VS-Code-Settings `git.postCommitCommand` auf `push` setzen — dann entfällt der zweite Klick.

**Größere Änderungen über Claude:** Aktuelle Datei hochladen und beschreiben, was rein soll. Immer die *aktuelle* Version schicken, sonst gehen zwischenzeitliche Anpassungen verloren.

### Wo was in `index.html` steht

| Was | Wo |
|---|---|
| Farben, Design | `:root { }` oben im `<style>` |
| Regel-Text fürs Team | Sektion `<!-- Regel -->` |
| PayPal-Link, IBAN | `const CONFIG` im `<script>`, ~Zeile 327 |
| Staffel-Berechnung | Funktion `strafe(n)` |

---

## 6. Troubleshooting

| Symptom | Ursache | Fix |
|---|---|---|
| „Verbindung zum Sheet fehlgeschlagen", `/exec`-URL zeigt im Browser aber sauberes JSON | Seite läuft über `file://` | über localhost oder GitHub Pages öffnen |
| `/exec`-URL zeigt Login-Seite | Zugriff nicht auf „Jeder" | Bereitstellungen verwalten → Stift → Zugriff ändern |
| `/exec`-URL zeigt Fehlerseite | Tab heißt nicht exakt `Kasse` | Tab umbenennen |
| Kassenstand da, aber alle Listen leer/0 | `index.html` und `Code.gs` aus verschiedenen Versionen | beide tauschen, Skript neu bereitstellen |
| Änderung am Skript wirkt nicht | nur gespeichert, nicht bereitgestellt | Bereitstellen → Verwalten → Stift → Version: **Neu** |
| Änderung an der Seite wirkt nicht | Browser-Cache | `Strg+Shift+R` |
| Betrag im Pocket, obwohl nichts überwiesen | Zahlung mit falschem Status im Sheet | Status auf `Auf PayPal` korrigieren |

Zum Eingrenzen immer zuerst die `/exec`-URL direkt im Browser-Tab aufrufen — was dort steht, trennt Backend- von Frontend-Problemen. Danach F12 → Console.

---

## 7. Datensicherheit

1. **Google Drive Cloud** — Sheet liegt redundant bei Google, Hardware-Defekt egal
2. **Versionsverlauf** — `Datei → Versionsverlauf` stellt jeden Stand der Saison wieder her
3. **Monats-Backup** — `backupTriggerAnlegen()` einmal ausführen, dann landet am 1. jedes Monats eine Kopie im Drive-Ordner „Baggerkasse-Backups"
4. **Append-only** — die App löscht nie Zeilen

---

## 8. Offene Entscheidung: PayPal Pool

Alternative zum PayPal.me-Setup. Ein Pool läuft maximal 6 Monate, das Enddatum ist vorher verschiebbar, Geld bleibt auch nach Ablauf abrufbar. Vorteil: Alle sehen die gesammelte Summe, Einzahler brauchen kein PayPal-Konto.

**Vor der Umstellung testen:** ob Pool-Einzahlungen dieselben Make.com-Webhook-Events auslösen wie normale Zahlungen. Falls nicht, müsstest du Eingänge manuell eintragen — dann lohnt der Wechsel nicht.

Der Pool ersetzt das Dashboard nicht: Er zeigt, was reingekommen ist, nicht wer noch schuldet. Und er überlebt die Saison nicht — das Sheet schon.

---

## 9. Team-Info für WhatsApp

> 🏐 **Mannschaftskasse ist jetzt online**
>
> Ab sofort könnt ihr jederzeit sehen, wie es um die Kasse steht:
> 👉 https://iflavius.github.io/kasse/
>
> Was ihr da findet:
> • aktueller Kassenstand
> • wer wie oft abgesagt hat und was noch offen ist
> • die Regel im Klartext
> • QR-Codes zum direkt Bezahlen (PayPal oder Überweisung)
>
> Kein Login, keine App-Installation — einfach Link öffnen. Am besten zum Startbildschirm hinzufügen.
>
> ⚠️ Wichtig beim Zahlen: **Verwendungszweck nicht vergessen** (Name – Absage – Datum), sonst kann ich die Zahlung nicht zuordnen. In der App gibt's dafür einen Button, der den Text fertig zum Kopieren baut.
>
> Fragen → an mich.