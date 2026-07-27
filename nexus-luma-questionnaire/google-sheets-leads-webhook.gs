/**
 * Nexus Luma Google Sheets Lead Recorder
 *
 * Setup:
 * 1. Open your Google Sheet.
 * 2. Extensions -> Apps Script.
 * 3. Paste this file into Code.gs.
 * 4. Set SCRIPT_SECRET in Project Settings -> Script Properties.
 * 5. Run setupLeadSheet once.
 * 6. Deploy -> New deployment -> Web app.
 * 7. Execute as: Me. Who has access: Anyone.
 * 8. Copy the Web app URL into:
 *    - Questionnaire app: VITE_LEAD_SUBMISSION_ENDPOINT
 *    - Payment server: GOOGLE_SHEETS_WEBHOOK_URL
 */

const SHEET_NAME = "Leads";

const HEADERS = [
  "Lead ID",
  "Submitted At",
  "Paid",
  "Paid At",
  "Payment Status",
  "Payment Intent ID",
  "Payment Amount",
  "Payment Currency",
  "Recommended Service",
  "Lead Intent",
  "Path",
  "First Name",
  "Email",
  "Phone",
  "Business Name",
  "Website URL",
  "Primary Goal",
  "Traffic Source",
  "Lead Collection System",
  "Growth Problem",
  "Website Reason",
  "Website Goal",
  "Owns Domain",
  "Purchase Intent",
  "UTM Source",
  "UTM Medium",
  "UTM Campaign",
  "UTM Content",
  "UTM Term",
  "Ref",
  "Landing Page URL",
  "Referrer",
  "Device Type",
  "All Answers JSON",
  "Last Updated At",
];

const COLUMN_WIDTHS = {
  "Lead ID": 220,
  "Submitted At": 165,
  "Paid": 82,
  "Paid At": 165,
  "Payment Status": 130,
  "Payment Intent ID": 220,
  "Payment Amount": 120,
  "Payment Currency": 120,
  "Recommended Service": 190,
  "Lead Intent": 110,
  "Path": 120,
  "First Name": 130,
  "Email": 220,
  "Phone": 140,
  "Business Name": 190,
  "Website URL": 220,
  "Primary Goal": 180,
  "Traffic Source": 170,
  "Lead Collection System": 190,
  "Growth Problem": 210,
  "Website Reason": 190,
  "Website Goal": 180,
  "Owns Domain": 120,
  "Purchase Intent": 190,
  "UTM Source": 140,
  "UTM Medium": 140,
  "UTM Campaign": 170,
  "UTM Content": 170,
  "UTM Term": 150,
  "Ref": 140,
  "Landing Page URL": 240,
  "Referrer": 240,
  "Device Type": 110,
  "All Answers JSON": 360,
  "Last Updated At": 165,
};

function setupLeadSheet() {
  const sheet = getLeadSheet_();
  ensureHeaders_(sheet);
  formatLeadSheet_(sheet);
}

function doGet() {
  return json_({ ok: true, service: "nexus-luma-leads" });
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    assertAuthorized_(payload);

    const sheet = getLeadSheet_();
    ensureHeaders_(sheet);
    formatLeadSheet_(sheet);

    if (isPaymentPayload_(payload)) {
      upsertPayment_(sheet, payload);
    } else {
      upsertQuestionnaire_(sheet, payload);
    }

    return json_({ ok: true });
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: String(error) });
  }
}

function upsertQuestionnaire_(sheet, payload) {
  const contact = payload.contactInformation || {};
  const answers = payload.answers || {};
  const campaign = payload.campaignParameters || {};
  const leadId = payload.leadId || buildLeadId_(payload.recommendedService, contact.email, contact.firstName);
  const rowIndex = findRowByLeadId_(sheet, leadId) || sheet.getLastRow() + 1;

  const row = rowToObject_(sheet, rowIndex);
  row["Lead ID"] = leadId;
  row["Submitted At"] = payload.completedAt || row["Submitted At"] || new Date().toISOString();
  row["Paid"] = row["Paid"] || "No";
  row["Recommended Service"] = payload.recommendedService || "";
  row["Lead Intent"] = payload.leadIntent || "";
  row["Path"] = payload.path || "";
  row["First Name"] = contact.firstName || "";
  row["Email"] = contact.email || "";
  row["Phone"] = contact.phone || "";
  row["Business Name"] = contact.businessName || "";
  row["Website URL"] = contact.websiteUrl || "";
  row["Primary Goal"] = answers.primaryGoal || "";
  row["Traffic Source"] = answers.currentTrafficSource || "";
  row["Lead Collection System"] = answers.hasLeadCollectionSystem || "";
  row["Growth Problem"] = answers.mainGrowthProblem || "";
  row["Website Reason"] = answers.websiteReason || "";
  row["Website Goal"] = answers.websiteGoal || "";
  row["Owns Domain"] = answers.ownsDomain || "";
  row["Purchase Intent"] = answers.purchaseIntent || "";
  row["UTM Source"] = campaign.utm_source || "";
  row["UTM Medium"] = campaign.utm_medium || "";
  row["UTM Campaign"] = campaign.utm_campaign || "";
  row["UTM Content"] = campaign.utm_content || "";
  row["UTM Term"] = campaign.utm_term || "";
  row["Ref"] = campaign.ref || "";
  row["Landing Page URL"] = campaign.landingPageUrl || "";
  row["Referrer"] = campaign.referrer || "";
  row["Device Type"] = payload.deviceType || "";
  row["All Answers JSON"] = JSON.stringify(answers);
  row["Last Updated At"] = new Date().toISOString();

  writeObjectRow_(sheet, rowIndex, row);
}

