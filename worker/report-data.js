// Builds the frozen data snapshot behind a monthly report. Everything is read from saved records at
// creation time so the report never changes afterwards.
import {one,rows,now} from './db.js';

const sevRank={critical:0,high:1,medium:2,low:3};
const sum=(list,key)=>list.reduce((n,r)=>n+(Number(r[key])||0),0);
const round=(n,d=1)=>Math.round(n*10**d)/10**d;
const host=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch{return''}};

function previousMonth(month){const [y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-2,1));return d.toISOString().slice(0,7)}

function searchTotals(days){const clicks=sum(days,'clicks'),impressions=sum(days,'impressions'),weighted=days.reduce((n,r)=>n+(Number(r.position)||0)*(Number(r.impressions)||0),0);return{clicks,impressions,ctr:impressions?round(clicks/impressions*100,2):0,position:impressions?round(weighted/impressions):null,days:days.length}}

export async function buildReportSnapshot(env,c,month){
  const prev=previousMonth(month),records=(await rows(env,'SELECT * FROM records WHERE client_id=?',c.id)).map(r=>({...r,data:JSON.parse(r.data||'{}')}));
  const of=kind=>records.filter(r=>r.kind===kind&&r.status!=='archived'),inMonth=(r,m)=>String(r.updated_at||'').startsWith(m);
  const traffic=of('traffic').map(r=>r.data),gsc=m=>traffic.filter(t=>t.source!=='GA4'&&String(t.date).startsWith(m)).sort((a,b)=>String(a.date).localeCompare(String(b.date))),ga4=m=>traffic.filter(t=>t.source==='GA4'&&String(t.date).startsWith(m));
  const cur=searchTotals(gsc(month)),before=searchTotals(gsc(prev)),g=ga4(month),gp=ga4(prev);
  const insightsRow=await one(env,'SELECT value FROM settings WHERE key=?','gsc_insights:'+c.id),insights=insightsRow?JSON.parse(insightsRow.value):{};

  const keywords=of('keywords'),pos=k=>Number(k.data.position)||0,ranked=keywords.filter(k=>pos(k)>0);
  const striking=ranked.filter(k=>pos(k)>=4&&pos(k)<=20).sort((a,b)=>(Number(b.data.impressions)||0)-(Number(a.data.impressions)||0));
  const kwRow=k=>({keyword:k.title,position:pos(k)||null,previous:Number(k.data.previous_position)||null,clicks:Number(k.data.clicks)||0,impressions:Number(k.data.impressions)||0,volume:Number(k.data.volume)||0,url:k.data.url||''});

  const audits=of('audits'),withHealth=audits.filter(a=>a.data.health!==undefined).sort((a,b)=>String(b.data.checked_at||b.updated_at).localeCompare(String(a.data.checked_at||a.updated_at)));
  const speed=audits.filter(a=>a.data.performance!==undefined).sort((a,b)=>String(b.data.checked_at||b.updated_at).localeCompare(String(a.data.checked_at||a.updated_at)))[0];
  const issues=of('issues'),open=issues.filter(i=>i.status==='open').sort((a,b)=>(sevRank[a.data.severity]??9)-(sevRank[b.data.severity]??9));
  const pages=i=>Number(i.data.affected)||String(i.data.urls||'').split('\n').filter(Boolean).length;

  const questions=of('questions'),aeo=of('aeo').sort((a,b)=>String(b.data.checked_at||b.created_at).localeCompare(String(a.data.checked_at||a.created_at)));
  const latest=[];for(const q of questions)for(const e of ['ChatGPT','Gemini','Perplexity','Google AI Overview']){const o=aeo.find(x=>x.data.question_id===q.id&&x.data.engine===e);if(o)latest.push({q,o})}
  const engines=['ChatGPT','Gemini','Perplexity','Google AI Overview'].map(e=>{const l=latest.filter(x=>x.o.data.engine===e);return{engine:e,checks:l.length,cited:l.filter(x=>x.o.data.cited).length,mentioned:l.filter(x=>x.o.data.mentioned).length}}).filter(e=>e.checks);
  const lost=latest.filter(x=>!x.o.data.cited).map(x=>({question:x.q.data.question||x.q.title,engine:x.o.data.engine,mentioned:!!x.o.data.mentioned,cited_instead:host([].concat(x.o.data.cited_urls||[])[0]||'')})).slice(0,6);

  const doneKinds={fixes:['applied','verification_pending','verified'],content:['approved','pushed'],tickets:['verified'],issues:['resolved']};
  const completed=records.filter(r=>doneKinds[r.kind]?.includes(r.status)&&inMonth(r,month)).sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))).map(r=>({type:{fixes:'Fix applied',content:r.status==='pushed'?'Article sent to WordPress':'Article approved',tickets:'Developer ticket verified',issues:'Issue resolved'}[r.kind],title:r.title,date:r.updated_at.slice(0,10)}));
  const content=of('content'),pipeline={};for(const r of content)pipeline[r.status]=(pipeline[r.status]||0)+1;

  const priorities=[...open.slice(0,2).map(i=>({title:i.title,detail:`${i.data.severity} priority · ${i.data.category||'Audit'} · ${pages(i)} pages affected`})),...striking.slice(0,1).map(k=>({title:`Move “${k.title}” into the top 3`,detail:`Position ${pos(k)} with ${k.data.impressions||0} impressions in 28 days. Improve the ranking page and add internal links.`})),...(insights.cannibal||[]).slice(0,1).map(m=>({title:`Fix cannibalisation for “${m.query}”`,detail:`${m.pages.length} pages compete for this search. Choose one primary page.`})),...lost.slice(0,1).map(l=>({title:`Win the AI answer for “${l.question}”`,detail:`${l.engine} did not cite the website. Publish a direct answer with FAQ schema.`}))].slice(0,5);

  const gscRows=gsc(month);
  return{
    month,previous_month:prev,generated_at:now(),client_name:c.name,client_url:c.url,
    // Kept for older screens and reports.
    clicks:cur.clicks,impressions:cur.impressions,sessions:sum(g,'sessions'),open_issues:open.length,
    approved_content:content.filter(r=>['approved','pushed'].includes(r.status)).length,
    fixes_applied:of('fixes').filter(f=>['applied','verification_pending','verified'].includes(f.status)).length,
    data_sources:[...new Set(traffic.filter(t=>String(t.date).startsWith(month)).map(t=>t.source||'manual'))],traffic_rows:gscRows.length+g.length,
    search:{...cur,previous:before},
    daily:gscRows.map(t=>({date:t.date,clicks:Number(t.clicks)||0,impressions:Number(t.impressions)||0})),
    analytics:{sessions:sum(g,'sessions'),engaged:sum(g,'engaged_sessions'),key_events:sum(g,'key_events'),days:g.length,previous:{sessions:sum(gp,'sessions'),engaged:sum(gp,'engaged_sessions'),key_events:sum(gp,'key_events'),days:gp.length}},
    insights:{as_of:insights.synced_at||null,top_queries:(insights.top_queries||[]).slice(0,8),pages_up:(insights.pages_up||[]).slice(0,5),pages_down:(insights.pages_down||[]).slice(0,5),cannibal:(insights.cannibal||[]).slice(0,4).map(m=>({query:m.query,impressions:m.impressions,pages:m.pages.map(p=>p.url)}))},
    keywords:{total:keywords.length,ranking:ranked.length,top3:ranked.filter(k=>pos(k)<=3).length,top10:ranked.filter(k=>pos(k)<=10).length,striking:striking.length,improved:ranked.filter(k=>Number(k.data.previous_position)>pos(k)).length,declined:ranked.filter(k=>Number(k.data.previous_position)&&Number(k.data.previous_position)<pos(k)).length,opportunities:striking.slice(0,8).map(kwRow),tracked:keywords.filter(k=>k.data.tracked).slice(0,10).map(kwRow),ideas:keywords.filter(k=>k.data.source==='DataForSEO'&&!pos(k)).sort((a,b)=>(Number(b.data.volume)||0)-(Number(a.data.volume)||0)).slice(0,5).map(kwRow)},
    technical:{health:withHealth[0]?Number(withHealth[0].data.health):null,previous_health:(()=>{const l=withHealth[0];if(!l)return null;const same=withHealth.slice(1).find(a=>!!a.data.provider_task_id===!!l.data.provider_task_id);return same?Number(same.data.health):null})(),audited:withHealth[0]?.data.checked_at||null,pages:withHealth.find(a=>a.data.pages>1)?.data.pages||null,open:open.length,by_severity:Object.fromEntries(['critical','high','medium','low'].map(s=>[s,open.filter(i=>i.data.severity===s).length])),by_category:Object.fromEntries(['Technical','On-page','Content','Core Web Vitals'].map(cat=>[cat,open.filter(i=>i.data.category===cat).length])),resolved_this_month:issues.filter(i=>i.status==='resolved'&&inMonth(i,month)).length,top:open.slice(0,8).map(i=>({title:i.title,severity:i.data.severity,category:i.data.category||'',pages:pages(i)})),speed:speed?{performance:speed.data.performance,seo:speed.data.seo,lcp:speed.data.lcp?round(speed.data.lcp/1000):null,cls:speed.data.cls,checked:speed.data.checked_at||speed.updated_at}:null},
    aeo:{questions:questions.length,checks:latest.length,cited:latest.filter(x=>x.o.data.cited).length,mentioned:latest.filter(x=>x.o.data.mentioned).length,engines,lost},
    work:{completed:completed.slice(0,15),completed_total:completed.length,pipeline},
    priorities
  };
}
