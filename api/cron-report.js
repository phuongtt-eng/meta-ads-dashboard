// Cron daily: gom camp "ptt" trên TẤT CẢ account (env META_AD_ACCOUNT_ID), group theo use case,
// dựng bảng màu (Discord ANSI code block) gửi về Discord. Server-side, không cần trình duyệt.
// Lịch: vercel.json crons (mặc định 16:00 UTC = 23:00 giờ VN).
// Bảo vệ: nếu set CRON_SECRET, Vercel cron tự gửi Authorization: Bearer <secret>; test tay dùng ?key=<secret>.
// Gửi Discord: dùng DISCORD_BOT_TOKEN+DISCORD_CHANNEL_ID, hoặc DISCORD_WEBHOOK_URL.
const GRAPH = 'https://graph.facebook.com';
const VERSION = process.env.GRAPH_VERSION || 'v21.0';
const PURCHASE = ['omni_purchase','purchase','offsite_conversion.fb_pixel_purchase','app_custom_event.fb_mobile_purchase','onsite_web_purchase'];
const INSTALL  = ['omni_app_install','mobile_app_install','app_install'];
const GEO = /^(US|VN|GLB|GLOBAL|WW|SG|EU|JP|KR|TH|ID|PH|IN|TW|HK|MY|AU|CA|UK|T\d+)$/i;
const OBJ = /^(Purchase|Roas|Reg|Install|Lead|Traffic|Web|WebFunnel|App|Conversion)$/i;
const C = { g:'[2;32m', r:'[2;31m', x:'[0m' };

function pick(arr, types){ if(!Array.isArray(arr)) return 0; for(const t of types){ const h=arr.find(a=>a.action_type===t); if(h) return parseFloat(h.value)||0; } return 0; }
function pttMatch(n){ return /(^|[^a-z0-9])ptt([^a-z0-9]|$)/i.test(String(n||'')); }
function usecaseOf(name){ const p=String(name||'').split('_'); if(p.length<3) return p[0]||'Khác'; const out=[]; for(let i=2;i<p.length;i++){ if(GEO.test(p[i])||OBJ.test(p[i])) break; out.push(p[i]); } return out.length?out.join('_'):(p[2]||'Khác'); }
function fmtMoney(v){ v=Number(v)||0; if(v>=1e9) return (v/1e9).toFixed(1)+'B'; if(v>=1e6) return (v/1e6).toFixed(1)+'M'; if(v>=1e3) return Math.round(v/1e3)+'K'; return String(Math.round(v)); }
const pad=(s,n)=>{ s=String(s); return s.length>=n? s.slice(0,n) : s+' '.repeat(n-s.length); };
const padL=(s,n)=>{ s=String(s); return s.length>=n? s.slice(0,n) : ' '.repeat(n-s.length)+s; };

async function gget(path, params){
  const u=new URLSearchParams(params); u.append('access_token', process.env.META_ACCESS_TOKEN||'');
  const out=[]; let url=`${GRAPH}/${VERSION}/${path}?${u.toString()}`; let pages=0;
  while(url && pages<10){ const r=await fetch(url); const j=await r.json(); if(j.error) throw new Error(j.error.message);
    if(Array.isArray(j.data)){ out.push(...j.data); url=j.paging&&j.paging.next?j.paging.next:null; } else return j; pages++; }
  return { data: out };
}

