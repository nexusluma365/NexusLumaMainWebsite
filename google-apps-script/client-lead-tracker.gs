/**
 * NEXUS LUMA — Client lead tracker (leads from CLIENT contractor websites)
 *
 * Receives leads from /api/contractor-site-lead. Each client (clientId) gets
 * its own tab with a Status dropdown:
 *   NEW · CONTACTED · ESTIMATE SCHEDULED · WON · LOST
 * Share a client's tab (or a filtered view) with that contractor as their
 * interim lead dashboard. See docs/LEAD-SYSTEM.md for the full dashboard plan.
 *
 * SETUP
 *  1. Create a Google Sheet → Extensions → Apps Script → paste this file.
 *  2. Project Settings → Script properties → add WEBHOOK_SECRET (any long random string).
 *  3. Deploy → New deployment → Web app (Execute as: Me, Access: Anyone).
 *  4. In Netlify set CLIENT_LEADS_WEBHOOK_URL (Web App URL),
 *     CLIENT_LEADS_WEBHOOK_SECRET (same secret) and CLIENT_LEAD_ALLOWED_CLIENTS.
 */

var HEADERS = [
  "Date", "Lead ID", "Status", "Name", "Phone", "Email", "Service", "ZIP / Service Area",
  "Message", "Source", "Campaign", "GCLID", "Landing Page", "Notes"
];
var STATUSES = ["NEW", "CONTACTED", "ESTIMATE SCHEDULED", "WON", "LOST"];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var data = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET");
    if (secret && data.secret !== secret) return json_({ ok: false, error: "unauthorized" });

    var tabName = String(data.clientId || "unassigned").replace(/[^a-z0-9-]/gi, "").slice(0, 60) || "unassigned";
    var sheet = getClientSheet_(tabName);
    sheet.appendRow([
      new Date(data.date || Date.now()), data.leadId, STATUSES.indexOf(data.status) >= 0 ? data.status : "NEW",
      data.name, data.phone, data.email, data.service, data.serviceArea, data.message,
      data.source, data.campaign, data.gclid, data.landingPage, ""
    ]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

function getClientSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);
  sheet.appendRow(HEADERS);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setBackground("#101326").setFontColor("#ffffff").setFontWeight("bold");
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build();
  sheet.getRange(2, 3, 5000, 1).setDataValidation(rule);
  var range = sheet.getRange(2, 3, 5000, 1);
  var colors = { "NEW": "#dbeafe", "CONTACTED": "#fef9c3", "ESTIMATE SCHEDULED": "#ede9fe", "WON": "#dcfce7", "LOST": "#fee2e2" };
  sheet.setConditionalFormatRules(STATUSES.map(function (s) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(s).setBackground(colors[s]).setRanges([range]).build();
  }));
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