function upsertPayment_(sheet, payload) {
  const leadId = payload.leadId || "";
  const rowIndex = findRowByLeadId_(sheet, leadId) || findLatestRowByEmail_(sheet, payload.customerEmail) || sheet.getLastRow() + 1;
  const row = rowToObject_(sheet, rowIndex);

  row["Lead ID"] = leadId || row["Lead ID"];
  row["Paid"] = payload.paymentStatus === "succeeded" ? "Yes" : "No";
  row["Paid At"] = payload.completedAt || new Date().toISOString();
  row["Payment Status"] = payload.paymentStatus || "";
  row["Payment Intent ID"] = payload.paymentIntentId || "";
  row["Payment Amount"] = payload.amount ? payload.amount / 100 : "";
  row["Payment Currency"] = payload.currency || "";
  row["Recommended Service"] = payload.serviceType || row["Recommended Service"];
  row["Email"] = payload.customerEmail || row["Email"];
  if (payload.questionnaireAnswers) {
    applyAnswers_(row, payload.questionnaireAnswers);
    row["All Answers JSON"] = JSON.stringify(payload.questionnaireAnswers);
  }
  row["Last Updated At"] = new Date().toISOString();

  writeObjectRow_(sheet, rowIndex, row);
}

function applyAnswers_(row, answers) {
  row["Primary Goal"] = answers.primaryGoal || row["Primary Goal"];
  row["Traffic Source"] = answers.currentTrafficSource || row["Traffic Source"];
  row["Lead Collection System"] = answers.hasLeadCollectionSystem || row["Lead Collection System"];
  row["Growth Problem"] = answers.mainGrowthProblem || row["Growth Problem"];
  row["Website Reason"] = answers.websiteReason || row["Website Reason"];
  row["Website Goal"] = answers.websiteGoal || row["Website Goal"];
  row["Owns Domain"] = answers.ownsDomain || row["Owns Domain"];
  row["Purchase Intent"] = answers.purchaseIntent || row["Purchase Intent"];
}

function getLeadSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}

function ensureHeaders_(sheet) {
  const current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const needsHeaders = HEADERS.some((header, index) => current[index] !== header);
  if (needsHeaders) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
}

function formatLeadSheet_(sheet) {
  const lastColumn = HEADERS.length;
  const maxRows = Math.max(sheet.getMaxRows(), 2);
  const headerRange = sheet.getRange(1, 1, 1, lastColumn);
  const dataRange = sheet.getRange(1, 1, maxRows, lastColumn);

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);

  headerRange
    .setBackground("#5b2bbf")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setFontSize(11)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true);

  sheet.setRowHeight(1, 42);

  HEADERS.forEach((header, index) => {
    sheet.setColumnWidth(index + 1, COLUMN_WIDTHS[header] || 150);
  });

  dataRange
    .setFontFamily("Arial")
    .setFontSize(10)
    .setVerticalAlignment("middle");

  if (sheet.getFilter()) {
    sheet.getFilter().remove();
  }
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), lastColumn).createFilter();

  applyManualRowColors_(sheet, lastColumn);

  formatColumn_(sheet, "Submitted At", "m/d/yyyy h:mm AM/PM");
  formatColumn_(sheet, "Paid At", "m/d/yyyy h:mm AM/PM");
  formatColumn_(sheet, "Last Updated At", "m/d/yyyy h:mm AM/PM");
  formatColumn_(sheet, "Payment Amount", "$#,##0.00");
  formatColumn_(sheet, "Paid", "@");
}

function formatColumn_(sheet, header, format) {
  const index = HEADERS.indexOf(header);
  if (index < 0) return;
  sheet.getRange(2, index + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat(format);
}

function applyManualRowColors_(sheet, lastColumn) {
  const rowCount = Math.max(sheet.getMaxRows() - 1, 1);
  const backgrounds = [];

  for (let index = 0; index < rowCount; index += 1) {
    const color = index % 2 === 0 ? "#ffffff" : "#f7f3ff";
    backgrounds.push(new Array(lastColumn).fill(color));
  }

  sheet.getRange(2, 1, rowCount, lastColumn).setBackgrounds(backgrounds);
}

function rowToObject_(sheet, rowIndex) {
  const values = rowIndex <= sheet.getLastRow()
    ? sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0]
    : [];
  return HEADERS.reduce((row, header, index) => {
    row[header] = values[index] || "";
    return row;
  }, {});
}

function writeObjectRow_(sheet, rowIndex, row) {
  sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([
    HEADERS.map((header) => row[header] || ""),
  ]);
}

function findRowByLeadId_(sheet, leadId) {
  if (!leadId || sheet.getLastRow() < 2) return 0;
  const leadIds = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let index = 0; index < leadIds.length; index += 1) {
    if (leadIds[index][0] === leadId) return index + 2;
  }
  return 0;
}

function findLatestRowByEmail_(sheet, email) {
  if (!email || sheet.getLastRow() < 2) return 0;
  const emails = sheet.getRange(2, 13, sheet.getLastRow() - 1, 1).getValues();
  for (let index = emails.length - 1; index >= 0; index -= 1) {
    if (String(emails[index][0]).toLowerCase() === String(email).toLowerCase()) {
      return index + 2;
    }
  }
  return 0;
}

function parsePayload_(e) {
  const raw = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
  return JSON.parse(raw);
}

function assertAuthorized_(payload) {
  const expected = PropertiesService.getScriptProperties().getProperty("SCRIPT_SECRET");
  if (!expected) return;
  if (payload.secret !== expected) throw new Error("Unauthorized webhook request.");
}

function isPaymentPayload_(payload) {
  return Boolean(payload.paymentIntentId || payload.paymentStatus);
}

function buildLeadId_(service, email, firstName) {
  const source = `${service || "unknown"}:${email || firstName || "unknown"}`;
  return `nq-${String(source).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
