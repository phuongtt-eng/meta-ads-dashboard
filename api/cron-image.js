// Báo cáo THEO CAMPAIGN (ptt, mọi account, hôm nay) -> ẢNH PNG kèm cột "Gợi ý action" (rule rõ ràng),
// upload Discord. @vercel/og. ?preview=1 xem ảnh. CVR/Payrate dùng install, không có thì dùng registration.
import { ImageResponse } from '@vercel/og';
import React from 'react';
export const config = { runtime: 'edge' };

const GRAPH='https://graph.facebook.com', VERSION=process.env.GRAPH_VERSION||'v21.0';
const PURCHASE=['omni_purchase','purchase','offsite_conversion.fb_pixel_purchase','app_custom_event.fb_mobile_purchase','onsite_web_purchase'];
const INSTALL=['omni_app_install','mobile_app_install','app_install'];
const REG=['omni_complete_registration','complete_registration','offsite_conversion.fb_pixel_complete_registration','app_custom_event.fb_mobile_complete_registration'];

// ───── RULE NGƯỠNG (chỉnh ở đây) ─────
const R = {
  KILL_SPEND: 2000000,   // tiêu >= 2M mà 0 đơn -> tắt
  KILL_CPM:   1000000,   // CPM >= 1tr mà 0 đơn -> tắt
  CPM_RED:     700000,   // CPM > 700k = đỏ
  CPI_MAX:     200000,   // CPI > 200k = xấu
  CVR_MIN:     20,       // CVR < 20% = xấu
  CVR_GOOD:    30,       // CVR >= 30% = tốt
  PAY_MIN:     10, PAY_GOOD: 15,
  ROAS_GOOD:   0.4,      // >= 0.4 = tốt
  ROAS_STRONG: 0.6,      // >= 0.6 = mạnh -> tăng nhiều
  ROAS_CUT:    0.2,      // <= 0.2 = giảm
  ROAS_KILL:   0.1,      // <= 0.1 (tiêu nhiều) = tắt
  UP1: 20, UP2: 30, DOWN1: 20, DOWN2: 30,
};

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
      const conv=install>0?install:reg;
      out.push({ id: r.campaign_id, name, spend, purch, install, conv, golden:[],
        cpm: impr? spend/impr*1000:0, cpi: install>0? spend/install:0, cpp: purch? spend/purch:0,
        roas: spend? rev/spend*0.7:0, ctr: impr? clicks/impr*100:0, cvr: clicks? conv/clicks*100:0, pay: conv? purch/conv*100:0 });
    });
  }
  out.sort((a,b)=>b.spend-a.spend);
  return { accts: accts.length, rows: out };
}
const hourRanges=hrs=>{ if(!hrs||!hrs.length)return ''; hrs=[...hrs].sort((a,b)=>a-b); const o=[]; let s=hrs[0],p=hrs[0]; for(let i=1;i<hrs.length;i++){ if(hrs[i]===p+1)p=hrs[i]; else {o.push(s===p?s+'h':s+'-'+p+'h'); s=p=hrs[i];}} o.push(s===p?s+'h':s+'-'+p+'h'); return o.join(','); };
const isStrong=c=>c.roas>0.6 && c.ctr>1 && (c.install===0 || c.cpi<=150000);
// Tính giờ vàng ra đơn (3 ngày) cho các camp đủ điều kiện tăng x2 — fetch hourly riêng từng camp (ít camp nên nhanh)
async function attachGolden(rows){
  const token=process.env.META_ACCESS_TOKEN||'';
  const ymd=d=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  const now=new Date(), until=ymd(now), s=new Date(now); s.setUTCDate(s.getUTCDate()-3); const since=ymd(s);
  const strong=rows.filter(isStrong).slice(0,8);
  await Promise.all(strong.map(async c=>{ try{
    const r=await gget(`${c.id}/insights`,{ time_range:JSON.stringify({since,until}), time_increment:'1', breakdowns:'hourly_stats_aggregated_by_advertiser_time_zone', fields:'actions', limit:'400' }, token);
    const byHour=new Array(24).fill(0);
    (r.data||[]).forEach(row=>{ const hh=parseInt((row.hourly_stats_aggregated_by_advertiser_time_zone||'').slice(0,2),10); if(!isNaN(hh)) byHour[hh]+=pick(row.actions,PURCHASE); });
    const max=Math.max(...byHour); if(max>0){ const g=[]; for(let i=0;i<24;i++) if(byHour[i]>=0.6*max) g.push(i); c.golden=g; }
  }catch{} }));
}

