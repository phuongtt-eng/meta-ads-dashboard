// Gửi tin về Discord (server-side, tránh CORS).
// 2 chế độ:
//  - Webhook (đơn giản, chỉ text): env DISCORD_WEBHOOK_URL hoặc body.webhook.
//  - Bot (có NÚT bấm action): env DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID. Bắt buộc nếu muốn nút interactive.
// body: { content?, messages?: [{content, components?}], webhook? }
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

  const botToken = process.env.DISCORD_BOT_TOKEN, channel = process.env.DISCORD_CHANNEL_ID;
  const botMode = !!(botToken && channel);
  const webhook = body.webhook || process.env.DISCORD_WEBHOOK_URL || '';
  const webhookOk = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/[0-9]+\/[\w-]+/.test(webhook);
  if (!botMode && !webhookOk) return res.status(400).json({ error: { message: 'Chưa cấu hình Discord: cần Webhook URL hợp lệ, hoặc DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID để có nút bấm.' } });

  let msgs = Array.isArray(body.messages) && body.messages.length
    ? body.messages
    : (body.content ? [{ content: body.content, components: body.components }] : []);
  if (!msgs.length) return res.status(400).json({ error: { message: 'Thiếu nội dung' } });
  msgs = msgs.slice(0, 10);

  async function sendOne(m) {
    const content = String(m.content || '').slice(0, 1900);
    if (!content && !(m.components && m.components.length)) return null;
    if (botMode) {
      const payload = { content, allowed_mentions: { parse: [] } };
      if (m.components && m.components.length) payload.components = m.components;
      const r = await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bot ' + botToken }, body: JSON.stringify(payload),
      });
      return r.ok ? null : ('bot ' + r.status + ': ' + (await r.text().catch(() => '')).slice(0, 150));
    }
    // webhook: không gửi components (webhook thường không hỗ trợ nút interactive)
    const r = await fetch(webhook, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
    return r.ok ? null : ('webhook ' + r.status);
  }

  try {
    const errs = [];
    for (const m of msgs) { const e = await sendOne(m); if (e) errs.push(e); }
    if (errs.length) return res.status(502).json({ error: { message: 'Discord lỗi: ' + errs[0] } });
    return res.status(200).json({ ok: true, sent: msgs.length, mode: botMode ? 'bot' : 'webhook' });
  } catch (e) {
    return res.status(502).json({ error: { message: 'Lỗi gửi Discord: ' + (e.message || e) } });
  }
}
