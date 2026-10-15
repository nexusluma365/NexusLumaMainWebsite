/**
 * NEXUS LUMA — Lead Tracker ("Nexus Luma Web ProJ Leads" sheet)
 *
 * One row per lead, color-coded by section, with a live Dashboard tab.
 *
 * Receives records from the website (Netlify functions):
 *   /api/submit-qualification   new lead from /start/ questionnaire or /book/ form
 *   /api/create-booking         strategy call booked      (status CALL_BOOKED)
 *   /api/verify-lead-system-deposit, /api/stripe-webhook
 *                               $275 deposit paid          (status DEPOSIT_PAID)
 *
 * SETUP (one time)
 *  1. Open the sheet → Extensions → Apps Script → replace everything with this file → Save.
 *  2. Select setupLeadTracker in the toolbar → Run → approve the permissions.
 *  3. Deploy → New deployment → type "Web app" → Execute as: Me, Who has access: Anyone → Deploy.
 *  4. Copy the Web app URL into Netlify as LEAD_SYSTEM_WEBHOOK_URL and redeploy the site.
 *  After pasting a newer version of this file: Deploy → Manage deployments → Edit → Version: New version.
 *
 * The "Nexus Luma Leads" menu in the sheet re-applies formatting, rebuilds the
 * Dashboard, or adds a test lead.
 */

// ─── Settings ────────────────────────────────────────────────────────────────
var LEAD_TAB = String(new Date().getFullYear()); // "2026"; a new year gets its own tab automatically
var DASHBOARD_TAB = "Dashboard";
var TIME_ZONE = "America/New_York";              // matches the booking calendar
var NOTIFY_EMAIL = "";                            // blank = the sheet owner's email
var NOTIFY = { newLead: true, callBooked: true, depositPaid: true };
var MERGE_WINDOW_DAYS = 30;                       // same email within this window updates the existing row
var HEADER_ROWS = 2;                              // row 1 = section bands, row 2 = column titles

// ─── Sections (colors) ───────────────────────────────────────────────────────
var GROUPS = {
  LEAD:     { label: "LEAD",               dark: "#1e293b", light: "#e2e8f0", tint: "#f8fafc" },
  CONTACT:  { label: "CONTACT",            dark: "#1d4ed8", light: "#dbeafe", tint: "#f5f9ff" },
  QUIZ:     { label: "QUESTIONNAIRE",      dark: "#6d28d9", light: "#ede9fe", tint: "#faf8ff" },
  CALL:     { label: "STRATEGY CALL",      dark: "#0f766e", light: "#ccfbf1", tint: "#f3fdfb" },
  DEPOSIT:  { label: "DEPOSIT",            dark: "#15803d", light: "#dcfce7", tint: "#f4fdf7" },
  ADS:      { label: "AD TRACKING",        dark: "#c2410c", light: "#ffedd5", tint: "#fffaf5" },
  FOLLOWUP: { label: "FOLLOW-UP (manual)", dark: "#a16207", light: "#fef9c3", tint: "#fffef3" },
  SYSTEM:   { label: "SYSTEM",             dark: "#475569", light: "#f1f5f9", tint: "#fafafa" }
};

