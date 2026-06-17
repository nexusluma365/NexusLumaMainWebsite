/**
 * Nexus Luma Website Analyzer -> Google Sheets lead capture.
 *
 * Paste this file into Extensions > Apps Script inside your Google Sheet.
 * Deploy it as a Web App and use the Web App URL as Netlify's LEAD_WEBHOOK_URL.
 */

const SHEET_NAME = 'Nexus Luma Website Leads';

const HEADERS = [
  'Received At',
  'Analyzer Created At',
  'Source',
  'First Name',
  'Last Name',
  'Full Name',
  'Email',
  'Submitted Website',
  'Analyzed Website',
  'Overall Score',
  'Summary',
  'Strongest Category',
  'Strongest Score',
  'Weakest Category',
  'Weakest Score',
  'Category Breakdown',
  'Top Recommendations',
  'Website Strengths',
  'Conversion Opportunities',
  'Design & User Experience',
  'Messaging & Offer Clarity',
  'Trust & Credibility',
  'CTA Effectiveness',
  'Mobile Experience',
  'SEO Visibility',
  'Priority Improvements',
  'Quick Wins',
  'Recommended Next Steps',
  'Raw Lead JSON',
  'Raw Result JSON'
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const payload = parsePayload_(e);
    const sheet = getLeadSheet_();
    ensureHeaders_(sheet);

    sheet.appendRow(buildLeadRow_(payload));

    return jsonResponse_({
      ok: true,
      message: 'Lead recorded successfully.'
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: error.message || 'Lead could not be recorded.'
    });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return jsonResponse_({
    ok: true,
    message: 'Nexus Luma Website Analyzer lead webhook is live.'
  });
}

/**
 * Run this once manually from Apps Script to create headers and format the sheet.
 */
function setupLeadSheet() {
  const sheet = getLeadSheet_();
  ensureHeaders_(sheet);
  formatLeadSheet_(sheet);
}

/**
 * Optional test. Run after setupLeadSheet() to verify rows write correctly.
 */
function testLeadWebhook() {
  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        source: 'website-audit',
        createdAt: new Date().toISOString(),
        lead: {
          firstName: 'Test',
          lastName: 'Lead',
          email: 'test@example.com',
          url: 'https://example.com/'
        },
        analyzedUrl: 'https://example.com/',
        result: {
          overall_score: 82,
          summary: 'Test website audit summary.',
          categories: [
            { name: 'Design', score: 86, note: 'Clean visual foundation.' },
            { name: 'Conversion', score: 74, note: 'CTA path can be stronger.' }
          ],
          recommendations: [
            'Make the main offer more direct.',
            'Add stronger trust proof near the top.'
          ],
          audit_sections: {
            strengths: ['Strong first impression', 'Clear service category'],
            conversion_opportunities: ['Make the primary CTA easier to see'],
            design_user_experience: 'The page has a clean foundation.',
            messaging_offer_clarity: 'The offer can become more specific.',
            trust_credibility: 'Add reviews, project proof, or guarantees.',
            cta_effectiveness: 'Repeat the main CTA in key decision areas.',
            mobile_experience: 'Keep mobile sections short and scannable.',
            seo_visibility: 'Add more service and local relevance.',
            priority_improvements: ['Clarify headline', 'Improve CTA placement'],
            quick_wins: ['Add phone number near the CTA'],
            recommended_next_steps: ['Turn findings into an improvement plan']
          }
        }
      })
    }
  };

  return doPost(fakeEvent);
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Missing POST body.');
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error('Invalid JSON payload.');
  }
}

function getLeadSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  return sheet;
}

function ensureHeaders_(sheet) {
  const currentHeaders = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const needsHeaders = currentHeaders.every(value => !value) ||
    HEADERS.some((header, index) => currentHeaders[index] !== header);

  if (!needsHeaders) return;

  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  formatLeadSheet_(sheet);
}

function formatLeadSheet_(sheet) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#08133a')
    .setFontColor('#ffffff')
    .setWrap(true);

  sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 2), HEADERS.length).setWrap(true);
  sheet.autoResizeColumns(1, HEADERS.length);

  const widths = {
    1: 155,
    2: 155,
    6: 150,
    7: 210,
    8: 240,
    9: 240,
    11: 360,
    16: 420,
    17: 420,
    18: 340,
    19: 340,
    20: 340,
    21: 340,
    22: 340,
    23: 340,
    24: 340,
    25: 340,
    26: 340,
    27: 340,
    28: 340,
    29: 420,
    30: 520
  };

  Object.keys(widths).forEach(column => {
    sheet.setColumnWidth(Number(column), widths[column]);
  });
}

function buildLeadRow_(payload) {
  const lead = payload.lead || {};
  const result = payload.result || {};
  const sections = result.audit_sections || {};
  const categories = Array.isArray(result.categories) ? result.categories : [];
  const recommendations = Array.isArray(result.recommendations) ? result.recommendations : [];
  const best = getBestCategory_(categories);
  const weakest = getWeakestCategory_(categories);
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ');

  return [
    new Date(),
    payload.createdAt || '',
    payload.source || '',
    lead.firstName || '',
    lead.lastName || '',
    fullName,
    lead.email || '',
    lead.url || '',
    payload.analyzedUrl || '',
    safeValue_(result.overall_score),
    result.summary || '',
    best ? best.name : '',
    best ? safeValue_(best.score) : '',
    weakest ? weakest.name : '',
    weakest ? safeValue_(weakest.score) : '',
    formatCategories_(categories),
    formatList_(recommendations),
    formatList_(sections.strengths),
    formatList_(sections.conversion_opportunities),
    safeValue_(sections.design_user_experience),
    safeValue_(sections.messaging_offer_clarity),
    safeValue_(sections.trust_credibility),
    safeValue_(sections.cta_effectiveness),
    safeValue_(sections.mobile_experience),
    safeValue_(sections.seo_visibility),
    formatList_(sections.priority_improvements),
    formatList_(sections.quick_wins),
    formatList_(sections.recommended_next_steps),
    stringify_(lead),
    stringify_(result)
  ];
}

function getBestCategory_(categories) {
  if (!categories.length) return null;
  return categories.reduce((best, item) => Number(item.score || 0) > Number(best.score || 0) ? item : best, categories[0]);
}

function getWeakestCategory_(categories) {
  if (!categories.length) return null;
  return categories.reduce((weakest, item) => Number(item.score || 0) < Number(weakest.score || 0) ? item : weakest, categories[0]);
}

function formatCategories_(categories) {
  return categories.map(item => {
    const name = item.name || 'Category';
    const score = safeValue_(item.score);
    const note = item.note ? ` - ${item.note}` : '';
    return `${name}: ${score}${note}`;
  }).join('\n');
}

function formatList_(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((item, index) => `${index + 1}. ${safeValue_(item)}`).join('\n');
  }

  return safeValue_(value);
}

function safeValue_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return stringify_(value);
}

function stringify_(value) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch (error) {
    return '';
  }
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
