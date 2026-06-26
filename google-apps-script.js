/**
 * NEXUS LUMA — Lead Tracker Google Apps Script
 *
 * SETUP INSTRUCTIONS (one-time):
 *  ⚠️  IMPORTANT: Create this script FROM INSIDE the "Business Launch Data" spreadsheet —
 *       NOT from script.google.com as a standalone project.
 *
 *  1. Open "Business Launch Data" in Google Sheets
 *  2. Click Extensions → Apps Script
 *  3. Paste this entire file, replacing any default content
 *  4. Click "Deploy" → "New deployment" → Type: Web App
 *     - Execute as: Me
 *     - Who has access: Anyone
 *  5. Authorize when prompted
 *  6. Copy the Web App URL shown after deploying
 *  7. In Netlify → Site settings → Environment variables, add:
 *       GOOGLE_SCRIPT_URL = <the Web App URL you just copied>
 *  8. Redeploy your Netlify site
 *
 *  This will auto-create a "Leads" tab inside "Business Launch Data"
 *  on the first lead submission — your existing "1 st Quater" tab is untouched.
 *
 * SHEET COLUMNS (auto-created on first run):
 *  A: Timestamp  B: Name  C: Email  D: Business  E: URL
 *  F: Goal  G: Budget  H: Timeline  I: Score  J: Status  K: Payment Intent ID
 *
 * STATUS VALUES:
 *  reached_checkout  → Lead landed on the payment step
 *  purchased         → Payment succeeded (with Stripe intent ID in col K)
 *  pay_later         → Clicked "I need more time"
 *  abandoned         → Left the page while on the payment step
 */

var SHEET_NAME = "Leads";

function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      "Timestamp", "Name", "Email", "Business", "URL",
      "Goal", "Budget", "Timeline", "Score", "Status", "Payment Intent ID"
    ]);
    sheet.setFrozenRows(1);
    // Light header formatting
    sheet.getRange(1, 1, 1, 11)
      .setBackground("#171717")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
  }
  return sheet;
}

function findRowByEmail(sheet, email) {
  if (!email) return -1;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][2]).toLowerCase().trim() === email.toLowerCase().trim()) {
      return i + 1; // 1-indexed sheet row
    }
  }
  return -1;
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = getOrCreateSheet();

    if (data.updateEmail) {
      // Update an existing lead row's status
      var row = findRowByEmail(sheet, data.updateEmail);
      if (row > 0) {
        sheet.getRange(row, 10).setValue(data.status || "");
        if (data.paymentIntentId) {
          sheet.getRange(row, 11).setValue(data.paymentIntentId);
        }
        // Color-code the status cell
        colorStatus(sheet.getRange(row, 10), data.status);
      }
    } else {
      // New lead row
      var existingRow = findRowByEmail(sheet, data.email);
      if (existingRow > 0) {
        // Update rather than duplicate
        sheet.getRange(existingRow, 10).setValue(data.status || "");
        if (data.paymentIntentId) sheet.getRange(existingRow, 11).setValue(data.paymentIntentId);
        colorStatus(sheet.getRange(existingRow, 10), data.status);
      } else {
        var newRow = [
          new Date(),
          data.name || "",
          data.email || "",
          data.business || "",
          data.url || "",
          data.goal || "",
          data.budget || "",
          data.timeline || "",
          data.score || "",
          data.status || "",
          data.paymentIntentId || ""
        ];
        sheet.appendRow(newRow);
        var lastRow = sheet.getLastRow();
        colorStatus(sheet.getRange(lastRow, 10), data.status);
      }
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function colorStatus(cell, status) {
  var colors = {
    "reached_checkout": "#fff9c4",  // yellow
    "purchased":        "#c8e6c9",  // green
    "pay_later":        "#ffe0b2",  // orange
    "abandoned":        "#ffcdd2"   // red
  };
  var bg = colors[status] || "#ffffff";
  cell.setBackground(bg);
}

// Handy manual test — run this from the Apps Script editor to verify the sheet works
function testInsert() {
  doPost({
    postData: {
      contents: JSON.stringify({
        name: "Test Lead",
        email: "test@example.com",
        business: "Test Business",
        url: "https://example.com",
        goal: "More leads",
        budget: "$1,000–$2,000",
        timeline: "Right Away",
        score: 42,
        status: "reached_checkout"
      })
    }
  });
}