// ─── Columns (order = sheet order) ───────────────────────────────────────────
var COLUMNS = [
  { key: "capturedAt",   title: "Date Captured",        group: "LEAD",     width: 150, type: "datetime" },
  { key: "status",       title: "Status",               group: "LEAD",     width: 150 },
  { key: "source",       title: "Lead Source",          group: "LEAD",     width: 160 },
  { key: "name",         title: "Name",                 group: "CONTACT",  width: 160 },
  { key: "business",     title: "Business",             group: "CONTACT",  width: 190 },
  { key: "phone",        title: "Phone",                group: "CONTACT",  width: 130, type: "text" },
  { key: "email",        title: "Email",                group: "CONTACT",  width: 220 },
  { key: "website",      title: "Website",              group: "CONTACT",  width: 180 },
  { key: "trade",        title: "Trade",                group: "QUIZ",     width: 140 },
  { key: "service",      title: "Service Wanted",       group: "QUIZ",     width: 180 },
  { key: "serviceArea",  title: "Service Area",         group: "QUIZ",     width: 180 },
  { key: "notes",        title: "Work They Want More Of", group: "QUIZ",   width: 260, wrap: true },
  { key: "callAt",       title: "Call Date & Time (ET)", group: "CALL",    width: 170, type: "datetime" },
  { key: "callLink",     title: "Calendar Event",       group: "CALL",     width: 120 },
  { key: "depositAt",    title: "Deposit Paid At",      group: "DEPOSIT",  width: 150, type: "datetime" },
  { key: "depositAmount", title: "Deposit Amount",      group: "DEPOSIT",  width: 120, type: "money" },
  { key: "paymentId",    title: "Stripe Payment ID",    group: "DEPOSIT",  width: 200, type: "text" },
  { key: "utmSource",    title: "UTM Source",           group: "ADS",      width: 120 },
  { key: "utmMedium",    title: "UTM Medium",           group: "ADS",      width: 110 },
  { key: "utmCampaign",  title: "UTM Campaign",         group: "ADS",      width: 160 },
  { key: "utmTerm",      title: "UTM Keyword",          group: "ADS",      width: 150 },
  { key: "gclid",        title: "Google Click ID",      group: "ADS",      width: 150, type: "text" },
  { key: "landingPage",  title: "Landing Page",         group: "ADS",      width: 220 },
  { key: "referrer",     title: "Referrer",             group: "ADS",      width: 180 },
  { key: "followUpOn",   title: "Next Follow-Up",       group: "FOLLOWUP", width: 130, type: "date" },
  { key: "followUpNotes", title: "Follow-Up Notes",     group: "FOLLOWUP", width: 260, wrap: true },
  { key: "submissions",  title: "Submissions",          group: "SYSTEM",   width: 100, type: "number" },
  { key: "updatedAt",    title: "Last Updated",         group: "SYSTEM",   width: 150, type: "datetime" },
  { key: "leadId",       title: "Lead ID",              group: "SYSTEM",   width: 170, type: "text" }
];

// ─── Statuses ────────────────────────────────────────────────────────────────
// rank: automatic updates only ever move a lead forward, never back.
var STATUSES = [
  { label: "New Lead",       rank: 1, bg: "#fef3c7", fg: "#92400e" },
  { label: "Call Booked",    rank: 2, bg: "#dbeafe", fg: "#1e40af" },
  { label: "Call Completed", rank: 3, bg: "#e0e7ff", fg: "#3730a3" },
  { label: "No Show",        rank: 3, bg: "#fee2e2", fg: "#991b1b" },
  { label: "Deposit Paid",   rank: 4, bg: "#dcfce7", fg: "#166534" },
  { label: "Won — Project Started", rank: 5, bg: "#bbf7d0", fg: "#14532d" },
  { label: "Lost",           rank: 5, bg: "#f3f4f6", fg: "#4b5563" }
];
var SERVER_STATUS = {
  CALL_REQUESTED: "New Lead",
  QUALIFIED: "New Lead",
  CALL_BOOKED: "Call Booked",
  DEPOSIT_PAID: "Deposit Paid"
};
var SOURCE_LABELS = {
  "lead-system-start": "Lead Plan Questionnaire",
  "book-page": "Book a Call Page"
};

// ═════════════════════════════════════════════════════════════════════════════
// Web app endpoints
// ═════════════════════════════════════════════════════════════════════════════

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var sheet = getLeadSheet_();
    var isUpdate = Boolean(data.updateEmail) || data.status === "CALL_BOOKED" || data.status === "DEPOSIT_PAID";
    var result = isUpdate ? applyUpdate_(sheet, data) : addOrMergeLead_(sheet, data);
    return json_(Object.assign({ ok: true }, result));
  } catch (err) {
    console.error("doPost failed: " + (err && err.stack || err));
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

// Health check: open the Web app URL in a browser.
function doGet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LEAD_TAB);
  return json_({ ok: true, tracker: "Nexus Luma Lead Tracker", tab: LEAD_TAB, leads: sheet ? Math.max(0, sheet.getLastRow() - HEADER_ROWS) : 0 });
}

// ═════════════════════════════════════════════════════════════════════════════
// Lead handling
// ═════════════════════════════════════════════════════════════════════════════

