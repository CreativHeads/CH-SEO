// Daily autopilot: keeps every client up to date and prepares fixes, then emails the Admin a summary.
// It only ever prepares work: fixes still wait for an Admin or Head of SEO to approve them.
import {one,rows,run,now} from './db.js';
import {queueJob,executeJob,writeDueContent,ensureCadenceReports,applyMissingBlogImages} from './workflows.js';
import {fixKindForIssue,pruneOffServiceKeywords,resolveServices,serviceCores} from './providers.js';
import {autoFixOf} from './autofix.js';
import {integrationEnv} from './integrations.js';

const DAY=864e5;
const settingsOf=async env=>{const g=JSON.parse((await one(env,"SELECT value FROM settings WHERE key='general'"))?.value||'{}');return{enabled:g.autopilot!==false,weeklyCrawl:g.autopilot_weekly_crawl!==false,fixesPerClient:Math.min(10,Math.max(0,Number(g.autopilot_fixes_per_client??5)))}};
const decode=r=>({...r,data:JSON.parse(r.data||'{}')});

async function job(env,user,c,kind,input={}){const j=await queueJob(env,user,c,kind,input);if(j.status==='blocked')return{kind,ok:false,error:j.error||'Connection required'};
 try{const r=await executeJob(env,user,await one(env,'SELECT * FROM jobs WHERE id=?',j.id));return{kind,ok:true,result:r.result||{}}}catch(e){return{kind,ok:false,error:e.message}}}

