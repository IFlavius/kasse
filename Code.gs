/**
 * BAGGERKASSE – Google Apps Script Backend (Code.gs)
 * ---------------------------------------------------
 * Datenquelle: ein Google Sheet mit Tab "Kasse" und diesen Spalten (Zeile 1 = Header):
 *   A: Datum | B: Name | C: Grund | D: Betrag | E: Typ | F: Status
 *
 *   Typ:    "Strafe"  (offene Forderung)  oder  "Zahlung" (Geldeingang)
 *   Status: Strafe  -> "Offen" / "Bezahlt"
 *           Zahlung -> "Auf PayPal" / "Im C24-Pocket verschoben"
 *
 * WICHTIG: Es werden NIE Zeilen gelöscht – nur Status geändert (Append-only-Log).
 * Dadurch bleibt die komplette Saison-Historie erhalten.
 *
 * Setup:
 * 1. Sheet anlegen, Tab "Kasse" mit Header-Zeile.
 * 2. Erweiterungen -> Apps Script -> diesen Code einfügen.
 * 3. Projekt-Einstellungen -> Skript-Eigenschaften -> "ADMIN_PASS" = dein Passwort.
 * 4. Bereitstellen -> Neue Bereitstellung -> Web-App:
 *      Ausführen als: ICH  |  Zugriff: Jeder
 * 5. Die /exec-URL in der App unter CONFIG.APPS_SCRIPT_URL eintragen.
 *
 * Make.com (PayPal-Webhook) schreibt Zahlungen direkt als neue Zeile ins Sheet:
 *   Datum | Name | Grund | Betrag | "Zahlung" | "Auf PayPal"
 */

const SHEET_NAME = "Kasse";

function sheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function fmtDate_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "dd.MM.yyyy");
  }
  return String(v || "");
}

/* ---------- GET: Daten lesen ---------- */
function doGet(e) {
  const rows = sheet_().getDataRange().getValues().slice(1); // Header weg
  const payments = [], spielerMap = {};

  rows.forEach(function (r) {
    const name = String(r[1] || "");
    const betrag = Number(r[3]) || 0;
    const status = String(r[5] || "");

    if (r[4] === "Strafe") {
      const key = name.trim().toLowerCase();
      if (!spielerMap[key]) spielerMap[key] = { name: name, anzahl: 0, offen: 0, letzte: "" };
      spielerMap[key].anzahl++;                              // zählt auch Verwarnungen (0 €)
      if (status === "Offen") spielerMap[key].offen += betrag;
      spielerMap[key].letzte = fmtDate_(r[0]);
    }
    if (r[4] === "Zahlung") {
      payments.push({ datum: fmtDate_(r[0]), name: name, betrag: betrag, status: status });
    }
  });

  payments.reverse(); // Neueste zuerst
  const spieler = Object.keys(spielerMap).map(function (k) { return spielerMap[k]; });

  return json_({ ok: true, payments: payments, spieler: spieler });
}

/* ---------- POST: Admin-Aktionen ---------- */
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: "Ungültige Anfrage" }); }

  const pass = PropertiesService.getScriptProperties().getProperty("ADMIN_PASS");
  if (!pass || body.pass !== pass) {
    return json_({ ok: false, error: "Falsches Passwort" });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // parallele Schreibzugriffe vermeiden
  try {
    if (body.action === "kassensturz") return kassensturz_();
    if (body.action === "strafe")      return neueStrafe_(body);
    if (body.action === "strafeBezahlt") return strafeBezahlt_(body);
    return json_({ ok: false, error: "Unbekannte Aktion" });
  } finally {
    lock.releaseLock();
  }
}

/* Alle noch nicht verschobenen Zahlungen -> "Im C24-Pocket verschoben".
 * Bewusst tolerant: erfasst auch Zeilen mit abweichendem oder leerem Status,
 * damit kein Geldeingang still liegen bleibt. */
function kassensturz_() {
  const sh = sheet_();
  const data = sh.getDataRange().getValues();
  let updated = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][4] === "Zahlung" && data[i][5] !== "Im C24-Pocket verschoben") {
      sh.getRange(i + 1, 6).setValue("Im C24-Pocket verschoben");
      updated++;
    }
  }
  return json_({ ok: true, updated: updated });
}

/* Neue Strafe als neue Zeile (Append-only).
 * Betrag 0 = Verwarnung (z.B. 1. spontane Absage) – wird protokolliert,
 * taucht aber nicht als offene Strafe in der App auf. */
function neueStrafe_(b) {
  const betrag = Number(b.betrag);
  if (!b.name || !b.grund || isNaN(betrag) || betrag < 0) {
    return json_({ ok: false, error: "Name, Grund und Betrag nötig" });
  }
  sheet_().appendRow([new Date(), b.name, b.grund, betrag, "Strafe", betrag > 0 ? "Offen" : "Verwarnung"]);
  return json_({ ok: true });
}

/* Strafe manuell als bezahlt markieren (Name + Grund müssen matchen) */
function strafeBezahlt_(b) {
  const sh = sheet_();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][4] === "Strafe" && data[i][5] === "Offen" &&
        data[i][1] === b.name && data[i][2] === b.grund) {
      sh.getRange(i + 1, 6).setValue("Bezahlt");
      return json_({ ok: true });
    }
  }
  return json_({ ok: false, error: "Strafe nicht gefunden" });
}

/* ---------- Automatisches Monats-Backup (optional, sehr empfohlen) ----------
 * Einmalig ausführen: Trigger einrichten über backupTriggerAnlegen().
 * Kopiert das komplette Sheet am 1. jedes Monats in einen Backup-Ordner in Drive.
 */
function backupTriggerAnlegen() {
  ScriptApp.newTrigger("monatsBackup_")
    .timeBased().onMonthDay(1).atHour(4).create();
}

function monatsBackup_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const file = DriveApp.getFileById(ss.getId());
  const ordner = DriveApp.getFoldersByName("Baggerkasse-Backups").hasNext()
    ? DriveApp.getFoldersByName("Baggerkasse-Backups").next()
    : DriveApp.createFolder("Baggerkasse-Backups");
  const stempel = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");
  file.makeCopy("Baggerkasse Backup " + stempel, ordner);
}
