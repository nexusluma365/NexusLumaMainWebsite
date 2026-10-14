/**
 * NEXUS LUMA — Contractor Lead System pipeline (Nexus Luma's own prospects)
 *
 * Receives records from:
 *   /api/submit-qualification      (status QUALIFIED or CALL_REQUESTED)
 *   /api/verify-lead-system-deposit and /api/stripe-webhook
 *                                  (updateEmail + status DEPOSIT_PAID)
 *
 * SETUP
 *  1. Create a Google Sheet → Extensions → Apps Script → paste this file.
 *  2. Run setupPipelineSheet() once.
 *  3. Deploy → New deployment → Web app (Execute as: Me, Access: Anyone).
 *  4. Put the Web App URL in Netlify as LEAD_SYSTEM_WEBHOOK_URL and redeploy.
 *
 * Until LEAD_SYSTEM_WEBHOOK_URL is set, the site writes these records into the
 * existing legacy "Leads" sheet (google-apps-script.js) instead.
 */

var SHEET_NAME = "Lead System Pipeline";
var HEADERS = [
  "Submitted", "Lead ID", "Status", "Intent", "Name", "Business", "Email", "Phone",
  "Trade", "Service", "Service Area", "Has Website", "Website", "Running Ads", "Ad Budget",
  "Notes", "Source", "UTM Source", "UTM Campaign", "UTM Term", "GCLID", "Landing Page",
  "Payment Intent", "Deposit Paid At"
];
var STATUS_COLORS = {
  QUALIFIED: "#fff9c4",
  CALL_REQUESTED: "#e1f5fe",
  DEPOSIT_PAID: "#c8e6c9"
};

function setupPipelineSheet() {
  var sheet = getSheet_();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setBackground("#101326").setFontColor("#ffffff").setFontWeight("bold");
  sheet.setFrozenRows(1);
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  return sheet;
}

function findRow_(sheet, column, value) {
  if (!value) return -1;
  var values = sheet.getRange(1, column, sheet.getLastRow(), 1).getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]).toLowerCase().trim() === String(value).toLowerCase().trim()) return i + 1;
  }
  return -1;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = getSheet_();
    var col = function (name) { return HEADERS.indexOf(name) + 1; };

    if (data.updateEmail || (data.status === "DEPOSIT_PAID" && data.leadId)) {
      var row = findRow_(sheet, col("Lead ID"), data.leadId);
      if (row < 0) row = findRow_(sheet, col("Email"), data.updateEmail);
      if (row < 0) {
        sheet.appendRow([new Date(), data.leadId || "", data.status, "deposit", "", "", data.updateEmail || ""]);
        row = sheet.getLastRow();
      }
      sheet.getRange(row, col("Status")).setValue(data.status).setBackground(STATUS_COLORS[data.status] || "#ffffff");
      if (data.paymentIntentId) sheet.getRange(row, col("Payment Intent")).setValue(data.paymentIntentId);
      if (data.status === "DEPOSIT_PAID") sheet.getRange(row, col("Deposit Paid At")).setValue(new Date());
      return json_({ ok: true, updated: row });
    }

    var c = data.campaign || {};
    sheet.appendRow([
      new Date(data.submittedAt || Date.now()), data.leadId, data.status, data.intent, data.name, data.business,
      data.email, data.phone, data.trade, data.service, data.serviceArea, data.hasWebsite, data.website,
      data.runningAds, data.adBudget, data.notes, data.source, c.utm_source, c.utm_campaign, c.utm_term,
      c.gclid, c.landingPage, "", ""
    ]);
    sheet.getRange(sheet.getLastRow(), col("Status")).setBackground(STATUS_COLORS[data.status] || "#ffffff");
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