function addOrMergeLead_(sheet, data) {
  var c = data.campaign || {};
  var now = new Date();
  var lead = {
    capturedAt: data.submittedAt ? new Date(data.submittedAt) : now,
    status: SERVER_STATUS[data.status] || "New Lead",
    source: SOURCE_LABELS[data.source] || data.source || "Website",
    leadId: data.leadId,
    name: data.name,
    business: data.business,
    phone: data.phone,
    email: String(data.email || "").toLowerCase().trim(),
    website: data.website,
    trade: data.trade,
    service: data.service,
    serviceArea: data.serviceArea,
    notes: data.notes,
    utmSource: c.utm_source,
    utmMedium: c.utm_medium,
    utmCampaign: c.utm_campaign,
    utmTerm: c.utm_term,
    gclid: c.gclid,
    landingPage: c.landingPage,
    referrer: c.referrer,
    submissions: 1,
    updatedAt: now
  };

  // Same person again (e.g. questionnaire, then the book page): update their row.
  var existing = findRow_(sheet, "email", lead.email);
  if (existing > 0 && isRecent_(sheet.getRange(existing, col_("capturedAt")).getValue())) {
    var current = readRow_(sheet, existing);
    var patch = { submissions: (Number(current.submissions) || 1) + 1, updatedAt: now };
    COLUMNS.forEach(function (column) {
      var key = column.key;
      if (["capturedAt", "status", "source", "leadId", "submissions", "updatedAt", "notes"].indexOf(key) >= 0) return;
      if (!isBlank_(lead[key]) && isBlank_(current[key])) patch[key] = lead[key];
    });
    if (!isBlank_(lead.notes) && String(current.notes || "").indexOf(lead.notes) < 0) {
      patch.notes = current.notes ? current.notes + "\n" + lead.notes : lead.notes;
    }
    if (isBlank_(current.leadId)) patch.leadId = lead.leadId;
    writeFields_(sheet, existing, patch);
    return { merged: true, row: existing };
  }

  var row = Math.max(sheet.getLastRow(), HEADER_ROWS) + 1;
  writeFields_(sheet, row, lead);
  if (NOTIFY.newLead) notify_("New lead: " + (lead.business || lead.name || lead.email) + (lead.trade ? " — " + lead.trade : ""), lead);
  return { added: true, row: row };
}

function applyUpdate_(sheet, data) {
  var now = new Date();
  var email = String(data.updateEmail || data.email || "").toLowerCase().trim();
  var row = findRow_(sheet, "leadId", data.leadId);
  if (row < 0) row = findRow_(sheet, "email", email);
  if (row < 0) {
    row = Math.max(sheet.getLastRow(), HEADER_ROWS) + 1;
    writeFields_(sheet, row, { capturedAt: now, status: "New Lead", source: "Website", leadId: data.leadId, email: email, submissions: 1 });
  }

  var patch = { updatedAt: now };
  var label = SERVER_STATUS[data.status];
  if (label && rankOf_(label) > rankOf_(sheet.getRange(row, col_("status")).getValue())) patch.status = label;

  if (data.status === "CALL_BOOKED") {
    if (data.callStart) patch.callAt = new Date(data.callStart);
    if (data.eventLink) patch.callLink = data.eventLink;
  }
  if (data.status === "DEPOSIT_PAID") {
    if (isBlank_(sheet.getRange(row, col_("depositAt")).getValue())) patch.depositAt = now;
    if (data.amountCents) patch.depositAmount = Number(data.amountCents) / 100;
    if (data.paymentIntentId) patch.paymentId = data.paymentIntentId;
  }
  writeFields_(sheet, row, patch);

  var lead = readRow_(sheet, row);
  if (data.status === "CALL_BOOKED" && NOTIFY.callBooked) {
    notify_("Call booked: " + (lead.business || lead.name || email) + " — " + formatDate_(lead.callAt), lead);
  }
  if (data.status === "DEPOSIT_PAID" && NOTIFY.depositPaid) {
    notify_("Deposit paid: " + (lead.business || lead.name || email), lead);
  }
  return { updated: true, row: row };
}

// ═════════════════════════════════════════════════════════════════════════════
// Sheet setup & formatting
// ═════════════════════════════════════════════════════════════════════════════

