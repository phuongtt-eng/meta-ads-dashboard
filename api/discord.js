// Gửi tin nhắn về Discord qua webhook (server-side, tránh CORS).
// POST /api/discord  body: { content: "...", webhook?: "https://discord.com/api/webhooks/..." }
// Webhook lấy từ body.webhook hoặc env DISCORD_WEBHOOK_URL. Chỉ chấp nhận domain Discord (chống SSRF).
function cors(req, res) {
  const host = req.headers.host;
  const allowed = process.env.ALLOWED_ORIGIN || (host ? `https://${host}` : '*');
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-proxy-secret');
}
function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = ''; req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  const body = await readBody(req);
  if (process.env.PROXY_SECRET) {
    const sec = req.headers['x-proxy-secret'] || body.secret;
    if (sec !== process.env.PROXY_SECRET) return res.status(401).json({ error: { message: 'Unauthorized' } });
  }

  const url = body.webhook || process.env.DISCORD_WEBHOOK_URL || '';
  if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/[0-9]+\/[\w-]+/.test(url)) {
    return res.status(400).json({ error: { message: 'Webhook URL không hợp lệ (chỉ chấp nhận discord.com/api/webhooks/...)' } });
  }
  const content = String(body.content || '').slice(0, 1900);
  if (!content) return res.status(400).json({ error: { message: 'Thiếu content' } });

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
    if (!r.ok) { const t = await r.text().catch(() => ''); return res.status(502).json({ error: { message: 'Discord trả lỗi ' + r.status + (t ? ': ' + t.slice(0,200) : '') } }); }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: { message: 'Lỗi gửi Discord: ' + (e.message || e) } });
  }
}
