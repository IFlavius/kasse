# 🏐 Mannschaftskasse L.E. Volleys IV

Kassenstand, Absagen pro Spieler, Ausgaben und QR-Codes zum Bezahlen. Read-only für alle Spieler, Admin-Bereich passwortgeschützt.

**Live:** https://iflavius.github.io/kasse

---

## 1. Das Datenmodell

Eine Zeile pro Absage, zwei Häkchen. Mehr nicht.

**Tab `Kasse`**

| A: Datum | B: Name | C: Nr | D: Betrag | E: Bezahlt | F: Verbucht |
|---|---|---|---|---|---|
| 20.08.2026 | Tim | 2 | 1,00 | 20.08.2026 | |

- **Nr** — wievielte Absage des Spielers (1 = Verwarnung, 0 €)
- **Bezahlt** — leer = schuldet noch. Datum = hat gezahlt.
- **Verbucht** — leer = Geld noch nicht aufs C24-Pocket übertragen.

**Tab `Ausgaben`**

| A: Datum | B: Zweck | C: Betrag |
|---|---|---|
| 12.08.2026 | Neue Bälle | 24,00 |

**Daraus ergibt sich alles:**
- Kassenstand = Summe der bezahlten Absagen − Summe der Ausgaben
- Offen = Summe der unbezahlten Absagen
- Kassensturz = alles, was bezahlt, aber noch nicht verbucht ist

Es gibt keine Status-Texte zum Vertippen und keine zweite Zeilenart. Es werden nie Zeilen gelöscht, nur Häkchen gesetzt — am Saisonende steht dort ein lückenloses Kassenbuch.

### Architektur

```
index.html (GitHub Pages) ──► Apps Script Web-App ──► Google Sheet
```

Kein Server, kein Make.com, keine Webhooks. Zahlungen hakst du selbst ab — bei zwölf Spielern sind das ein paar Klicks im Monat.

> ⚠️ **Merksatz:** `index.html` und `Code.gs` gehören zusammen. Wird eine geändert, im Zweifel beide tauschen. Und Skript-Änderungen brauchen **immer eine neue Bereitstellung** — Speichern allein reicht nicht.

---

## 2. Die Regel

Wer sich anmeldet und dann weniger als 24 Stunden vor dem Training ohne wichtigen Grund absagt, zahlt.

| Absage | Kostet |
|---|---|
| 1. Mal | Verwarnung – 0 € |
| 2. Mal | 1,00 € + weniger Spielzeit |
| jedes weitere | × 1,5, aufgerundet auf 50 Cent |

Ergibt: 1,00 / 1,50 / 2,50 / 3,50 / 5,50 / 8,00 €

Aufgerundet statt kaufmännisch gerundet — sonst wäre die 4. Absage (2,25 → 2,00 €) billiger als die Staffel vorsieht.

**Bedienung:** Spieler aus dem Dropdown wählen → Vorschau zeigt „Tim · 3. Absage → 1,50 €" → Eintragen. Nummer und Betrag rechnet das Skript selbst. Kassiert wird mit einem Klick auf „✓ X € kassiert" in der Spielerzeile. Vertippt? „↩ Letzte löschen" nimmt den letzten Eintrag zurück, solange er nicht verbucht ist.

---

## 3. Setup

### Schritt 1 — Sheet + Skript (10 Min)

