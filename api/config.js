export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const raw = process.env.META_AD_ACCOUNT_ID || '';
  const accounts = raw.split(',').map(s => s.trim()).filter(Boolean).map(id => id.startsWith('act_') ? id : 'act_' + id);
  res.json({
    token:    process.env.META_ACCESS_TOKEN || '',
    accounts,
  });
}
