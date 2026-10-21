// Builds the frozen data snapshot behind a monthly report. Everything is read from saved records at
// creation time so the report never changes afterwards.
import {one,rows,now} from './db.js';

const sevRank={critical:0,high:1,medium:2,low:3};
const sum=(list,key)=>list.reduce((n,r)=>n+(Number(r[key])||0),0);
const round=(n,d=1)=>Math.round(n*10**d)/10**d;
const host=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch{return''}};

function previousMonth(month){if(!/^\d{4}-\d{2}$/.test(String(month||'')))return'';const [y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-2,1));return d.toISOString().slice(0,7)}
const shift=(iso,n)=>{const d=new Date(iso+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const mondayOf=iso=>{const d=new Date(iso+'T00:00:00Z');return shift(iso,-((d.getUTCDay()+6)%7))};
const pretty=iso=>{const [y,m,d]=String(iso||'').split('-').map(Number);return y&&m&&d?new Date(Date.UTC(y,m-1,d)).toLocaleString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}):''};
const prettyMonth=m=>{const [y,mo]=String(m||'').split('-').map(Number);return y&&mo?new Date(Date.UTC(y,mo-1,1)).toLocaleString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}):String(m||'')};
const rangeLabel=(a,b)=>!a||!b?'':a===b?pretty(a):a.slice(0,7)===b.slice(0,7)?`${pretty(a).split(' ')[0]}–${pretty(b)}`:`${pretty(a)} – ${pretty(b)}`;
const inRange=(date,a,b)=>{const d=String(date||'').slice(0,10);return !!a&&!!b&&d>=a&&d<=b};

// Latest saved Search Console day, or the Monday-to-latest-day week that contains it.
export function reportWindow(period,days,anchor=''){
  const dates=[...new Set((days||[]).map(d=>String(d.date||d).slice(0,10)))].filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const pick=anchor&&dates.includes(anchor)?anchor:(anchor?dates.filter(d=>d<=anchor).at(-1):null)||dates.at(-1)||'';
  if(period==='day'){const prev=dates.filter(d=>d<pick).at(-1)||'';return{period:'day',period_key:pick,start:pick,end:pick,prevStart:prev,prevEnd:prev,label:pretty(pick)||'No search data yet',compare:pretty(prev),month:pick.slice(0,7),previous_month:prev.slice(0,7)}}
  if(!pick)return{period:'week',period_key:'',start:'',end:'',prevStart:'',prevEnd:'',label:'No search data yet',compare:'',month:'',previous_month:''};
  const start=mondayOf(pick),prevEnd=shift(start,-1),prevStart=mondayOf(prevEnd);
  return{period:'week',period_key:start,start,end:pick,prevStart,prevEnd,label:rangeLabel(start,pick),compare:rangeLabel(prevStart,prevEnd),month:pick.slice(0,7),previous_month:prevStart.slice(0,7)}
}

// One sentence for the change that matters most in this period.
export function reportSpotlight(search,extras={}){
  const period=extras.period||'month',when=period==='day'?'the day before':period==='week'?'the week before':'last month';
  const cur=Number(search?.clicks)||0,prev=search?.previous?.days?Number(search.previous.clicks)||0:null;
  let tone='flat',headline,detail;
  if(prev===null){headline=cur?`${cur.toLocaleString('en-IN')} Google clicks in this ${period==='day'?'day':period==='week'?'week':'month'}`:'No Google clicks in this period yet';detail=cur?'Sync the previous period to see whether this is a rise or a fall.':'Sync Search Console so the next report has a day to compare.'}
  else if(cur===prev){headline=`Clicks held at ${cur.toLocaleString('en-IN')}`;detail=`The same number of Google clicks as ${when}.`}
  else{const up=cur>prev;tone=up?'up':'down';const pct=prev?Math.round((cur-prev)/prev*100):null;headline=`Clicks ${up?'rose':'fell'}${pct===null?'':` ${Math.abs(pct)}%`} from ${when}`;detail=`${cur.toLocaleString('en-IN')} clicks, compared with ${prev.toLocaleString('en-IN')} before.`}
  const pos=search?.position,was=search?.previous?.position;
  if(pos!=null&&was!=null&&Math.abs(was-pos)>=0.3)detail+=` Average position ${was>pos?'improved':'slipped'} from ${was} to ${pos}.`;
  const q=extras.query;if(q)detail+=` The search used most often is “${q}”.`;
  return{tone,headline,detail,action:extras.action||''}
}