1. Neues Google Sheet anlegen ([sheets.new](https://sheets.new))
2. **Erweiterungen → Apps Script**, Beispielcode löschen, `Code.gs` einfügen, speichern
3. Projekt oben links benennen (nicht „Unbenanntes Projekt")
4. Oben die Funktion **`setup`** auswählen und **Ausführen** → legt beide Tabs mit korrekten Headern an
   - Berechtigungswarnung *„This app hasn't been verified"* ist normal, die App bist du selbst: **Advanced → Go to … (unsafe) → Allow**
5. **Zahnrad → Skript-Eigenschaften:** `ADMIN_PASS` = dein Passwort (kein Leerzeichen am Ende!)
6. **Bereitstellen → Neue Bereitstellung → Web-App**
   - Ausführen als: **Ich** · Zugriff: **Jeder** (nicht „Jeder mit Google-Konto")
7. URL kopieren — endet auf `/exec`, nicht `/dev`

**Backup:** Funktion `backupTriggerAnlegen` einmal ausführen → ab dann monatliche Kopie in Drive.

### Schritt 2 — index.html konfigurieren (5 Min)

`CONFIG`-Block oben im `<script>`:

```js
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/.../exec",
  PAYPAL_ME:       "https://paypal.me/DeinName",
  IBAN:            "DE00 0000 0000 0000 0000 00",
  KONTOINHABER:    "Jakob Gross",        // ohne Umlaute
  BIC:             "",
  SPIELER: ["Jakob","Tim","Tyler", ...], // ← eure Mannschaft
};
```

Die `SPIELER`-Liste ist die einzige Stelle, an der Namen stehen. Dropdown statt Freitext heißt: keine Tippfehler, keine doppelten Zähler.

> ⚠️ **Nicht per Doppelklick testen** — bei `file://` blockiert Chrome den Abruf. Entweder `python -m http.server 8000` im Projektordner und http://localhost:8000, oder direkt auf GitHub Pages testen.

### Schritt 3 — GitHub Pages (10 Min)

`index.html`, `icon.png` und `README.md` ins Repo, dann **Settings → Pages** → Branch `main`, Ordner `/ (root)`. Nach 1–2 Minuten live.

> Repo ist public, der Quelltext also lesbar. IBAN und PayPal-Link stehen darin — unkritisch. Das **Passwort steht nicht im Code**, es wird serverseitig geprüft.

### Optional — eigene Domain

Domain kaufen (5–15 €/Jahr), Datei `CNAME` mit der Domain ins Repo, beim Anbieter vier A-Records:

```
185.199.108.153   185.199.109.153   185.199.110.153   185.199.111.153
```

---

## 4. Anpassen

**Setup:** Git installieren, in VS Code `Strg+Shift+G` → „Clone Repository" → „Clone from GitHub".

**Danach:** Datei ändern → Source Control → Nachricht → Commit → Sync. Mit `git.postCommitCommand: push` in den Settings entfällt der zweite Klick.

| Was | Wo in `index.html` |
|---|---|
| Mannschaft, IBAN, PayPal | `const CONFIG` |
| Farben | `:root { }` oben im `<style>` |
| Regel-Text | Sektion `<!-- Die Regel -->` |
| Staffel-Berechnung | Funktion `strafe(nr)` — auch in `Code.gs` als `betragFuer_` anpassen! |

---

## 5. Troubleshooting

| Symptom | Ursache | Fix |
|---|---|---|
| „Verbindung fehlgeschlagen", `/exec` zeigt im Browser aber JSON | Seite läuft über `file://` | localhost oder GitHub Pages nutzen |
| `/exec` zeigt Login-Seite | Zugriff nicht auf „Jeder" | Bereitstellungen verwalten → Stift |
| „Tab 'Kasse' fehlt" | `setup()` nicht ausgeführt | im Apps Script `setup` ausführen |
| „Unbekannte Aktion" | altes `Code.gs` aktiv | neu einfügen **und neu bereitstellen** |
| „ADMIN_PASS ist nicht gesetzt" | Skript-Eigenschaft fehlt | Zahnrad → Skript-Eigenschaften |
| „Falsches Passwort" | Wert stimmt nicht | Eigenschaft neu setzen, auf Leerzeichen achten |
| Änderung wirkt nicht | Browser-Cache | `Strg+Shift+R` |

Immer zuerst die `/exec`-URL direkt im Browser aufrufen — das trennt Backend- von Frontend-Problemen. Danach F12 → Console.

---

## 6. Datensicherheit

1. **Google Drive** — Sheet liegt redundant bei Google
2. **Versionsverlauf** — `Datei → Versionsverlauf` stellt jeden Stand wieder her
3. **Monats-Backup** — via `backupTriggerAnlegen()`
4. **Append-only** — es werden nur Häkchen gesetzt, nie Zeilen gelöscht (Ausnahme: „Letzte löschen", nur für unverbuchte Einträge)

---

## 7. Team-Info für WhatsApp

> 🏐 **Mannschaftskasse ist jetzt online**
>
> 👉 https://DEINLINK
>
> Da seht ihr jederzeit:
> • den aktuellen Kassenstand
> • wer wie oft abgesagt hat und was noch offen ist
> • die Regel im Klartext
> • QR-Codes zum direkt Bezahlen (PayPal oder Überweisung)
>
> Kein Login, keine Installation — einfach Link öffnen und zum Startbildschirm hinzufügen.
>
> Fragen → an mich.