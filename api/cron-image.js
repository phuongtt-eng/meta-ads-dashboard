// Render báo cáo Use Case Breakdown thành ẢNH (PNG) server-side bằng @vercel/og rồi upload Discord.
// Gọi: /api/cron-image?key=<CRON_SECRET>  (?preview=1 để xem ảnh thay vì gửi).
// Trigger mỗi giờ qua GitHub Actions. Dữ liệu: camp "ptt" trên tất cả META_AD_ACCOUNT_ID (hôm nay), group theo use case.
import { ImageResponse } from '@vercel/og';
import React from 'react';
export const config = { runtime: 'edge' };

const GRAPH='https://graph.facebook.com', VERSION=process.env.GRAPH_VERSION||'v21.0';
const PURCHASE=['omni_purchase','purchase','offsite_conversion.fb_pixel_purchase','app_custom_event.fb_mobile_purchase','onsite_web_purchase'];
const INSTALL=['omni_app_install','mobile_app_install','app_install'];
const GEO=/^(US|VN|GLB|GLOBAL|WW|SG|EU|JP|KR|TH|ID|PH|IN|TW|HK|MY|AU|CA|UK|T\d+)$/i;
const OBJ=/^(Purchase|Roas|Reg|Install|Lead|Traffic|Web|WebFunnel|App|Conversion)$/i;
const pick=(arr,types)=>{ if(!Array.isArray(arr))return 0; for(const t of types){const x=arr.find(a=>a.action_type===t); if(x)return parseFloat(x.value)||0;} return 0; };
const pttMatch=n=>/(^|[^a-z0-9])ptt([^a-z0-9]|$)/i.test(String(n||''));
function usecaseOf(name){ const p=String(name||'').split('_'); if(p.length<3)return p[0]||'Other'; const o=[]; for(let i=2;i<p.length;i++){ if(GEO.test(p[i])||OBJ.test(p[i]))break; o.push(p[i]); } return o.length?o.join('_'):(p[2]||'Other'); }
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
  const groups={};
  for(const acct of accts){
    const ins=await gget(`${acct}/insights`,{level:'campaign',date_preset:'today',fields:'campaign_id,campaign_name,spend,impressions,clicks,actions,action_values',limit:'500'},token);
    (ins.data||[]).forEach(r=>{ if(!pttMatch(r.campaign_name))return; const uc=usecaseOf(r.campaign_name);
      const g=groups[uc]=groups[uc]||{spend:0,impr:0,clicks:0,purch:0,install:0,rev:0};
      g.spend+=parseFloat(r.spend)||0; g.impr+=parseFloat(r.impressions)||0; g.clicks+=parseFloat(r.clicks)||0;
      g.purch+=pick(r.actions,PURCHASE); g.install+=pick(r.actions,INSTALL); g.rev+=pick(r.action_values,PURCHASE); });
  }
  return { accts: accts.length, rows: Object.entries(groups).map(([uc,g])=>({ uc, spend:g.spend, purch:g.purch,
    roas: g.spend? g.rev/g.spend*0.7:0, cpp: g.purch? g.spend/g.purch:0, ctr: g.impr? g.clicks/g.impr*100:0,
    cvr: g.clicks? g.install/g.clicks*100:0, pay: g.install? g.purch/g.install*100:0 })).sort((a,b)=>b.spend-a.spend) };
}

