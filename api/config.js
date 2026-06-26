// Trả về danh sách ad account + cờ hasToken cho frontend tự kết nối.
// KHÔNG trả access token ra client nữa (bảo mật) — proxy /api/meta dùng env token server-side.
export default function handler(req, res) {
  const host = req.headers.host;
  const allowed = process.env.ALLOWED_ORIGIN || (host ? `https://${host}` : '*');
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Vary', 'Origin');
  const raw = process.env.META_AD_ACCOUNT_ID || '';
  const accounts = raw.split(',').map(s => s.trim()).filter(Boolean).map(id => id.startsWith('act_') ? id : 'act_' + id);
  res.json({
    hasToken: !!process.env.META_ACCESS_TOKEN,
    accounts,
  });
}
