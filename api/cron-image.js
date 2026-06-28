// Render báo cáo THEO CAMPAIGN (ptt, mọi account, hôm nay) thành ẢNH PNG kèm cột Gợi ý action,
// upload Discord. @vercel/og (server-side, không cần browser). ?preview=1 để xem ảnh.
// CVR/Payrate tự tính: dùng install nếu có, không thì dùng registration (camp web funnel).
import { ImageResponse } from '@vercel/og';
import React from 'react';
export const config = { runtime: 'edge' };

const GRAPH='https://graph.facebook.com', VERSION=process.env.GRAPH_VERSION||'v21.0';
const PURCHASE=['omni_purchase','purchase','offsite_conversion.fb_pixel_purchase','app_custom_event.fb_mobile_purchase','onsite_web_purchase'];
const INSTALL=['omni_app_install','mobile_app_install','app_install'];
const REG=['omni_complete_registration','complete_registration','offsite_conversion.fb_pixel_complete_registration','app_custom_event.fb_mobile_complete_registration'];
const pick=(arr,types)=>{ if(!Array.isArray(arr))return 0; for(const t of types){const x=arr.find(a=>a.action_type===t); if(x)return parseFloat(x.value)||0;} return 0; };
const pttMatch=n=>/(^|[^a-z0-9])ptt([^a-z0-9]|$)/i.test(String(n||''));
const fmtMoney=v=>{ v=Number(v)||0; if(v>=1e9)return (v/1e9).toFixed(1)+'B'; if(v>=1e6)return (v/1e6).toFixed(1)+'M'; if(v>=1e3)return Math.round(v/1e3)+'K'; return String(Math.round(v)); };

async function gget(path, params, token){
  const u=new URLSearchParams(params); u.append('access_token', token);
  const out=[]; let url=`${GRAPH}/${VERSION}/${path}?${u.toString()}`, pages=0;
  while(url && pages<10){ const r=await fetch(url); const j=await r.json(); if(j.error) throw new Error(j.error.message);
    if(Array.isArray(j.data)){ out.push(...j.data); url=j.paging&&j.paging.next?j.paging.next:null; } else return j; pages++; }
  return { data: out };
}
async function buildRows(){
  const token=process.env.META_ACCESS_TOKEN||'';
  const accts=(process.env.META_AD_ACCOUNT_ID||'').split(',').map(s=>s.trim()).filter(Boolean).map(id=>id.startsWith('act_')?id:'act_'+id);
  const out=[];
  for(const acct of accts){
    const ins=await gget(`${acct}/insights`,{level:'campaign',date_preset:'today',fields:'campaign_id,campaign_name,spend,impressions,clicks,actions,action_values',limit:'500'},token);
    (ins.data||[]).forEach(r=>{ const name=r.campaign_name||''; if(!pttMatch(name))return;
      const spend=parseFloat(r.spend)||0; if(spend<=0)return;
      const impr=parseFloat(r.impressions)||0, clicks=parseFloat(r.clicks)||0;
      const purch=pick(r.actions,PURCHASE), install=pick(r.actions,INSTALL), reg=pick(r.actions,REG), rev=pick(r.action_values,PURCHASE);
      const conv=install>0?install:reg;   // mẫu số CVR/Payrate: install (app) hoặc registration (web)
      out.push({ name, spend, purch, conv,
        roas: spend? rev/spend*0.7:0, cpp: purch? spend/purch:0, ctr: impr? clicks/impr*100:0,
        cvr: clicks? conv/clicks*100:0, pay: conv? purch/conv*100:0 });
    });
  }
  out.sort((a,b)=>b.spend-a.spend);
  return { accts: accts.length, rows: out };
}