const h=React.createElement;
const GREEN=['#d3e9bd','#2c5012'], RED=['#f3b0ac','#7d1f1c'], AMBER=['#fad98c','#6b4407'], PLAIN=['transparent','#1c1c1a'];
function colorFor(m,v){ if(m==='roas')return v>=0.4?GREEN:(v<0.3?RED:AMBER); if(m==='ctr')return v<1?RED:GREEN; if(m==='cvr')return v>=30?GREEN:(v<20?RED:PLAIN); if(m==='pay')return v>=15?GREEN:(v<10?RED:PLAIN); return PLAIN; }
function cell(text,w,bg,fg,align){ return h('div',{style:{display:'flex',width:w,padding:'5px 7px',boxSizing:'border-box',justifyContent:align==='left'?'flex-start':'flex-end',alignItems:'center',backgroundColor:bg,color:fg,fontSize:13,overflow:'hidden'}}, String(text)); }
const COLS=[{l:'Use case',k:'uc',w:230,a:'left'},{l:'Spend',k:'spend',w:78},{l:'ROAS',k:'roas',w:66,c:'roas'},{l:'Pur',k:'purch',w:48},{l:'CPP',k:'cpp',w:80},{l:'CTR',k:'ctr',w:66,c:'ctr'},{l:'CVR',k:'cvr',w:62,c:'cvr'},{l:'Pay',k:'pay',w:62,c:'pay'}];
const TW=COLS.reduce((s,c)=>s+c.w,0);
function render(rows, accts){
  const cap=Math.min(rows.length,28); const shown=rows.slice(0,cap);
  const header=h('div',{style:{display:'flex',background:'#eceae6',borderBottom:'1px solid #d8d6d1'}}, ...COLS.map(c=>cell(c.l,c.w,'transparent','#6e6e69',c.a)));
  const body=shown.map((r,i)=>h('div',{style:{display:'flex',background:i%2?'#fbfbfa':'#ffffff',borderBottom:'1px solid #efefed'}},
    ...COLS.map(c=>{ let bg='transparent',fg='#1c1c1a',txt;
      if(c.k==='uc')txt=r.uc.length>30?r.uc.slice(0,30):r.uc;
      else if(c.k==='spend')txt=fmtMoney(r.spend);
      else if(c.k==='roas')txt=r.roas.toFixed(2);
      else if(c.k==='purch')txt=String(Math.round(r.purch));
      else if(c.k==='cpp')txt=r.purch?fmtMoney(r.cpp):'-';
      else txt=r[c.k].toFixed(c.k==='ctr'?1:0)+'%';
      if(c.c){ const col=colorFor(c.c, r[c.k]); bg=col[0]; fg=col[1]; }
      return cell(txt,c.w,bg,fg,c.a); }) ));
  const tot=rows.reduce((a,r)=>({s:a.s+r.spend,p:a.p+r.purch,rev:a.rev+r.roas*r.spend}),{s:0,p:0,rev:0});
  const totRoas=tot.s?tot.rev/tot.s:0;
  return h('div',{style:{display:'flex',flexDirection:'column',width:TW+24,padding:12,background:'#ffffff',fontFamily:'sans-serif'}},
    h('div',{style:{display:'flex',fontSize:17,fontWeight:700,color:'#1c1c1a'}}, `META - Use Case Breakdown (ptt - ${accts} acc)`),
    h('div',{style:{display:'flex',fontSize:11,color:'#6e6e69',marginTop:2,marginBottom:8}}, `today - ROAS>=0.4 green - CVR>=30 green/<20 red - Pay>=15/<10 - CTR<1 red`),
    header, ...body,
    h('div',{style:{display:'flex',marginTop:8,fontSize:13,fontWeight:600,color:'#1c1c1a'}}, `Total: ${fmtMoney(tot.s)}d  -  ROAS ${totRoas.toFixed(2)}  -  ${Math.round(tot.p)} orders${rows.length>cap?`  (+${rows.length-cap} use case)`:''}`));
}

export default async function handler(req){
  const url=new URL(req.url);
  if(process.env.CRON_SECRET){ const k=url.searchParams.get('key')||''; const a=req.headers.get('authorization')||'';
    if(k!==process.env.CRON_SECRET && a!=='Bearer '+process.env.CRON_SECRET) return new Response('unauthorized',{status:401}); }
  try{
    const { rows, accts } = await buildRows();
    const cap=Math.min(rows.length,28);
    const height = 54 + 30 + (cap+1)*30 + 30;
    const img = new ImageResponse(render(rows, accts), { width: TW+24, height });
    if(url.searchParams.get('preview')) return img;
    const buf = await img.arrayBuffer();
    const date = new Date().toLocaleString('vi-VN',{ timeZone:'Asia/Ho_Chi_Minh' });
    const bot=process.env.DISCORD_BOT_TOKEN, ch=process.env.DISCORD_CHANNEL_ID, webhook=process.env.DISCORD_WEBHOOK_URL||'';
    const fd=new FormData();
    fd.append('payload_json', JSON.stringify({ content:`📊 Use Case Breakdown (ptt) · ${date}`, allowed_mentions:{parse:[]} }));
    fd.append('files[0]', new Blob([buf],{type:'image/png'}), 'report.png');
    let r, mode;
    if(bot&&ch){ mode='bot'; r=await fetch(`https://discord.com/api/v10/channels/${ch}/messages`,{method:'POST',headers:{'Authorization':'Bot '+bot},body:fd}); }
    else if(/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(webhook)){ mode='webhook'; r=await fetch(webhook,{method:'POST',body:fd}); }
    else return new Response(JSON.stringify({error:'Chưa set DISCORD_WEBHOOK_URL'}),{status:400,headers:{'content-type':'application/json'}});
    const ok=r.ok; const t=ok?'':await r.text().catch(()=>'');
    return new Response(JSON.stringify({ ok, mode, usecases:rows.length, err: ok?null:(r.status+': '+t.slice(0,150)) }), { status: ok?200:502, headers:{'content-type':'application/json'} });
  }catch(e){ return new Response(JSON.stringify({error:String(e&&e.message||e)}),{status:502,headers:{'content-type':'application/json'}}); }
}
