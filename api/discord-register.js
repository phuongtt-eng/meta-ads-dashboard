// Đăng ký slash command 1 lần: gọi GET /api/discord-register?key=<CRON_SECRET>
// Cần env DISCORD_APP_ID + DISCORD_BOT_TOKEN. Lệnh: /pause /resume /budget (gõ trong Discord -> chạy).
const CMDS = [
  { name:'pause',  description:'Tắt 1 campaign trên Meta',  options:[{ name:'id', description:'Campaign ID', type:3, required:true }] },
  { name:'resume', description:'Bật 1 campaign trên Meta',  options:[{ name:'id', description:'Campaign ID', type:3, required:true }] },
  { name:'budget', description:'Đổi budget campaign theo %', options:[
      { name:'id',  description:'Campaign ID', type:3, required:true },
      { name:'pct', description:'% thay đổi (vd 20 = tăng 20%, -20 = giảm 20%)', type:4, required:true } ] },
];
export default async function handler(req, res){
  if (process.env.CRON_SECRET) {
    const k=(req.query&&req.query.key)||''; const a=req.headers.authorization||'';
    if (k!==process.env.CRON_SECRET && a!=='Bearer '+process.env.CRON_SECRET) return res.status(401).json({ error:'unauthorized' });
  }
  const app=process.env.DISCORD_APP_ID, tok=process.env.DISCORD_BOT_TOKEN;
  if (!app || !tok) return res.status(400).json({ error:'Thiếu DISCORD_APP_ID / DISCORD_BOT_TOKEN trên Vercel' });
  try {
    const r = await fetch(`https://discord.com/api/v10/applications/${app}/commands`, {
      method:'PUT', headers:{ 'Content-Type':'application/json', 'Authorization':'Bot '+tok }, body: JSON.stringify(CMDS),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error:'Discord '+r.status, detail:j });
    return res.status(200).json({ ok:true, registered:Array.isArray(j)?j.map(c=>c.name):j });
  } catch (e) { return res.status(502).json({ error:e.message }); }
}