export default async function handler(req, res){
  if(process.env.CRON_SECRET){
    const a=req.headers.authorization||''; const k=(req.query&&req.query.key)||'';
    if(a!=='Bearer '+process.env.CRON_SECRET && k!==process.env.CRON_SECRET) return res.status(401).json({ error:'unauthorized' });
  }
  const accts=(process.env.META_AD_ACCOUNT_ID||'').split(',').map(s=>s.trim()).filter(Boolean).map(id=>id.startsWith('act_')?id:'act_'+id);
  if(!accts.length || !process.env.META_ACCESS_TOKEN) return res.status(400).json({ error:'Thiếu META_ACCESS_TOKEN / META_AD_ACCOUNT_ID' });
  try {
    const groups={};
    for(const acct of accts){
      const ins=await gget(`${acct}/insights`, { level:'campaign', date_preset:'today', fields:'campaign_id,campaign_name,spend,impressions,clicks,actions,action_values', limit:'500' });
      (ins.data||[]).forEach(r=>{
        const name=r.campaign_name||''; if(!pttMatch(name)) return;
        const uc=usecaseOf(name);
        const g=groups[uc]=groups[uc]||{spend:0,impr:0,clicks:0,purch:0,install:0,rev:0};
        g.spend+=parseFloat(r.spend)||0; g.impr+=parseFloat(r.impressions)||0; g.clicks+=parseFloat(r.clicks)||0;
        g.purch+=pick(r.actions,PURCHASE); g.install+=pick(r.actions,INSTALL); g.rev+=pick(r.action_values,PURCHASE);
      });
    }
    const rows=Object.entries(groups).map(([uc,g])=>({ uc, spend:g.spend, purch:g.purch, install:g.install,
      roas: g.spend? g.rev/g.spend*0.7 : 0, cpp: g.purch? g.spend/g.purch : 0,
      ctr: g.impr? g.clicks/g.impr*100 : 0, cvr: g.clicks? g.install/g.clicks*100 : 0, pay: g.install? g.purch/g.install*100 : 0,
    })).sort((a,b)=>b.spend-a.spend);

    const head = pad('Use case',22)+' '+padL('Spend',7)+' '+padL('ROAS',6)+' '+padL('Pur',4)+' '+padL('CPP',7)+' '+padL('CTR',6)+' '+padL('CVR',5)+' '+padL('Pay',5);
    const lines = rows.slice(0,16).map(r=>{
      const roasC=r.roas>=0.4?C.g:C.r, cvrC=r.cvr>=30?C.g:(r.cvr<20?C.r:''), payC=r.pay>=15?C.g:(r.pay<10?C.r:''), ctrC=r.ctr<1?C.r:'';
      return pad(r.uc,22)+' '+padL(fmtMoney(r.spend),7)+' '+roasC+padL(r.roas.toFixed(2),6)+C.x+' '+padL(String(Math.round(r.purch)),4)+' '+padL(r.purch?fmtMoney(r.cpp):'—',7)+' '+ctrC+padL(r.ctr.toFixed(1)+'%',6)+C.x+' '+cvrC+padL(r.cvr.toFixed(0)+'%',5)+C.x+' '+payC+padL(r.pay.toFixed(0)+'%',5)+C.x;
    });
    const tot=rows.reduce((a,r)=>({s:a.s+r.spend,p:a.p+r.purch}),{s:0,p:0});
    const totRev=rows.reduce((a,r)=>a+r.roas*r.spend,0); const totRoas=tot.s?totRev/tot.s:0;
    const date=new Date().toLocaleString('vi-VN',{ timeZone:'Asia/Ho_Chi_Minh' });
    const text = `📊 **META — Use Case Breakdown (ptt · ${accts.length} account) · ${date}**\n`+
      '```ansi\n'+head+'\n'+lines.join('\n')+`\n\nTotal: ${fmtMoney(tot.s)}đ · ROAS ${totRoas.toFixed(2)} · ${Math.round(tot.p)} đơn`+(rows.length>16?` · +${rows.length-16} use case`:'')+'\n```';

    let sent=false, err=null;
    const bot=process.env.DISCORD_BOT_TOKEN, ch=process.env.DISCORD_CHANNEL_ID, webhook=process.env.DISCORD_WEBHOOK_URL||'';
    const payload={ content:text.slice(0,1990), allowed_mentions:{parse:[]} };
    if(bot&&ch){ const r=await fetch(`https://discord.com/api/v10/channels/${ch}/messages`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bot '+bot},body:JSON.stringify(payload)}); sent=r.ok; if(!r.ok) err='bot '+r.status+': '+(await r.text().catch(()=>'')).slice(0,120); }
    else if(/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(webhook)){ const r=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); sent=r.ok; if(!r.ok) err='webhook '+r.status; }
    else err='Chưa set DISCORD_WEBHOOK_URL (hoặc BOT_TOKEN+CHANNEL_ID)';

    return res.status(sent?200:(err&&err.startsWith('Chưa')?400:502)).json({ ok:sent, usecases:rows.length, totalSpend:Math.round(tot.s), totalPur:Math.round(tot.p), err, preview:text.slice(0,800) });
  } catch(e){ return res.status(502).json({ error:e.message }); }
}
