/**
 * MANNSCHAFTSKASSE L.E. VOLLEYS IV – Backend (Code.gs)
 * =====================================================
 *
 * DATENMODELL – eine Zeile pro Vorgang, zwei Häkchen. Sonst nichts.
 *
 * Tab "Kasse"    A: Datum | B: Name | C: Nr | D: Betrag | E: Bezahlt | F: Verbucht
 * Tab "Ausgaben" A: Datum | B: Zweck | C: Betrag
 *
 *   Nr       = wievielte Absage des Spielers (1 = Verwarnung, 0 €)
 *   Bezahlt  = leer oder Datum. Leer = schuldet noch.
 *   Verbucht = leer oder Datum. Leer = Geld noch nicht aufs C24-Pocket übertragen.
 *
 *   Kassenstand = Summe(bezahlte Absagen) - Summe(Ausgaben)
 *   Kassensturz = alles, was bezahlt, aber noch nicht verbucht ist
 *
 * Es werden nie Zeilen gelöscht, nur Häkchen gesetzt (Append-only).
 *
 * SETUP
 * 1. Diesen Code ins Apps Script des Sheets einfügen und speichern.
 * 2. Oben Funktion "setup" wählen und ausführen -> legt beide Tabs korrekt an.
 * 3. Zahnrad -> Skript-Eigenschaften -> ADMIN_PASS = dein Passwort.
 * 4. Bereitstellen -> Neue Bereitstellung -> Web-App
 *    Ausführen als: ICH | Zugriff: JEDER
 * 5. /exec-URL in index.html unter CONFIG.APPS_SCRIPT_URL eintragen.
 *
 * WICHTIG: Nach jeder Code-Änderung neu bereitstellen
 * (Bereitstellen -> Bereitstellungen verwalten -> Stift -> Version: Neu).
 */

const TAB_KASSE = "Kasse";
const TAB_AUSGABEN = "Ausgaben";

/* ══════════════════ Setup ══════════════════ */
/** Einmal ausführen: legt beide Tabs mit korrekten Headern an. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let k = ss.getSheetByName(TAB_KASSE) || ss.insertSheet(TAB_KASSE);
  if (k.getLastRow() === 0) {
    k.appendRow(["Datum", "Name", "Nr", "Betrag", "Bezahlt", "Verbucht"]);
    k.getRange("A1:F1").setFontWeight("bold");
    k.setFrozenRows(1);
  }

  let a = ss.getSheetByName(TAB_AUSGABEN) || ss.insertSheet(TAB_AUSGABEN);
  if (a.getLastRow() === 0) {
    a.appendRow(["Datum", "Zweck", "Betrag"]);
    a.getRange("A1:C1").setFontWeight("bold");
    a.setFrozenRows(1);
  }

  SpreadsheetApp.getUi().alert("Fertig. Tabs 'Kasse' und 'Ausgaben' sind bereit.");
}

/* ══════════════════ Helfer ══════════════════ */
function tab_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error("Tab '" + name + "' fehlt – bitte einmal setup() ausführen.");
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function fmt_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "dd.MM.yyyy");
  if (v) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd.MM.yyyy");
  }
  return String(v || "");
}

const istGesetzt_ = v => v !== "" && v !== null && v !== undefined;

/* ══════════════════ GET: Daten lesen ══════════════════ */
function doGet(e) {
  const absagen = [], ausgaben = [], spielerMap = {};
  let bezahltSumme = 0, offenSumme = 0, unverbucht = 0, unverbuchtAnzahl = 0;

  tab_(TAB_KASSE).getDataRange().getValues().slice(1).forEach(function (r) {
    if (!r[1]) return;                          // leere Zeile überspringen
    const name = String(r[1]).trim();
    const betrag = Number(r[3]) || 0;
    const bezahlt = istGesetzt_(r[4]);
    const verbucht = istGesetzt_(r[5]);

    const key = name.toLowerCase();
    if (!spielerMap[key]) spielerMap[key] = { name: name, anzahl: 0, offen: 0, letzte: "" };
    spielerMap[key].anzahl++;
    spielerMap[key].letzte = fmt_(r[0]);
    if (!bezahlt) spielerMap[key].offen += betrag;

    if (bezahlt) {
      bezahltSumme += betrag;
      if (!verbucht) { unverbucht += betrag; unverbuchtAnzahl++; }
    } else {
      offenSumme += betrag;
    }

    absagen.push({
      datum: fmt_(r[0]), name: name, nr: Number(r[2]) || 0,
      betrag: betrag, bezahlt: bezahlt, verbucht: verbucht
    });
  });

  tab_(TAB_AUSGABEN).getDataRange().getValues().slice(1).forEach(function (r) {
    if (!r[1]) return;
    ausgaben.push({ datum: fmt_(r[0]), zweck: String(r[1]), betrag: Number(r[2]) || 0 });
  });

  const ausgabenSumme = ausgaben.reduce(function (s, a) { return s + a.betrag; }, 0);
  const spieler = Object.keys(spielerMap).map(function (k) { return spielerMap[k]; });

  return json_({
    ok: true,
    kassenstand: bezahltSumme - ausgabenSumme,
    offen: offenSumme,
    unverbucht: unverbucht,
    unverbuchtAnzahl: unverbuchtAnzahl,
    spieler: spieler,
    absagen: absagen.reverse(),               // neueste zuerst
    ausgaben: ausgaben.reverse()
  });
}

