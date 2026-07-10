/**
 * Madhava Clinic — Website Booking Relay
 * Paste this whole file into script.google.com (Extensions > Apps Script
 * from inside a Google Sheet). Full setup steps are in
 * WEBSITE-BOOKING-SETUP.md.
 */

const SHEET_NAME = 'Bookings';

// Called by the website when someone submits the booking form.
function doPost(e) {
  const sheet = getSheet();
  const data = JSON.parse(e.postData.contents);
  const id = Utilities.getUuid();
  sheet.appendRow([
    id,
    data.name || '',
    data.phone || '',
    data.age || '',
    data.reason || '',
    data.datetime || '',
    data.message || '',
    data.submitted || new Date().toLocaleString('en-IN'),
    'new'
  ]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true, id }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Called by the clinic app to (a) list new bookings, or (b) acknowledge one.
function doGet(e) {
  const action = e.parameter.action;
  const sheet = getSheet();

  if (action === 'ack') {
    const id = e.parameter.id;
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === id) {
        sheet.getRange(i + 1, 9).setValue('synced');
        break;
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // default action ("list"): return every row still marked "new"
  const rows = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const [id, name, phone, age, reason, datetime, message, submitted, status] = rows[i];
    if (status === 'new') {
      result.push({ id, name, phone, age, reason, datetime, message, submitted });
    }
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['id', 'name', 'phone', 'age', 'reason', 'datetime', 'message', 'submitted', 'status']);
  }
  return sheet;
}