// ───── RULE ACTION (ưu tiên trên xuống, gặp đầu tiên là dùng) ─────
function suggest(c){
  // TẮT: 0 đơn + dấu hiệu lãng phí
  if (c.purch===0 && c.spend>=R.KILL_SPEND && c.cpm>=R.KILL_CPM) return ['TẮT CAMP — 2M+ & CPM>1tr, 0 đơn', RED];
  if (c.purch===0 && c.spend>=R.KILL_SPEND)                       return ['TẮT CAMP — tiêu 2M+, 0 đơn', RED];
  if (c.purch===0 && c.cpm>=R.KILL_CPM)                           return ['TẮT — CPM>1tr, 0 đơn', RED];
  if (c.purch===0 && c.install>0 && c.cpi>R.CPI_MAX)              return ['TẮT — CPI>200k, 0 đơn', RED];
  // TĂNG X2 vào giờ vàng: ROAS>0.6 & CPI<=150k & CTR>1%
  if (isStrong(c)) { const g=hourRanges(c.golden); return ['Tăng X2 budget vào giờ vàng' + (g?' '+g:' của camp'), GREEN]; }
  // GIẢM 50% (sàn 1tr): ROAS<0.3 & CPI>200k
  if (c.roas<0.3 && c.install>0 && c.cpi>R.CPI_MAX)               return ['Giảm 50% (sàn 1tr) — ROAS<0.3 & CPI>200k', RED];
  if (c.purch>0 && c.spend>=1000000 && c.roas<=R.ROAS_KILL)       return [`Giảm ${R.DOWN2}% / cân nhắc tắt — ROAS rất thấp`, RED];
  // TĂNG thường: ROAS tốt
  if (c.roas>=R.ROAS_GOOD)                                        return [`Tăng budget ${R.UP1}% — ROAS tốt`, GREEN];
  if (c.install>0 && c.cpi>R.CPI_MAX)                             return [`Giảm ${R.DOWN1}% — CPI>200k`, RED];
  if (c.purch>0 && c.roas<=R.ROAS_CUT)                            return [`Giảm budget ${R.DOWN1}% — ROAS thấp`, RED];
  if (c.cvr>0 && c.cvr<R.CVR_MIN)                                 return ['Soát creative/landing — CVR<20%', AMBER];
  if (c.purch===0)                                               return ['Theo dõi — chưa ra đơn', AMBER];
  return ['Giữ budget, theo dõi', PLAIN];
}