const h=React.createElement;
const GREEN=['#d3e9bd','#2c5012'], RED=['#f3b0ac','#7d1f1c'], AMBER=['#fad98c','#6b4407'], PLAIN=['transparent','#1c1c1a'], GREY=['#f0efeb','#6e6e69'];
function colorFor(m,v){ if(m==='roas')return v>=0.4?GREEN:(v<0.3?RED:AMBER); if(m==='ctr')return v<1?RED:GREEN; if(m==='cvr')return v>=30?GREEN:(v<20?RED:PLAIN); if(m==='pay')return v>=15?GREEN:(v<10?RED:PLAIN); return PLAIN; }
function suggest(c){
  if(c.purch===0) return ['Chưa ra đơn — soát creative/target', RED];
  if(c.roas>=0.4) return ['Tốt — tăng budget', GREEN];
  if(c.roas<=0.2) return ['Kém — giảm/tắt', RED];
  return ['Theo dõi / tối ưu', AMBER];
}
function cell(text,w,bg,fg,align,bold){ return h('div',{style:{display:'flex',width:w,padding:'5px 7px',boxSizing:'border-box',justifyContent:align==='left'?'flex-start':'flex-end',alignItems:'center',backgroundColor:bg,color:fg,fontSize:12.5,fontWeight:bold?600:400,overflow:'hidden',whiteSpace:'nowrap'}}, String(text)); }
const COLS=[{l:'Chiến dịch',k:'name',w:280,a:'left'},{l:'Spend',k:'spend',w:66},{l:'ROAS',k:'roas',w:54,c:'roas'},{l:'Pur',k:'purch',w:42},{l:'CPP',k:'cpp',w:64},{l:'CTR',k:'ctr',w:54,c:'ctr'},{l:'CVR',k:'cvr',w:54,c:'cvr'},{l:'Pay',k:'pay',w:54,c:'pay'},{l:'Gợi ý action',k:'sug',w:240,a:'left'}];
const TW=COLS.reduce((s,c)=>s+c.w,0);
function render(rows, accts){
  const cap=Math.min(rows.length,32); const shown=rows.slice(0,cap);
  const header=h('div',{style:{display:'flex',background:'#eceae6',borderBottom:'1px solid #d8d6d1'}}, ...COLS.map(c=>cell(c.l,c.w,'transparent','#6e6e69',c.a,true)));
  const body=shown.map((r,i)=>{ const [sugTxt,sugCol]=suggest(r);
    return h('div',{style:{display:'flex',background:i%2?'#fbfbfa':'#ffffff',borderBottom:'1px solid #efefed'}},
    ...COLS.map(c=>{ let bg='transparent',fg='#1c1c1a',txt;
      if(c.k==='name')txt=r.name.length>40?r.name.slice(0,40):r.name;
      else if(c.k==='spend')txt=fmtMoney(r.spend);
      else if(c.k==='roas')txt=r.roas.toFixed(2);
      else if(c.k==='purch')txt=String(Math.round(r.purch));
      else if(c.k==='cpp')txt=r.purch?fmtMoney(r.cpp):'-';
      else if(c.k==='sug'){ txt=sugTxt; bg=sugCol[0]; fg=sugCol[1]; return cell(txt,c.w,bg,fg,'left'); }
      else txt=r[c.k].toFixed(c.k==='ctr'?1:0)+'%';
      if(c.c){ const col=colorFor(c.c,r[c.k]); bg=col[0]; fg=col[1]; }
      return cell(txt,c.w,bg,fg,c.a); }) );
  });
  const tot=rows.reduce((a,r)=>({s:a.s+r.spend,p:a.p+r.purch,rev:a.rev+r.roas*r.spend}),{s:0,p:0,rev:0});
  const totRoas=tot.s?tot.rev/tot.s:0;
  return h('div',{style:{display:'flex',flexDirection:'column',width:TW+24,padding:12,background:'#ffffff',fontFamily:'sans-serif'}},
    h('div',{style:{display:'flex',fontSize:17,fontWeight:700,color:'#1c1c1a'}}, `META — Campaign + Gợi ý (ptt · ${accts} account)`),
    h('div',{style:{display:'flex',fontSize:11,color:'#6e6e69',marginTop:2,marginBottom:8}}, `hôm nay · ROAS >=0.4 xanh, <0.3 đỏ · CVR/Pay theo install hoặc registration · gợi ý theo ROAS`),
    header, ...body,
    h('div',{style:{display:'flex',marginTop:8,fontSize:13,fontWeight:600,color:'#1c1c1a'}}, `Tổng: ${fmtMoney(tot.s)}đ · ROAS ${totRoas.toFixed(2)} · ${Math.round(tot.p)} đơn${rows.length>cap?`  (+${rows.length-cap} camp)`:''}`));
}

export default async function handler(req){
  const url=new URL(req.url);
  if(process.env.CRON_SECRET){ const k=url.searchParams.get('key')||''; const a=req.headers.get('authorization')||'';
    if(k!==process.env.CRON_SECRET && a!=='Bearer '+process.env.CRON_SECRET) return new Response('unauthorized',{status:401}); }
  try{
    const { rows, accts } = await buildRows();
    const cap=Math.min(rows.length,32);
    const height = 54 + 30 + (cap+1)*29 + 34;
    const img = new ImageResponse(render(rows, accts), { width: TW+24, height });
    if(url.searchParams.get('preview')) return img;
    const buf = await img.arrayBuffer();
    const date = new Date().toLocaleString('vi-VN',{ timeZone:'Asia/Ho_Chi_Minh' });
    const bot=process.env.DISCORD_BOT_TOKEN, ch=process.env.DISCORD_CHANNEL_ID, webhook=process.env.DISCORD_WEBHOOK_URL||'';
    const fd=new FormData();
    fd.append('payload_json', JSON.stringify({ content:`📊 Campaign + gợi ý action (ptt) · ${date}`, allowed_mentions:{parse:[]} }));
    fd.append('files[0]', new Blob([buf],{type:'image/png'}), 'report.png');
    let r, mode;
    if(bot&&ch){ mode='bot'; r=await fetch(`https://discord.com/api/v10/channels/${ch}/messages`,{method:'POST',headers:{'Authorization':'Bot '+bot},body:fd}); }
    else if(/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(webhook)){ mode='webhook'; r=await fetch(webhook,{method:'POST',body:fd}); }
    else return new Response(JSON.stringify({error:'Chưa set DISCORD_WEBHOOK_URL'}),{status:400,headers:{'content-type':'application/json'}});
    const ok=r.ok; const t=ok?'':await r.text().catch(()=>'');
    return new Response(JSON.stringify({ ok, mode, campaigns:rows.length, err: ok?null:(r.status+': '+t.slice(0,150)) }), { status: ok?200:502, headers:{'content-type':'application/json'} });
  }catch(e){ return new Response(JSON.stringify({error:String(e&&e.message||e)}),{status:502,headers:{'content-type':'application/json'}}); }
}