function searchTotals(days){const clicks=sum(days,'clicks'),impressions=sum(days,'impressions'),weighted=days.reduce((n,r)=>n+(Number(r.position)||0)*(Number(r.impressions)||0),0);return{clicks,impressions,ctr:impressions?round(clicks/impressions*100,2):0,position:impressions?round(weighted/impressions):null,days:days.length}}

export async function buildReportSnapshot(env,c,month,opts={}){
  const period=['day','week','month'].includes(opts.period)?opts.period:'month';
  const records=(await rows(env,'SELECT * FROM records WHERE client_id=?',c.id)).map(r=>({...r,data:JSON.parse(r.data||'{}')}));
  const of=kind=>records.filter(r=>r.kind===kind&&r.status!=='archived');
  const traffic=of('traffic').map(r=>r.data),allGsc=traffic.filter(t=>t.source!=='GA4'&&t.date).sort((a,b)=>String(a.date).localeCompare(String(b.date))),allGa=traffic.filter(t=>t.source==='GA4'&&t.date);
  const win=period==='month'?{period:'month',period_key:month,start:month+'-01',end:month+'-31',prevStart:previousMonth(month)+'-01',prevEnd:previousMonth(month)+'-31',label:prettyMonth(month),compare:prettyMonth(previousMonth(month)),month,previous_month:previousMonth(month)}:reportWindow(period,allGsc,opts.anchor||'');
  const span=(a,b)=>rows=>rows.filter(t=>inRange(t.date,a,b));
  const gscRows=span(win.start,win.end)(allGsc),gscPrev=span(win.prevStart,win.prevEnd)(allGsc),g=span(win.start,win.end)(allGa),gp=span(win.prevStart,win.prevEnd)(allGa);
  const cur=searchTotals(gscRows),before=searchTotals(gscPrev);
  const inSpan=r=>inRange(r.updated_at,win.start,win.end);
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
  const completed=records.filter(r=>doneKinds[r.kind]?.includes(r.status)&&inSpan(r)).sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))).map(r=>({type:{fixes:'Fix applied',content:r.status==='pushed'?'Article sent to WordPress':'Article approved',tickets:'Developer ticket verified',issues:'Issue resolved'}[r.kind],title:r.title,date:r.updated_at.slice(0,10)}));
  const content=of('content'),pipeline={};for(const r of content)pipeline[r.status]=(pipeline[r.status]||0)+1;

  const priorities=[...open.slice(0,2).map(i=>({title:i.title,detail:`${i.data.severity} priority · ${i.data.category||'Audit'} · ${pages(i)} pages affected`})),...striking.slice(0,1).map(k=>({title:`Move “${k.title}” into the top 3`,detail:`Position ${pos(k)} with ${k.data.impressions||0} impressions in 28 days. Improve the ranking page and add internal links.`})),...(insights.cannibal||[]).slice(0,1).map(m=>({title:`Fix cannibalisation for “${m.query}”`,detail:`${m.pages.length} pages compete for this search. Choose one primary page.`})),...lost.slice(0,1).map(l=>({title:`Win the AI answer for “${l.question}”`,detail:`${l.engine} did not cite the website. Publish a direct answer with FAQ schema.`}))].slice(0,5);

  const spotlight=reportSpotlight({...cur,previous:before},{period:win.period,query:insights.top_queries?.[0]?.query,action:priorities[0]?.title||''});
  return{
    month:win.month||month,previous_month:win.previous_month,period:win.period,period_key:win.period_key,period_start:win.start,period_end:win.end,period_label:win.label,compare_label:win.compare,spotlight,generated_at:now(),client_name:c.name,client_url:c.url,
    // Kept for older screens and reports.
    clicks:cur.clicks,impressions:cur.impressions,sessions:sum(g,'sessions'),open_issues:open.length,
    approved_content:content.filter(r=>['approved','pushed'].includes(r.status)).length,
    fixes_applied:of('fixes').filter(f=>['applied','verification_pending','verified'].includes(f.status)).length,
    data_sources:[...new Set([...gscRows,...g].map(t=>t.source||'manual'))],traffic_rows:gscRows.length+g.length,
    search:{...cur,previous:before},
    daily:gscRows.map(t=>({date:t.date,clicks:Number(t.clicks)||0,impressions:Number(t.impressions)||0})),
    analytics:{sessions:sum(g,'sessions'),engaged:sum(g,'engaged_sessions'),key_events:sum(g,'key_events'),days:g.length,previous:{sessions:sum(gp,'sessions'),engaged:sum(gp,'engaged_sessions'),key_events:sum(gp,'key_events'),days:gp.length}},
    insights:{as_of:insights.synced_at||null,top_queries:(insights.top_queries||[]).slice(0,8),pages_up:(insights.pages_up||[]).slice(0,5),pages_down:(insights.pages_down||[]).slice(0,5),cannibal:(insights.cannibal||[]).slice(0,4).map(m=>({query:m.query,impressions:m.impressions,pages:m.pages.map(p=>p.url)}))},
    keywords:{total:keywords.length,ranking:ranked.length,top3:ranked.filter(k=>pos(k)<=3).length,top10:ranked.filter(k=>pos(k)<=10).length,striking:striking.length,improved:ranked.filter(k=>Number(k.data.previous_position)>pos(k)).length,declined:ranked.filter(k=>Number(k.data.previous_position)&&Number(k.data.previous_position)<pos(k)).length,opportunities:striking.slice(0,8).map(kwRow),tracked:keywords.filter(k=>k.data.tracked).slice(0,10).map(kwRow),ideas:keywords.filter(k=>k.data.source==='DataForSEO'&&!pos(k)).sort((a,b)=>(Number(b.data.volume)||0)-(Number(a.data.volume)||0)).slice(0,5).map(kwRow)},
    technical:{health:withHealth[0]?Number(withHealth[0].data.health):null,previous_health:(()=>{const l=withHealth[0];if(!l)return null;const same=withHealth.slice(1).find(a=>!!a.data.provider_task_id===!!l.data.provider_task_id);return same?Number(same.data.health):null})(),audited:withHealth[0]?.data.checked_at||null,pages:withHealth.find(a=>a.data.pages>1)?.data.pages||null,open:open.length,by_severity:Object.fromEntries(['critical','high','medium','low'].map(s=>[s,open.filter(i=>i.data.severity===s).length])),by_category:Object.fromEntries(['Technical','On-page','Content','Core Web Vitals'].map(cat=>[cat,open.filter(i=>i.data.category===cat).length])),resolved_this_month:issues.filter(i=>i.status==='resolved'&&inSpan(i)).length,top:open.slice(0,8).map(i=>({title:i.title,severity:i.data.severity,category:i.data.category||'',pages:pages(i)})),speed:speed?{performance:speed.data.performance,seo:speed.data.seo,lcp:speed.data.lcp?round(speed.data.lcp/1000):null,cls:speed.data.cls,checked:speed.data.checked_at||speed.updated_at}:null},
    aeo:{questions:questions.length,checks:latest.length,cited:latest.filter(x=>x.o.data.cited).length,mentioned:latest.filter(x=>x.o.data.mentioned).length,engines,lost},
    work:{completed:completed.slice(0,15),completed_total:completed.length,pipeline},
    priorities
  };
}
