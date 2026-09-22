/**
 * VYRA submissions: receives mint-list wallets and "Share your work" posts
 * from the website's /api/submit function and writes them to this spreadsheet.
 *
 * Rules enforced here (the source of truth):
 *   - Mint list: each wallet appears once (case-insensitive).
 *   - Share your work: each X post appears once (matched by post ID, so
 *     x.com / twitter.com links and ?s=20 variants count as the same post).
 *   - One submission per IP address on each tab. The website sends a hash of
 *     the visitor's IP (never the raw IP), stored in the "IP hash" column.
 *     Rows added before this rule have no hash and don't block anyone.
 */

const MINT_SHEET = 'Mint list';
const WORK_SHEET = 'Share your work';

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, code: 'bad_request' });
  }

  const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!secret || body.secret !== secret) {
    return reply({ ok: false, code: 'unauthorized' });
  }

  // One write at a time, so two people submitting the same wallet at the
  // same moment can't both get through.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return reply({ ok: false, code: 'busy' });

  try {
    if (body.type === 'wallet') return reply(addWallet(body));
    if (body.type === 'work') return reply(addWork(body));
    return reply({ ok: false, code: 'bad_request' });
  } finally {
    lock.releaseLock();
  }
}

function addWallet(body) {
  const wallet = String(body.address || '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return { ok: false, code: 'invalid_wallet' };

  const sheet = getSheet(MINT_SHEET, ['Wallet', 'Joined at', 'IP hash']);
  const key = wallet.toLowerCase();
  if (columnValues(sheet, 1).some(v => v.toLowerCase() === key)) {
    return { ok: false, code: 'duplicate_wallet' };
  }
  const ipHash = cleanHash(body.ipHash);
  if (ipHash && columnValues(sheet, 3).some(v => v === ipHash)) {
    return { ok: false, code: 'duplicate_ip_wallet' };
  }
  sheet.appendRow([wallet, new Date(), ipHash]);
  sheet.getRange(sheet.getLastRow(), 2).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  return { ok: true };
}

function addWork(body) {
  const url = String(body.postUrl || '').trim();
  const match = url.match(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/(\d+)/i);
  if (!match) return { ok: false, code: 'invalid_post' };
  const postId = match[1];

  const wallet = String(body.wallet || '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return { ok: false, code: 'invalid_wallet' };

  const sheet = getSheet(WORK_SHEET, ['Post ID', 'Post URL', 'Wallet', 'Note', 'Submitted at', 'IP hash']);
  if (columnValues(sheet, 1).some(v => v === postId)) {
    return { ok: false, code: 'duplicate_post' };
  }
  const ipHash = cleanHash(body.ipHash);
  if (ipHash && columnValues(sheet, 6).some(v => v === ipHash)) {
    return { ok: false, code: 'duplicate_ip_work' };
  }
  const note = String(body.note || '').slice(0, 500);
  // Leading apostrophe stores post IDs as text (they're too long for numbers)
  // and stops notes/links being interpreted as spreadsheet formulas.
  sheet.appendRow(["'" + postId, safe(url), wallet, safe(note), new Date(), ipHash]);
  sheet.getRange(sheet.getLastRow(), 5).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  return { ok: true };
}

function getSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  } else {
    // Existing tabs get any new header (like "IP hash") added at the end.
    headers.forEach((h, i) => {
      const cell = sheet.getRange(1, i + 1);
      if (!String(cell.getValue()).trim()) cell.setValue(h);
    });
  }
  return sheet;
}

function columnValues(sheet, col) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, col, last - 1, 1).getDisplayValues().map(r => String(r[0]).trim());
}

function cleanHash(v) {
  const h = String(v || '').trim().toLowerCase();
  return /^[a-f0-9]{32}$/.test(h) ? h : '';
}

function safe(text) {
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor to create the shared secret. Copy it from the log. */
function createSecret() {
  const secret = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('SECRET', secret);
  Logger.log('SECRET = ' + secret);
}
