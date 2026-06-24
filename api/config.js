export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    token:   process.env.META_ACCESS_TOKEN   || '',
    account: process.env.META_AD_ACCOUNT_ID  || '',
  });
}
