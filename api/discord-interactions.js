// Discord Interactions endpoint — nhận lệnh/nút bấm từ Discord và thao tác camp qua Meta (env token).
// Set Interactions Endpoint URL trong Discord App = https://<deploy>/api/discord-interactions
// Env cần: DISCORD_PUBLIC_KEY (verify chữ ký), META_ACCESS_TOKEN (đã có).
// Hỗ trợ: PING; button custom_id "pause:<cid>" / "resume:<cid>" / "up:<cid>:<pct>" / "down:<cid>:<pct>";
//          slash command /pause /resume /budget (id, pct).
import crypto from 'crypto';

const GRAPH = 'https://graph.facebook.com';
const VERSION = process.env.GRAPH_VERSION || 'v21.0';

function rawBody(req){ return new Promise(r=>{ let d=''; req.on('data',c=>d+=c); req.on('end',()=>r(d)); req.on('error',()=>r('')); }); }

// Verify Ed25519 signature theo chuẩn Discord (X-Signature-Ed25519 / X-Signature-Timestamp)
function verifySig(pubHex, sigHex, ts, body){
  try {
    const der = Buffer.concat([Buffer.from('302a300506032b6570032100','hex'), Buffer.from(pubHex,'hex')]); // SPKI wrap raw Ed25519 key
    const key = crypto.createPublicKey({ key: der, format:'der', type:'spki' });
    return crypto.verify(null, Buffer.from(ts + body), key, Buffer.from(sigHex,'hex'));
  } catch { return false; }
}

async function metaGet(path, fields){
  const r = await fetch(`${GRAPH}/${VERSION}/${path}?fields=${fields}&access_token=${encodeURIComponent(process.env.META_ACCESS_TOKEN||'')}`);
  return r.json();
}
async function metaPost(path, fields){
  const form = new URLSearchParams(); Object.entries(fields).forEach(([k,v])=>form.append(k,String(v)));
  form.append('access_token', process.env.META_ACCESS_TOKEN||'');
  const r = await fetch(`${GRAPH}/${VERSION}/${path}`, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: form.toString() });
  return r.json();
}

// % budget hoạt động trên giá trị minor-unit thô nên KHÔNG cần biết đơn vị tiền tệ.
async function doAction(action, cid, pct){
  if(!cid) return '⚠️ Thiếu campaign id.';
  if(action==='pause'){ const r=await metaPost(cid,{status:'PAUSED'}); return r.error?('❌ '+r.error.message):`⏸️ Đã **tắt** camp \`${cid}\`.`; }
  if(action==='resume'){ const r=await metaPost(cid,{status:'ACTIVE'}); return r.error?('❌ '+r.error.message):`▶️ Đã **bật** camp \`${cid}\`.`; }
  if(action==='up'||action==='down'){
    const g=await metaGet(cid,'daily_budget,name'); if(g.error) return '❌ '+g.error.message;
    const cur=parseInt(g.daily_budget||'0',10); if(!cur) return '⚠️ Camp không có daily budget (CBO) để chỉnh.';
    const p=Math.abs(parseFloat(pct)||20)/100; const nb=Math.max(1, Math.round(cur*(action==='up'?1+p:1-p)));
    const r=await metaPost(cid,{daily_budget:nb}); return r.error?('❌ '+r.error.message):`💰 ${action==='up'?'**Tăng**':'**Giảm**'} budget \`${(g.name||cid).slice(0,40)}\`: ${cur.toLocaleString()} → ${nb.toLocaleString()} (đơn vị nhỏ nhất).`;
  }
  return '⚠️ Hành động không hợp lệ.';
}
const ephemeral = (res, content) => res.status(200).json({ type:4, data:{ content, flags:64 } }); // type4 = trả lời, flag 64 = chỉ người bấm thấy

export default async function handler(req, res){
  if(req.method!=='POST') return res.status(405).send('Method not allowed');
  const body = await rawBody(req);
  const sig=req.headers['x-signature-ed25519'], ts=req.headers['x-signature-timestamp'];
  if(!process.env.DISCORD_PUBLIC_KEY || !sig || !ts || !verifySig(process.env.DISCORD_PUBLIC_KEY, sig, ts, body))
    return res.status(401).send('invalid request signature');
  let i; try { i = JSON.parse(body); } catch { return res.status(400).send('bad body'); }

  if(i.type===1) return res.status(200).json({ type:1 });                 // PING -> PONG
  if(i.type===3){                                                          // MESSAGE_COMPONENT (button)
    const [action,cid,arg] = String(i.data?.custom_id||'').split(':');
    return ephemeral(res, await doAction(action, cid, arg));
  }
  if(i.type===2){                                                          // APPLICATION_COMMAND (slash)
    const name=i.data?.name; const o={}; (i.data?.options||[]).forEach(x=>o[x.name]=x.value);
    if(name==='pause')  return ephemeral(res, await doAction('pause',  o.id));
    if(name==='resume') return ephemeral(res, await doAction('resume', o.id));
    if(name==='budget'){ const pct=Number(o.pct||0); return ephemeral(res, await doAction(pct>=0?'up':'down', o.id, Math.abs(pct)||20)); }
    return ephemeral(res, 'Lệnh không hỗ trợ.');
  }
  return res.status(200).json({ type:4, data:{ content:'?', flags:64 } });
}
