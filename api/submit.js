// POST /api/submit
// Validates submissions, then forwards them to the Google Apps Script
// attached to the "VYRA submissions" spreadsheet, which enforces uniqueness
// and writes the row.
//
// Vercel environment variables (Settings → Environment Variables):
//   GOOGLE_SCRIPT_URL     the Apps Script web app URL (ends in /exec)
//   GOOGLE_SCRIPT_SECRET  the secret created by createSecret() in the script
//
// One submission per IP address per tab: the visitor's IP is hashed here
// (HMAC with the secret, so the sheet never stores raw IPs) and the Apps
// Script rejects a second submission from the same hash on the same tab.

import { createHmac } from 'node:crypto';

const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;
const SECRET = process.env.GOOGLE_SCRIPT_SECRET;

const isWallet = (v) => typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v.trim());
const isPost = (v) =>
  typeof v === 'string' && v.length < 300 &&
  /^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d+/i.test(v.trim());

const MESSAGES = {
  duplicate_wallet: [409, 'This wallet is already on the mint list.'],
  duplicate_post: [409, 'This post has already been submitted. Share a different one.'],
  duplicate_ip_wallet: [409, 'A wallet has already been added to the mint list from this network.'],
  duplicate_ip_work: [409, 'Work has already been submitted from this network.'],
  invalid_wallet: [400, 'Use a 0x address: 0x followed by 40 letters and numbers.'],
  invalid_post: [400, 'Paste a link to a single post on X.'],
  busy: [503, 'Lots of people are joining right now. Try again in a few seconds.'],
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }
  if (!SCRIPT_URL || !SECRET) {
    return res.status(503).json({ error: 'The mint list is not connected yet. Try again soon.' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
  let payload;

  if (body.type === 'wallet') {
    if (!isWallet(body.address)) return send(res, 'invalid_wallet');
    payload = { type: 'wallet', address: body.address.trim() };
  } else if (body.type === 'work') {
    if (!isPost(body.postUrl)) return send(res, 'invalid_post');
    if (!isWallet(body.wallet)) return send(res, 'invalid_wallet');
    const note = typeof body.note === 'string' ? body.note.slice(0, 500) : '';
    payload = { type: 'work', postUrl: body.postUrl.trim(), wallet: body.wallet.trim(), note };
  } else {
    return res.status(400).json({ error: 'Unknown submission type.' });
  }

  // Vercel sets these headers itself, so visitors can't fake them.
  const ip = clientIp(req);
  if (ip) payload.ipHash = createHmac('sha256', SECRET).update(ip).digest('hex').slice(0, 32);

  try {
    // Apps Script answers POSTs with a redirect; fetch follows it to the JSON result.
    const r = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, secret: SECRET }),
      redirect: 'follow',
    });
    const result = await r.json();
    if (result.ok) return res.status(200).json({ ok: true });
    if (MESSAGES[result.code]) return send(res, result.code);
    console.error('Apps Script rejected submission:', result.code);
    return res.status(502).json({ error: 'Could not save that right now. Try again in a minute.' });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: 'Could not save that right now. Try again in a minute.' });
  }
}

function send(res, code) {
  const [status, error] = MESSAGES[code];
  return res.status(status).json({ error });
}

function clientIp(req) {
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return '';
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