function setupLeadTracker() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TIME_ZONE);
  formatLeadSheet_(ss.getSheetByName(LEAD_TAB) || ss.insertSheet(LEAD_TAB, 0));
  buildDashboard_();
  SpreadsheetApp.getUi().alert(
    "Lead tracker is ready.\n\nNext: Deploy → New deployment → Web app (Execute as: Me, Access: Anyone), " +
    "then put the Web app URL in Netlify as LEAD_SYSTEM_WEBHOOK_URL."
  );
}

function getLeadSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(LEAD_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(LEAD_TAB, 0);
    formatLeadSheet_(sheet);
    buildDashboard_();
  } else if (sheet.getRange(HEADER_ROWS, 1).getValue() !== COLUMNS[0].title) {
    formatLeadSheet_(sheet);
  }
  return sheet;
}

function formatLeadSheet_(sheet) {
  var total = COLUMNS.length;
  if (sheet.getMaxColumns() < total) sheet.insertColumnsAfter(sheet.getMaxColumns(), total - sheet.getMaxColumns());
  if (sheet.getMaxRows() < 1000) sheet.insertRowsAfter(sheet.getMaxRows(), 1000 - sheet.getMaxRows());
  var dataRows = sheet.getMaxRows() - HEADER_ROWS;

  sheet.getRange(1, 1, HEADER_ROWS, sheet.getMaxColumns()).breakApart().clearContent().clearFormat();

  // Row 1: section bands. Row 2: column titles.
  var start = 1;
  groupSpans_().forEach(function (span) {
    var g = GROUPS[span.group];
    sheet.getRange(1, start, 1, span.count).merge()
      .setValue(g.label).setBackground(g.dark).setFontColor("#ffffff")
      .setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center");
    start += span.count;
  });

  COLUMNS.forEach(function (column, i) {
    var g = GROUPS[column.group];
    var index = i + 1;
    sheet.getRange(2, index).setValue(column.title)
      .setBackground(g.light).setFontColor(g.dark).setFontWeight("bold")
      .setVerticalAlignment("middle").setWrap(true);
    sheet.setColumnWidth(index, column.width);

    var body = sheet.getRange(HEADER_ROWS + 1, index, dataRows, 1);
    body.setBackground(g.tint).setVerticalAlignment("top").setWrap(Boolean(column.wrap));
    if (column.type === "datetime") body.setNumberFormat("mmm d, yyyy h:mm am/pm");
    else if (column.type === "date") body.setNumberFormat("mmm d, yyyy");
    else if (column.type === "money") body.setNumberFormat("$#,##0.00");
    else if (column.type === "number") body.setNumberFormat("0").setHorizontalAlignment("center");
    else if (column.type === "text") body.setNumberFormat("@");
  });

  sheet.setRowHeight(1, 26);
  sheet.setRowHeight(2, 36);
  sheet.setFrozenRows(HEADER_ROWS);
  sheet.setFrozenColumns(col_("name")); // keep date, status, source and name visible while scrolling
  sheet.getRange(1, 1, sheet.getMaxRows(), total).setFontFamily("Roboto");

  // Section dividers
  start = 1;
  groupSpans_().forEach(function (span) {
    sheet.getRange(1, start, sheet.getMaxRows(), 1)
      .setBorder(null, true, null, null, null, null, GROUPS[span.group].dark, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    start += span.count;
  });

  // Status dropdown + colored chips
  var statusRange = sheet.getRange(HEADER_ROWS + 1, col_("status"), dataRows, 1);
  statusRange.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUSES.map(function (s) { return s.label; }), true)
      .setAllowInvalid(false).build()
  ).setFontWeight("bold").setHorizontalAlignment("center");

  var rules = STATUSES.map(function (s) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(s.label).setBackground(s.bg).setFontColor(s.fg)
      .setRanges([statusRange]).build();
  });
  // Overdue follow-ups turn red
  var followUp = sheet.getRange(HEADER_ROWS + 1, col_("followUpOn"), dataRows, 1);
  var f = colLetter_(col_("followUpOn")) + (HEADER_ROWS + 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied("=AND(" + f + "<>\"\"," + f + "<TODAY())")
    .setBackground("#fee2e2").setFontColor("#991b1b").setRanges([followUp]).build());
  sheet.setConditionalFormatRules(rules);

  sheet.getRange(HEADER_ROWS + 1, col_("followUpOn"), dataRows, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true).build());
}

