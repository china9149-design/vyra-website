// POST /api/submit
// Stores mint-list wallets and community work submissions in Upstash Redis
// via its REST API (no npm dependencies).
//
// Setup: Vercel dashboard → Storage → add Upstash Redis to this project.
// That sets KV_REST_API_URL and KV_REST_API_TOKEN automatically.
// (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN also work.)
//
// Data layout:
//   vyra:wallets          SET   of lowercase wallet addresses (the mint list)
//   vyra:wallet:<addr>    HASH  { address, submittedAt }
//   vyra:work             LIST  of JSON work submissions, newest first

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const isWallet = (v) => typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
const isPost = (v) =>
  typeof v === 'string' && v.length < 300 &&
  /^https?:\/\/(www\.)?(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d+/i.test(v);

async function redis(commands) {
  const res = await fetch(`${URL_}/multi-exec`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }
  if (!URL_ || !TOKEN) {
    return res.status(503).json({ error: 'The mint list is not connected yet. Try again soon.' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
  const now = Date.now();

  try {
    if (body.type === 'wallet') {
      if (!isWallet(body.address)) {
        return res.status(400).json({ error: 'Use a 0x address: 0x followed by 40 letters and numbers.' });
      }
      const addr = body.address.toLowerCase();
      const out = await redis([
        ['SADD', 'vyra:wallets', addr],
        ['HSETNX', `vyra:wallet:${addr}`, 'submittedAt', String(now)],
        ['HSETNX', `vyra:wallet:${addr}`, 'address', body.address],
      ]);
      const added = out?.[0]?.result === 1;
      return res.status(200).json({ ok: true, duplicate: !added });
    }

    if (body.type === 'work') {
      if (!isPost(body.postUrl)) {
        return res.status(400).json({ error: 'Paste a link to a single post on X.' });
      }
      if (!isWallet(body.wallet)) {
        return res.status(400).json({ error: 'Use a 0x address: 0x followed by 40 letters and numbers.' });
      }
      const note = typeof body.note === 'string' ? body.note.slice(0, 500) : '';
      const entry = JSON.stringify({ postUrl: body.postUrl, wallet: body.wallet, note, submittedAt: now });
      await redis([['LPUSH', 'vyra:work', entry]]);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown submission type.' });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: 'Could not save that right now. Try again in a minute.' });
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