export async function runAutopilot(baseEnv,{user=null,deadline=Date.now()+240000,source='schedule',sendEmail=true}={}){
 const env=await integrationEnv(baseEnv),cfg=await settingsOf(env);
 if(!cfg.enabled&&source==='schedule')return{skipped:'Autopilot is turned off in Settings.'};
 user=user||await one(env,"SELECT * FROM members WHERE role='admin' AND active=1 ORDER BY created_at LIMIT 1");if(!user)return{skipped:'No active Admin.'};
 const clients=(await rows(env,'SELECT * FROM clients WHERE archived=0 ORDER BY name')).map(decode),started=now(),report=[];
 for(const c of clients){const out={client:c.name,client_id:c.id,url:c.url,steps:[],stopped:false};report.push(out);
  const time=()=>{if(Date.now()>deadline){out.stopped=true;return false}return true};
  const conns=Object.fromEntries((await rows(env,'SELECT provider,status FROM connections WHERE client_id=?',c.id)).map(x=>[x.provider,x.status]));
  // 1. Fresh Google data (free). Keyword queries refresh daily so new searches are saved for the keyword page.
  for(const [kind,p] of [['sync_gsc','gsc'],['sync_ga4','ga4']])if(conns[p]==='connected'&&time())out.steps.push(await job(env,user,c,kind));
  if(conns.gsc==='connected'&&time())out.steps.push(await job(env,user,c,'import_gsc_queries'));
  if(time()){try{const services=await resolveServices(env,c);if(serviceCores(services,c.data.location).length){const pruned=await pruneOffServiceKeywords(env,user,c,services);if(pruned.archived)out.steps.push({kind:'prune_keywords',ok:true,result:pruned})}}catch(e){out.steps.push({kind:'prune_keywords',ok:false,error:e.message})}}
  if(env.OPENAI_API_KEY&&time()){try{const due=await writeDueContent(env,user,c,{deadline});if(due.written.length){const failed=due.written.filter(w=>w.error);out.steps.push({kind:'write_scheduled',ok:!failed.length,result:due,error:failed.map(w=>w.error).join('; ')||undefined})}}catch(e){out.steps.push({kind:'write_scheduled',ok:false,error:e.message})}}
  if(time()){try{const made=await ensureCadenceReports(env,user,c);if(made.day)out.steps.push({kind:'daily_report',ok:true,result:made.day});if(made.week)out.steps.push({kind:'weekly_report',ok:true,result:made.week})}catch(e){out.steps.push({kind:'daily_report',ok:false,error:e.message})}}
  if(c.platform==='WordPress'&&c.data.wp_user&&time()){try{const images=await applyMissingBlogImages(env,user,c);if(images.updated.length){const failed=images.updated.filter(x=>x.error);out.steps.push({kind:'blog_images',ok:!failed.length,result:images,error:failed.map(x=>x.error).join('; ')||undefined})}}catch(e){out.steps.push({kind:'blog_images',ok:false,error:e.message})}}
  // 2. Finish any crawl that was running, or start the weekly one (DataForSEO, about $0.02).
  const audits=(await rows(env,"SELECT * FROM records WHERE client_id=? AND kind='audits' ORDER BY created_at DESC LIMIT 30",c.id)).map(decode);
  for(const a of audits.filter(a=>a.status==='crawling'))if(time())out.steps.push(await job(env,user,c,'poll_audit',{record_id:a.id}));
  const lastCrawl=audits.find(a=>a.data.provider_task_id);
  if(cfg.weeklyCrawl&&env.DATAFORSEO_LOGIN&&!audits.some(a=>a.status==='crawling')&&(!lastCrawl||Date.now()-Date.parse(lastCrawl.created_at)>6.5*DAY)&&time())out.steps.push(await job(env,user,c,'full_audit'));
  // 3. Quick homepage check (free).
  if(time())out.steps.push(await job(env,user,c,'quick_audit'));
  // 4. Prepare fixes for open issues that can be fixed automatically, once a week per issue.
  if(env.OPENAI_API_KEY&&c.platform==='WordPress'&&c.data.wp_user){
   const open=(await rows(env,"SELECT * FROM records WHERE client_id=? AND kind='issues' AND status='open'",c.id)).map(decode),pendingFor=new Set((await rows(env,"SELECT data FROM records WHERE client_id=? AND kind='fixes' AND status IN ('draft','in_review','approved','applying')",c.id)).map(r=>JSON.parse(r.data||'{}').issue_id).filter(Boolean));
   const sev={critical:0,high:1,medium:2,low:3},todo=open.filter(i=>(fixKindForIssue(i)||autoFixOf(i))&&!pendingFor.has(i.id)&&!(i.data.autopilot_at&&Date.now()-Date.parse(i.data.autopilot_at)<6.5*DAY)).sort((a,b)=>(sev[a.data.severity]??9)-(sev[b.data.severity]??9)).slice(0,cfg.fixesPerClient);
   for(const i of todo){if(!time())break;const r=await job(env,user,c,'propose_fixes',{record_id:i.id});r.issue=i.title;out.steps.push(r);
    // Only a finished attempt waits a week; a failure (budget, outage, missing plugin) is retried tomorrow.
    if(r.ok)await run(env,'UPDATE records SET data=? WHERE id=?',JSON.stringify({...i.data,autopilot_at:now()}),i.id);
    if(!r.ok&&/budget|limit/i.test(r.error||''))break}}}
 const summary={started,finished:now(),source,clients:report};
 await run(env,"INSERT INTO settings(key,value) VALUES('autopilot:last',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify(summary));
 if(sendEmail)summary.email=await sendDailyReport(env,summary).catch(e=>({sent:false,error:e.message}));
 return summary}

// ---------- Daily email ----------
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number(v||0).toLocaleString('en-IN');
const pct=(a,b)=>b?Math.round((a-b)/b*100):null;
const STEP={sync_gsc:'Search Console synced',sync_ga4:'Analytics synced',import_gsc_queries:'Keywords refreshed',write_scheduled:'Scheduled blog or landing page written',daily_report:'Daily report saved',weekly_report:'Weekly report saved',blog_images:'Blog images added',poll_audit:'Crawl checked',full_audit:'Weekly crawl started',quick_audit:'Homepage checked',propose_fixes:'Fixes prepared'};

export async function buildDailyReport(env,summary){
 const app=String(env.APP_URL||'https://seo.creativheads.com').replace(/\/$/,''),since=new Date(Date.now()-DAY).toISOString(),month=new Date().toISOString().slice(0,7);
 const spend=Object.fromEntries((await rows(env,"SELECT provider,SUM(COALESCE(actual_micros,reserved_micros)) s FROM usage_log WHERE month=? GROUP BY provider",month)).map(r=>[r.provider,Number(r.s)/1e6]));
 const g=JSON.parse((await one(env,"SELECT value FROM settings WHERE key='general'"))?.value||'{}');
 const blocks=[];let waitingAll=0;
 for(const c of summary.clients){const traffic=(await rows(env,"SELECT data FROM records WHERE client_id=? AND kind='traffic'",c.client_id)).map(r=>JSON.parse(r.data||'{}')).filter(d=>d.source!=='GA4').sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const last7=traffic.slice(-7),prev7=traffic.slice(-14,-7),clicks=last7.reduce((s,d)=>s+Number(d.clicks||0),0),prevClicks=prev7.reduce((s,d)=>s+Number(d.clicks||0),0),ch=pct(clicks,prevClicks);
  const waiting=Number((await one(env,"SELECT COUNT(*) n FROM records WHERE client_id=? AND status='in_review'",c.client_id))?.n||0);waitingAll+=waiting;
  const applied=Number((await one(env,"SELECT COUNT(*) n FROM records WHERE client_id=? AND kind='fixes' AND status IN ('applied','verification_pending') AND updated_at>=?",c.client_id,since))?.n||0);
  const newIssues=Number((await one(env,"SELECT COUNT(*) n FROM records WHERE client_id=? AND kind='issues' AND status='open' AND created_at>=?",c.client_id,since))?.n||0);
  const open=Number((await one(env,"SELECT COUNT(*) n FROM records WHERE client_id=? AND kind='issues' AND status='open'",c.client_id))?.n||0);
  const prepared=c.steps.filter(s=>s.kind==='propose_fixes'&&s.ok).reduce((s,x)=>s+Number(x.result?.created||0),0),problems=c.steps.filter(s=>!s.ok);
  let spot=null;try{const daily=await one(env,"SELECT data FROM records WHERE client_id=? AND kind='reports' AND json_extract(data,'$.period')='day' ORDER BY json_extract(data,'$.period_end') DESC LIMIT 1",c.client_id);spot=daily?JSON.parse(daily.data).snapshot?.spotlight:null}catch{}
  blocks.push(`<tr><td style="padding:16px 0;border-top:1px solid #e3e5ef"><div style="font:700 16px Arial,sans-serif;color:#171b26">${esc(c.client)}</div><div style="font:13px Arial,sans-serif;color:#5b5d72;margin:2px 0 10px">${esc(String(c.url).replace(/^https?:\/\//,''))}</div>
   <table cellpadding="0" cellspacing="0" style="font:13px Arial,sans-serif;color:#171b26"><tr>
   <td style="padding:0 18px 6px 0"><b style="font-size:18px">${n(clicks)}</b><br><span style="color:#5b5d72">Google clicks, last 7 days${ch===null?'':` <b style="color:${ch>=0?'#006c49':'#ba1a1a'}">${ch>=0?'▲':'▼'} ${Math.abs(ch)}%</b>`}</span></td>
   <td style="padding:0 18px 6px 0"><b style="font-size:18px;color:${waiting?'#8a5a00':'#171b26'}">${n(waiting)}</b><br><span style="color:#5b5d72">waiting for approval</span></td>
   <td style="padding:0 18px 6px 0"><b style="font-size:18px">${n(applied)}</b><br><span style="color:#5b5d72">fixes applied (24 h)</span></td>
   <td style="padding:0 0 6px 0"><b style="font-size:18px">${n(open)}</b><br><span style="color:#5b5d72">open issues${newIssues?` (${n(newIssues)} new)`:''}</span></td></tr></table>
   <div style="font:13px Arial,sans-serif;color:#464554;margin-top:6px">Autopilot: ${c.steps.filter(s=>s.ok).map(s=>STEP[s.kind]||s.kind).filter((v,i,a)=>a.indexOf(v)===i).join(' · ')||'nothing to do'}${prepared?` · <b>${n(prepared)} new fix${prepared===1?'':'es'} prepared</b>`:''}${c.stopped?' · stopped early (time limit), continues tomorrow':''}</div>
   ${spot?`<div style="margin-top:8px;padding:10px 12px;background:#f4f5ff;border-radius:8px;font:13px Arial,sans-serif;color:#171b26"><b>${esc(spot.headline)}</b><br><span style="color:#5b5d72">${esc(spot.detail)}</span>${spot.action?`<br><b>Next:</b> ${esc(spot.action)}`:''}</div>`:''}
   ${problems.length?`<div style="font:13px Arial,sans-serif;color:#93000a;margin-top:6px">Needs attention: ${problems.slice(0,4).map(p=>esc((STEP[p.kind]||p.kind)+': '+String(p.error||'').slice(0,140))).join('<br>')}</div>`:''}
   ${waiting?`<div style="margin-top:10px"><a href="${app}/fixes-and-approvals/?client=${c.client_id}&tab=review" style="display:inline-block;background:#4648d4;color:#fff;text-decoration:none;font:600 13px Arial,sans-serif;padding:8px 14px;border-radius:6px">Review ${n(waiting)} waiting</a></div>`:''}</td></tr>`)}
 const caps={openai:Number(g.openai_cap_usd??15),dataforseo:Number(g.dataforseo_cap_usd??30)};
 const subject=`Climb daily report · ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',timeZone:'Asia/Kolkata'})}${waitingAll?` · ${waitingAll} waiting for approval`:''}`;
 const html=`<!doctype html><html><body style="margin:0;background:#f6f7fb;padding:24px 12px"><table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border:1px solid #e3e5ef;border-radius:12px;padding:24px">
  <tr><td><div style="font:700 20px Arial,sans-serif;color:#171b26">Climb daily report</div><div style="font:13px Arial,sans-serif;color:#5b5d72;margin-top:4px">${esc(new Date().toLocaleString('en-IN',{dateStyle:'full',timeStyle:'short',timeZone:'Asia/Kolkata'}))} · ${summary.clients.length} client${summary.clients.length===1?'':'s'}</div></td></tr>
  ${blocks.join('')}
  <tr><td style="padding-top:16px;border-top:1px solid #e3e5ef;font:13px Arial,sans-serif;color:#5b5d72">Spend this month: OpenAI $${(spend.openai||0).toFixed(2)} of $${caps.openai} · DataForSEO $${(spend.dataforseo||0).toFixed(2)} of $${caps.dataforseo}.<br>Nothing changes on a website until it is approved. <a href="${app}/" style="color:#4648d4">Open Climb</a></td></tr></table></body></html>`;
 const text=`Climb daily report\n\n`+summary.clients.map(c=>`${c.client}: ${c.steps.filter(s=>s.ok).length} tasks done, ${c.steps.filter(s=>!s.ok).length} problems`).join('\n')+`\n\nOpen: ${app}/`;
 return{subject,html,text}}

export async function sendDailyReport(env,summary){
 if(!env.RESEND_API_KEY)return{sent:false,reason:'Email is not set up (Settings → API keys → Email reports).'};
 const to=String(env.REPORT_TO||env.ADMIN_EMAIL||'').split(/[,;\s]+/).filter(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)).slice(0,10);if(!to.length)return{sent:false,reason:'No report email address.'};
 const {subject,html,text}=await buildDailyReport(env,summary);
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:env.REPORT_FROM||'Climb <onboarding@resend.dev>',to,subject,html,text}),signal:AbortSignal.timeout(20000)});
 const d=await r.json().catch(()=>({}));if(!r.ok)return{sent:false,error:d.message||('Email service returned HTTP '+r.status)};return{sent:true,to,id:d.id}}