// ═════════════════════════════════════════════════════════════════════════════
// Dashboard
// ═════════════════════════════════════════════════════════════════════════════

function buildDashboard_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dash = ss.getSheetByName(DASHBOARD_TAB) || ss.insertSheet(DASHBOARD_TAB, 0);
  dash.clear();
  dash.clearConditionalFormatRules();
  dash.setHiddenGridlines(true);
  if (dash.getMaxColumns() < 20) dash.insertColumnsAfter(dash.getMaxColumns(), 20 - dash.getMaxColumns());

  var first = HEADER_ROWS + 1;
  var ref = function (key) {
    var letter = colLetter_(col_(key));
    return "'" + LEAD_TAB + "'!" + letter + first + ":" + letter;
  };
  var leads = "COUNTA(" + ref("email") + ")";

  dash.getRange("B1").setValue("Nexus Luma — Lead Dashboard " + LEAD_TAB)
    .setFontSize(18).setFontWeight("bold").setFontColor("#101326");
  dash.getRange("B2").setFormula('="Updated "&TEXT(NOW(),"mmm d, h:mm am/pm")&" ET  ·  data from the ' + LEAD_TAB + ' tab"')
    .setFontColor("#64748b");

  var kpis = [
    ["Total Leads",      "=" + leads,                                                          "0",     GROUPS.LEAD],
    ["Leads This Week",  "=COUNTIFS(" + ref("capturedAt") + ",\">=\"&(TODAY()-WEEKDAY(TODAY(),2)+1))", "0", GROUPS.CONTACT],
    ["Leads This Month", "=COUNTIFS(" + ref("capturedAt") + ",\">=\"&(EOMONTH(TODAY(),-1)+1))", "0",   GROUPS.QUIZ],
    ["Calls Booked",     "=COUNT(" + ref("callAt") + ")",                                      "0",     GROUPS.CALL],
    ["Booking Rate",     "=IFERROR(COUNT(" + ref("callAt") + ")/" + leads + ",0)",             "0%",    GROUPS.CALL],
    ["Deposits Paid",    "=COUNT(" + ref("depositAt") + ")",                                   "0",     GROUPS.DEPOSIT],
    ["Deposit Revenue",  "=SUM(" + ref("depositAmount") + ")",                                 "$#,##0", GROUPS.DEPOSIT],
    ["Overdue Follow-Ups", "=COUNTIFS(" + ref("followUpOn") + ",\"<\"&TODAY())",               "0",     GROUPS.FOLLOWUP]
  ];
  kpis.forEach(function (kpi, i) {
    var column = 2 + i * 2;
    dash.getRange(4, column).setValue(kpi[0]).setFontColor(kpi[3].dark).setFontWeight("bold").setFontSize(9)
      .setBackground(kpi[3].light).setHorizontalAlignment("center");
    dash.getRange(5, column).setFormula(kpi[1]).setNumberFormat(kpi[2]).setFontSize(22).setFontWeight("bold")
      .setFontColor(kpi[3].dark).setBackground(kpi[3].light).setHorizontalAlignment("center");
    dash.setColumnWidth(column, 140);
    dash.setColumnWidth(column + 1, 16);
  });
  dash.setRowHeight(5, 48);

  // Breakdown tables (each sits in its own columns so results never overlap)
  var section = function (column, title, group, headers) {
    dash.getRange(8, column, 1, headers.length).merge().setValue(title)
      .setBackground(group.dark).setFontColor("#ffffff").setFontWeight("bold");
    dash.getRange(9, column, 1, headers.length).setValues([headers])
      .setBackground(group.light).setFontColor(group.dark).setFontWeight("bold");
  };

  // Pipeline by status (B:C)
  section(2, "Pipeline by Status", GROUPS.LEAD, ["Status", "Leads"]);
  STATUSES.forEach(function (s, i) {
    dash.getRange(10 + i, 2).setValue(s.label).setBackground(s.bg).setFontColor(s.fg).setFontWeight("bold");
    dash.getRange(10 + i, 3).setFormula("=COUNTIF(" + ref("status") + ",B" + (10 + i) + ")").setHorizontalAlignment("center");
  });

  var grouped = function (key, label) {
    var r = ref(key);
    return "=IFERROR(QUERY({" + r + "},\"select Col1, count(Col1) where Col1 is not null and Col1 <> '' group by Col1 order by count(Col1) desc label Col1 '" + label + "', count(Col1) 'Leads'\",0),\"No data yet\")";
  };
  section(5, "Leads by Trade", GROUPS.QUIZ, ["Trade", "Leads"]);
  dash.getRange(9, 5, 1, 2).clearContent();
  dash.getRange(9, 5).setFormula(grouped("trade", "Trade"));

  section(8, "Leads by Source", GROUPS.CONTACT, ["Source", "Leads"]);
  dash.getRange(9, 8, 1, 2).clearContent();
  dash.getRange(9, 8).setFormula(grouped("source", "Source"));

  section(11, "Leads by Ad Source (UTM)", GROUPS.ADS, ["UTM Source", "Leads"]);
  dash.getRange(9, 11, 1, 2).clearContent();
  dash.getRange(9, 11).setFormula(grouped("utmSource", "UTM Source"));

  section(14, "Leads by Month", GROUPS.LEAD, ["Month", "Leads"]);
  dash.getRange(9, 14, 1, 2).clearContent();
  dash.getRange(9, 14).setFormula(
    "=IFERROR(QUERY({ARRAYFORMULA(IF(" + ref("capturedAt") + "=\"\",,TEXT(" + ref("capturedAt") + ",\"yyyy-mm\")))}," +
    "\"select Col1, count(Col1) where Col1 is not null group by Col1 order by Col1 desc label Col1 'Month', count(Col1) 'Leads'\",0),\"No data yet\")"
  );

  // Upcoming calls (Q:T)
  section(17, "Upcoming Strategy Calls", GROUPS.CALL, ["Call (ET)", "Name", "Business", "Phone"]);
  dash.getRange(10, 17).setFormula(
    "=IFERROR(SORT(FILTER({" + ref("callAt") + "," + ref("name") + "," + ref("business") + "," + ref("phone") + "}," +
    ref("callAt") + ">=NOW()),1,TRUE),\"No upcoming calls\")"
  );
  dash.getRange(10, 17, 200, 1).setNumberFormat("ddd mmm d, h:mm am/pm");
  [5, 8, 11, 14].forEach(function (c) { dash.setColumnWidth(c, 170); dash.setColumnWidth(c + 1, 70); dash.setColumnWidth(c + 2, 16); });
  dash.setColumnWidth(17, 170); dash.setColumnWidth(18, 150); dash.setColumnWidth(19, 170); dash.setColumnWidth(20, 130);
  dash.setColumnWidth(1, 16);
  dash.getRange(1, 1, 220, 20).setFontFamily("Roboto");
  dash.setFrozenRows(5);
}