/* ══════════════════ POST: Admin-Aktionen ══════════════════ */
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: "Ungültige Anfrage" }); }

  const pass = PropertiesService.getScriptProperties().getProperty("ADMIN_PASS");
  if (!pass) return json_({ ok: false, error: "ADMIN_PASS ist im Apps Script nicht gesetzt" });
  if (String(body.pass).trim() !== String(pass).trim()) {
    return json_({ ok: false, error: "Falsches Passwort" });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    switch (body.action) {
      case "absage":      return absage_(body);
      case "bezahlt":     return bezahlt_(body);
      case "ausgabe":     return ausgabe_(body);
      case "kassensturz": return kassensturz_();
      case "rueckgaengig":return rueckgaengig_(body);
      default:            return json_({ ok: false, error: "Unbekannte Aktion" });
    }
  } finally {
    lock.releaseLock();
  }
}

/** Absage-Betrag: ab der 2. Absage 1 EUR, jedes weitere Mal x1,5,
 *  aufgerundet auf 50 Cent. Die 1. Absage ist eine Verwarnung (0 EUR). */
function betragFuer_(nr) {
  if (nr < 2) return 0;
  return Math.ceil(Math.pow(1.5, nr - 2) * 2) / 2;
}

/** Neue Absage eintragen. Nummer wird serverseitig gezählt. */
function absage_(b) {
  const name = String(b.name || "").trim();
  if (!name) return json_({ ok: false, error: "Name fehlt" });

  const sh = tab_(TAB_KASSE);
  const rows = sh.getDataRange().getValues().slice(1);
  const key = name.toLowerCase();
  let bisher = 0;
  rows.forEach(function (r) {
    if (String(r[1]).trim().toLowerCase() === key) bisher++;
  });

  const nr = bisher + 1;
  const betrag = betragFuer_(nr);
  sh.appendRow([new Date(), name, nr, betrag, "", ""]);
  return json_({ ok: true, nr: nr, betrag: betrag });
}

/** Alle offenen Absagen eines Spielers als bezahlt markieren. */
function bezahlt_(b) {
  const name = String(b.name || "").trim().toLowerCase();
  if (!name) return json_({ ok: false, error: "Name fehlt" });

  const sh = tab_(TAB_KASSE);
  const data = sh.getDataRange().getValues();
  const heute = new Date();
  let summe = 0, anzahl = 0;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim().toLowerCase() === name && !istGesetzt_(data[i][4])) {
      sh.getRange(i + 1, 5).setValue(heute);
      summe += Number(data[i][3]) || 0;
      anzahl++;
    }
  }
  if (!anzahl) return json_({ ok: false, error: "Nichts offen bei " + b.name });
  return json_({ ok: true, anzahl: anzahl, summe: summe });
}

/** Ausgabe erfassen (Bälle, Trikots, ...). */
function ausgabe_(b) {
  const zweck = String(b.zweck || "").trim();
  const betrag = Number(b.betrag);
  if (!zweck || !(betrag > 0)) return json_({ ok: false, error: "Zweck und Betrag nötig" });
  tab_(TAB_AUSGABEN).appendRow([new Date(), zweck, betrag]);
  return json_({ ok: true });
}

/** Alles Bezahlte als aufs Konto übertragen markieren. */
function kassensturz_() {
  const sh = tab_(TAB_KASSE);
  const data = sh.getDataRange().getValues();
  const heute = new Date();
  let updated = 0, summe = 0;

  for (let i = 1; i < data.length; i++) {
    if (istGesetzt_(data[i][4]) && !istGesetzt_(data[i][5])) {
      sh.getRange(i + 1, 6).setValue(heute);
      summe += Number(data[i][3]) || 0;
      updated++;
    }
  }
  return json_({ ok: true, updated: updated, summe: summe });
}

/** Letzte Absage eines Spielers zurücknehmen (Vertipper korrigieren). */
function rueckgaengig_(b) {
  const name = String(b.name || "").trim().toLowerCase();
  const sh = tab_(TAB_KASSE);
  const data = sh.getDataRange().getValues();

  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]).trim().toLowerCase() === name) {
      if (istGesetzt_(data[i][5])) {
        return json_({ ok: false, error: "Bereits verbucht – bitte im Sheet korrigieren" });
      }
      sh.deleteRow(i + 1);
      return json_({ ok: true });
    }
  }
  return json_({ ok: false, error: "Keine Absage gefunden" });
}

/* ══════════════════ Monats-Backup (optional) ══════════════════
 * Einmal backupTriggerAnlegen() ausführen -> am 1. jedes Monats
 * landet eine Kopie im Drive-Ordner "Mannschaftskasse-Backups".
 * Wer keinen Drive-Zugriff geben will, löscht diese beiden Funktionen. */
function backupTriggerAnlegen() {
  ScriptApp.newTrigger("monatsBackup_").timeBased().onMonthDay(1).atHour(4).create();
}

function monatsBackup_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const file = DriveApp.getFileById(ss.getId());
  const it = DriveApp.getFoldersByName("Mannschaftskasse-Backups");
  const ordner = it.hasNext() ? it.next() : DriveApp.createFolder("Mannschaftskasse-Backups");
  const stempel = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");
  file.makeCopy("Kasse Backup " + stempel, ordner);
}