const h=React.createElement;
const GREEN=['#d3e9bd','#2c5012'], RED=['#f3b0ac','#7d1f1c'], AMBER=['#fad98c','#6b4407'], PLAIN=['transparent','#1c1c1a'];
function colorFor(m,v){
  if(m==='roas')return v>=R.ROAS_GOOD?GREEN:(v<0.3?RED:AMBER);
  if(m==='ctr') return v<1?RED:GREEN;
  if(m==='cvr') return v>=R.CVR_GOOD?GREEN:(v<R.CVR_MIN?RED:PLAIN);
  if(m==='pay') return v>=R.PAY_GOOD?GREEN:(v<R.PAY_MIN?RED:PLAIN);
  if(m==='cpm') return v>R.CPM_RED?RED:PLAIN;
  if(m==='cpi') return v>R.CPI_MAX?RED:PLAIN;
  return PLAIN;
}
function cell(text,w,bg,fg,align,bold){ return h('div',{style:{display:'flex',width:w,padding:'5px 7px',boxSizing:'border-box',justifyContent:align==='left'?'flex-start':'flex-end',alignItems:'center',backgroundColor:bg,color:fg,fontSize:12,fontWeight:bold?600:400,overflow:'hidden',whiteSpace:'nowrap'}}, String(text)); }
const COLS=[{l:'Chiến dịch',k:'name',w:250,a:'left'},{l:'Spend',k:'spend',w:60},{l:'CPM',k:'cpm',w:58,c:'cpm'},{l:'ROAS',k:'roas',w:50,c:'roas'},{l:'Pur',k:'purch',w:38},{l:'CPP',k:'cpp',w:58},{l:'CPI',k:'cpi',w:58,c:'cpi'},{l:'CTR',k:'ctr',w:50,c:'ctr'},{l:'CVR',k:'cvr',w:50,c:'cvr'},{l:'Pay',k:'pay',w:48,c:'pay'},{l:'Gợi ý action',k:'sug',w:270,a:'left'}];
const TW=COLS.reduce((s,c)=>s+c.w,0);
function render(rows, accts){
  const cap=Math.min(rows.length,32); const shown=rows.slice(0,cap);
  const header=h('div',{style:{display:'flex',background:'#eceae6',borderBottom:'1px solid #d8d6d1'}}, ...COLS.map(c=>cell(c.l,c.w,'transparent','#6e6e69',c.a,true)));
  const body=shown.map((r,i)=>{ const [sugTxt,sugCol]=suggest(r);
    return h('div',{style:{display:'flex',background:i%2?'#fbfbfa':'#ffffff',borderBottom:'1px solid #efefed'}},
    ...COLS.map(c=>{ let bg='transparent',fg='#1c1c1a',txt;
      if(c.k==='name')txt=r.name.length>36?r.name.slice(0,36):r.name;
      else if(c.k==='spend'||c.k==='cpm')txt=fmtMoney(r[c.k]);
      else if(c.k==='roas')txt=r.roas.toFixed(2);
      else if(c.k==='purch')txt=String(Math.round(r.purch));
      else if(c.k==='cpp')txt=r.purch?fmtMoney(r.cpp):'-';
      else if(c.k==='cpi')txt=r.install>0?fmtMoney(r.cpi):'-';
      else if(c.k==='sug'){ return cell(sugTxt,c.w,sugCol[0],sugCol[1],'left'); }
      else txt=r[c.k].toFixed(c.k==='ctr'?1:0)+'%';
      if(c.c){ const col=colorFor(c.c,r[c.k]); bg=col[0]; fg=col[1]; }
      return cell(txt,c.w,bg,fg,c.a); }) );
  });
  const tot=rows.reduce((a,r)=>({s:a.s+r.spend,p:a.p+r.purch,rev:a.rev+r.roas*r.spend}),{s:0,p:0,rev:0});
  const totRoas=tot.s?tot.rev/tot.s:0;
  return h('div',{style:{display:'flex',flexDirection:'column',width:TW+24,padding:12,background:'#ffffff',fontFamily:'sans-serif'}},
    h('div',{style:{display:'flex',fontSize:17,fontWeight:700,color:'#1c1c1a'}}, `META — Campaign + Gợi ý action (ptt · ${accts} account)`),
    h('div',{style:{display:'flex',fontSize:11,color:'#6e6e69',marginTop:2,marginBottom:8}}, `hôm nay · TẮT nếu 0 đơn & (tiêu>=2M / CPM>=1tr / CPI>200k) · ROAS>0.6 & CPI<=150k & CTR>1% -> X2 budget vào giờ vàng · ROAS<0.3 & CPI>200k -> giảm 50%`),
    header, ...body,
    h('div',{style:{display:'flex',marginTop:8,fontSize:13,fontWeight:600,color:'#1c1c1a'}}, `Tổng: ${fmtMoney(tot.s)}đ · ROAS ${totRoas.toFixed(2)} · ${Math.round(tot.p)} đơn${rows.length>cap?`  (+${rows.length-cap} camp)`:''}`));
}

export default async function handler(req){
  const url=new URL(req.url);
  if(process.env.CRON_SECRET){ const k=url.searchParams.get('key')||''; const a=req.headers.get('authorization')||'';
    if(k!==process.env.CRON_SECRET && a!=='Bearer '+process.env.CRON_SECRET) return new Response('unauthorized',{status:401}); }
  try{
    const { rows, accts } = await buildRows();
    await attachGolden(rows);
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