// One client report, sent to the team address. The client inbox is unchanged until an Admin shares the approved PDF.
export async function sendClientReport(env,report){
 if(!env.RESEND_API_KEY)return{sent:false,reason:'Email is not set up. Add a Resend API key under Manage API keys → Email reports.'};
 const to=String(env.REPORT_TO||env.ADMIN_EMAIL||'').split(/[,;\s]+/).filter(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)).slice(0,10);if(!to.length)return{sent:false,reason:'No report email address. Add one under Manage API keys → Email reports.'};
 const s=report.data?.snapshot||{},spot=s.spotlight||{},sr=s.search||{},sp=sr.previous||{},app=String(env.APP_URL||'https://seo.creativheads.com').replace(/\/$/,'');
 const cadence=s.period==='day'?'daily':s.period==='week'?'weekly':'monthly',label=s.period_label||s.month||'';
 const ch=(a,b)=>b?Math.round((a-b)/b*100):null,clickCh=sp.days?ch(sr.clicks,sp.clicks):null;
 const subject=`${s.client_name||'SEO'} ${cadence} report · ${label}${spot.headline?' · '+spot.headline:''}`.slice(0,180);
 const cell=(v,name)=>`<td style="padding:0 16px 8px 0"><b style="font-size:18px">${n(v)}</b><br><span style="color:#5b5d72">${name}</span></td>`;
 const html=`<!doctype html><html><body style="margin:0;background:#f6f7fb;padding:24px 12px"><table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border:1px solid #e3e5ef;border-radius:12px;padding:24px"><tr><td>
  <div style="font:700 12px Arial,sans-serif;letter-spacing:.04em;color:#4648d4">CREATIVHEADS · CLIMB</div>
  <div style="font:700 20px Arial,sans-serif;color:#171b26;margin-top:6px">${esc(s.client_name||'Client')} ${cadence} report</div>
  <div style="font:13px Arial,sans-serif;color:#5b5d72;margin-top:4px">${esc(label)}${s.compare_label?` · compared with ${esc(s.compare_label)}`:''}</div>
  ${spot.headline?`<div style="margin:16px 0;padding:12px 14px;background:${spot.tone==='down'?'#fff6f6':spot.tone==='up'?'#f3fbf7':'#f4f5ff'};border-radius:8px;font:14px Arial,sans-serif;color:#171b26"><b>${esc(spot.headline)}</b><br><span style="color:#5b5d72">${esc(spot.detail)}</span>${spot.action?`<br><b>Next:</b> ${esc(spot.action)}`:''}</div>`:''}
  <table cellpadding="0" cellspacing="0" style="font:13px Arial,sans-serif;color:#171b26"><tr>${cell(sr.clicks,'Google clicks'+(clickCh===null?'':` · ${clickCh>=0?'+':''}${clickCh}%`))}${cell(sr.impressions,'Impressions')}${cell(sr.position??'—','Avg position')}${cell(sr.ctr!==undefined?sr.ctr+'%':'—','Click-through')}</tr></table>
  <div style="margin-top:8px"><a href="${app}/reports-admin/?client=${report.client_id}" style="display:inline-block;background:#4648d4;color:#fff;text-decoration:none;font:600 13px Arial,sans-serif;padding:8px 14px;border-radius:6px">Open the report</a></div>
  <div style="margin-top:16px;font:12px Arial,sans-serif;color:#5b5d72">This email goes to the team. It is not sent to the client. An Admin approves the report before it is shared.</div>
  </td></tr></table></body></html>`;
 const text=`${s.client_name||'Client'} ${cadence} report (${label})\n${spot.headline||''}\n${spot.detail||''}\nClicks ${n(sr.clicks)} · Impressions ${n(sr.impressions)}\n${app}/reports-admin/?client=${report.client_id}`;
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:env.REPORT_FROM||'Climb <onboarding@resend.dev>',to,subject,html,text}),signal:AbortSignal.timeout(20000)});
 const d=await r.json().catch(()=>({}));if(!r.ok)return{sent:false,error:d.message||('Email service returned HTTP '+r.status)};return{sent:true,to,id:d.id}}