// ═════════════════════════════════════════════════════════════════════════════
// Menu, manual-edit stamp, test lead
// ═════════════════════════════════════════════════════════════════════════════

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Nexus Luma Leads")
    .addItem("Set up / re-apply formatting", "setupLeadTracker")
    .addItem("Rebuild dashboard", "rebuildDashboard")
    .addSeparator()
    .addItem("Add a test lead", "sendTestLead")
    .addToUi();
}

// Stamps "Last Updated" when you edit a lead by hand (status, follow-up, notes…).
function onEdit(e) {
  var sheet = e.range.getSheet();
  if (sheet.getName() !== LEAD_TAB || e.range.getRow() <= HEADER_ROWS) return;
  var stamp = col_("updatedAt");
  if (e.range.getColumn() === stamp && e.range.getNumColumns() === 1) return;
  sheet.getRange(e.range.getRow(), stamp, e.range.getNumRows(), 1).setValue(new Date());
}

function rebuildDashboard() {
  buildDashboard_();
}

function sendTestLead() {
  var email = "test+" + Date.now() + "@example.com";
  var post = function (payload) { return doPost({ postData: { contents: JSON.stringify(payload) } }).getContent(); };
  post({
    leadId: "lead_test" + Date.now().toString(36), intent: "strategy_call", status: "CALL_REQUESTED",
    submittedAt: new Date().toISOString(), name: "TEST LEAD — delete me", business: "Test Roofing Co",
    email: email, phone: "(336) 555-0100", website: "testroofing.com", trade: "Roofing",
    service: "Roof replacement", serviceArea: "Greensboro, NC + 25 miles", notes: "More full roof replacements",
    source: "lead-system-start",
    campaign: { utm_source: "google", utm_medium: "cpc", utm_campaign: "roofing-test", utm_term: "roof replacement near me", gclid: "test-gclid", landingPage: "https://www.nexusluma.com/", referrer: "" }
  });
  var call = new Date(Date.now() + 2 * 24 * 3600 * 1000);
  post({ updateEmail: email, status: "CALL_BOOKED", callStart: call.toISOString(), eventLink: "https://calendar.google.com/" });
  SpreadsheetApp.getUi().alert("Test lead added to the " + LEAD_TAB + " tab with a booked call. Delete the row when you're done.");
}

// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════

function col_(key) {
  for (var i = 0; i < COLUMNS.length; i++) if (COLUMNS[i].key === key) return i + 1;
  throw new Error("Unknown column: " + key);
}

function colLetter_(n) {
  var s = "";
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function groupSpans_() {
  var spans = [];
  COLUMNS.forEach(function (column) {
    var last = spans[spans.length - 1];
    if (last && last.group === column.group) last.count++;
    else spans.push({ group: column.group, count: 1 });
  });
  return spans;
}

function findRow_(sheet, key, value) {
  var needle = String(value || "").toLowerCase().trim();
  var lastRow = sheet.getLastRow();
  if (!needle || lastRow <= HEADER_ROWS) return -1;
  var values = sheet.getRange(HEADER_ROWS + 1, col_(key), lastRow - HEADER_ROWS, 1).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]).toLowerCase().trim() === needle) return HEADER_ROWS + 1 + i;
  }
  return -1;
}

function readRow_(sheet, row) {
  var values = sheet.getRange(row, 1, 1, COLUMNS.length).getValues()[0];
  var out = {};
  COLUMNS.forEach(function (column, i) { out[column.key] = values[i]; });
  return out;
}

// Writes only the given fields. Text is guarded so a lead can't inject a formula.
function writeFields_(sheet, row, fields) {
  Object.keys(fields).forEach(function (key) {
    var value = fields[key];
    if (value === undefined || value === null) return;
    var cell = sheet.getRange(row, col_(key));
    if (key === "callLink" && value) {
      cell.setRichTextValue(SpreadsheetApp.newRichTextValue().setText("Open event").setLinkUrl(String(value)).build());
      return;
    }
    cell.setValue(value instanceof Date || typeof value === "number" ? value : safeText_(value));
  });
}

function safeText_(value) {
  var text = String(value).slice(0, 2000);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function isBlank_(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function isRecent_(date) {
  return date instanceof Date && (Date.now() - date.getTime()) < MERGE_WINDOW_DAYS * 24 * 3600 * 1000;
}

function rankOf_(label) {
  for (var i = 0; i < STATUSES.length; i++) if (STATUSES[i].label === label) return STATUSES[i].rank;
  return 0;
}

function formatDate_(value) {
  return value instanceof Date ? Utilities.formatDate(value, TIME_ZONE, "EEE MMM d, h:mm a") + " ET" : "";
}

function notify_(subject, lead) {
  try {
    var to = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
    if (!to) return;
    var esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]; }); };
    var rows = [
      ["Status", lead.status], ["Name", lead.name], ["Business", lead.business], ["Phone", lead.phone],
      ["Email", lead.email], ["Trade", lead.trade], ["Service wanted", lead.service], ["Service area", lead.serviceArea],
      ["Work wanted", lead.notes], ["Call", formatDate_(lead.callAt)], ["Source", lead.source],
      ["Ad source", [lead.utmSource, lead.utmCampaign].filter(Boolean).join(" / ")]
    ].filter(function (r) { return !isBlank_(r[1]); });
    var html = "<table style='font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse'>" +
      rows.map(function (r) {
        return "<tr><td style='padding:4px 12px 4px 0;color:#64748b'>" + esc(r[0]) + "</td><td style='padding:4px 0'><b>" + esc(r[1]) + "</b></td></tr>";
      }).join("") + "</table><p><a href='" + SpreadsheetApp.getActiveSpreadsheet().getUrl() + "'>Open the lead sheet</a></p>";
    MailApp.sendEmail({ to: to, subject: "[Nexus Luma] " + subject, htmlBody: html });
  } catch (err) {
    console.warn("Notification failed: " + err.message);
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
