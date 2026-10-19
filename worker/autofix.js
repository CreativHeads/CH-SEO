// Automatic fixes for audit issues beyond titles, descriptions, H1 and alt text.
// Every proposal is checked against the live site first and is created "in review": nothing changes
// on a website until an Admin or Head of SEO approves it, and every change can be rolled back.
import {parseHTML} from 'linkedom';
import {run,rows,insist,createRecord,updateRecord,recordFor,id} from './db.js';
import {str,httpsUrl} from './validation.js';
import {publicFetch,wp,reserve,writingContext} from './providers.js';

// Crawl check -> how SEO Studio fixes it.
const AUTO={is_4xx_code:'redirect',is_broken:'redirect',redirect_chain:'redirect_chain',broken_links:'links',has_links_to_redirects:'links',canonical_to_broken:'canonical',canonical_to_redirect:'canonical',duplicate_content:'duplicate',is_orphan_page:'orphan',low_character_count:'thin'};
export const autoFixOf=issue=>AUTO[String(issue?.data?.issue_type||'').replace(/^crawl:/,'')]||null;

// Short fingerprint of page content (whitespace-insensitive), used to check a page was not edited between proposal and apply.
export async function sha(text){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(text).replace(/\s+/g,' ').trim()));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,32)}

const bare=h=>String(h).toLowerCase().replace(/^www\./,'');
const sameSite=(u,client)=>{try{return bare(new URL(u).hostname)===bare(new URL(client.url).hostname)}catch{return false}};
const pathOf=u=>{try{return new URL(u).pathname}catch{return u}};
// Addresses made by the server, Cloudflare or WordPress itself (e.g. Cloudflare's email protection): never redirect or rewrite them.
export const systemPath=u=>/^\/(cdn-cgi|wp-admin|wp-json|wp-includes)\/|^\/(wp-login|xmlrpc|wp-cron)\.php/.test(pathOf(u));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SKIP_EXT=/\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4|mp3|css|js|xml|ico|woff2?)(\?|$)/i;

// Follow redirects one hop at a time (max 6) and report where a URL really ends up.
async function follow(url,cache){if(cache?.has(url))return cache.get(url);let cur=url,hops=0,status=0;
 for(;hops<=6;hops++){let r;try{r=await publicFetch(cur)}catch{status=0;break}status=r.status;try{await r.body?.cancel()}catch{}
  if(status>=300&&status<400&&r.headers.get('location')){cur=new URL(r.headers.get('location'),cur).href;continue}break}
 const out={status,final:cur,hops};cache?.set(url,out);return out}

async function pageInfo(url){let r=await publicFetch(url),hop=0;while(r.status>=300&&r.status<400&&r.headers.get('location')&&hop++<3){url=new URL(r.headers.get('location'),url).href;r=await publicFetch(url)}
 const m=(r.headers.get('link')||'').match(/wp\/v2\/(pages|posts)\/(\d+)/),html=r.ok?await r.text():'';const {document}=parseHTML(html||'<html></html>');
 return{url,ok:r.ok,status:r.status,post_id:m?Number(m[2]):0,post_type:m?(m[1]==='posts'?'post':'page'):'',document,
  title:(document.querySelector('title')?.textContent||'').trim(),h1:(document.querySelector('h1')?.textContent||'').replace(/\s+/g,' ').trim(),
  canonical:document.querySelector('link[rel="canonical"]')?.getAttribute('href')||'',
  text:((document.querySelector('main')||document.querySelector('article')||document.body)?.textContent||'').replace(/\s+/g,' ').trim()}}

// Live pages listed in the site's sitemap: the only allowed targets for redirects and links.
async function sitemapUrls(client){const out=new Set(),base=new URL(client.data.wp_url||client.url).origin,seen=new Set();
 const read=async u=>{if(seen.has(u)||seen.size>12)return[];seen.add(u);try{const r=await publicFetch(u);if(!r.ok)return[];const x=await r.text();return[...x.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m=>m[1].replace(/&amp;/g,'&'))}catch{return[]}};
 for(const start of ['/wp-sitemap.xml','/sitemap_index.xml','/sitemap.xml']){const locs=await read(base+start);if(!locs.length)continue;
  const subs=locs.filter(l=>/\.xml(\?|$)/i.test(l)).sort((a,b)=>Number(/post|page/i.test(b))-Number(/post|page/i.test(a)));
  for(const l of locs.filter(l=>!/\.xml(\?|$)/i.test(l)))out.add(l);for(const s of subs.slice(0,8))for(const l of await read(s))if(!/\.xml(\?|$)/i.test(l))out.add(l);
  if(out.size)break}
 return[...out].filter(u=>sameSite(u,client)&&!SKIP_EXT.test(u)).slice(0,600)}

// One OpenAI call with a strict JSON answer; cost is reserved first and recorded after.
async function aiJson(env,client,purpose,{instructions,input,schema,max=3000}){
 insist(env.OPENAI_API_KEY&&env.OPENAI_MODEL,'Configure OpenAI first: AI chooses the best fix.',409);
 const reservation=await reserve(env,client,'openai',purpose,env.OPENAI_DRAFT_MAX_USD);
 try{const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:env.OPENAI_MODEL,max_output_tokens:Math.max(max,4000),...(/^(gpt-5|o[1-9])/i.test(env.OPENAI_MODEL)?{reasoning:{effort:'low'}}:{}),instructions,input:JSON.stringify(input),text:{format:{type:'json_schema',name:'fix',strict:true,schema}}}),signal:AbortSignal.timeout(120000)});
  const d=await r.json();insist(r.ok,'OpenAI: '+(d.error?.message||'request failed'),502);
  const rateIn=Number(env.OPENAI_INPUT_USD_PER_MILLION),rateOut=Number(env.OPENAI_OUTPUT_USD_PER_MILLION);
  if(Number.isFinite(rateIn)&&Number.isFinite(rateOut)&&d.usage)await run(env,"UPDATE usage_log SET actual_micros=?,status='completed' WHERE id=?",Math.ceil(d.usage.input_tokens*rateIn+d.usage.output_tokens*rateOut),reservation);else await run(env,"UPDATE usage_log SET status='needs_reconciliation' WHERE id=?",reservation);
  return JSON.parse((d.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('')||'{}')}
 catch(e){await run(env,"UPDATE usage_log SET status='needs_reconciliation' WHERE id=? AND status='reserved'",reservation);throw e}}

// Keep AI-written HTML to simple, safe tags; links may only point to the client site.
function cleanHtml(html,client){const {document}=parseHTML('<div id="x">'+String(html)+'</div>'),ok=new Set(['H2','H3','P','UL','OL','LI','STRONG','EM','A','BR']);
 const walk=n=>[...n.childNodes].map(c=>{if(c.nodeType===3)return esc(c.textContent);if(c.nodeType!==1)return'';const inner=walk(c);if(!ok.has(c.tagName))return inner;
  if(c.tagName==='A'){const h=c.getAttribute('href')||'';let abs='';try{abs=new URL(h,client.url).href}catch{}return abs&&sameSite(abs,client)?`<a href="${esc(abs)}">${inner}</a>`:inner}
  return c.tagName==='BR'?'<br>':`<${c.tagName.toLowerCase()}>${inner}</${c.tagName.toLowerCase()}>`}).join('');
 return walk(document.getElementById('x')).trim()}

const LIVE_TYPES=new Set(['crawl:is_broken','crawl:is_4xx_code','crawl:is_5xx_code']);
function stillBroken(type,status){return type==='crawl:is_5xx_code'?status>=500&&status<600:[404,410].includes(status)}
async function applyLiveIssueStatus(env,user,issue,keepUrls){
 const before=String(issue.data.urls||'').split('\n').map(s=>s.trim()).filter(Boolean);
 const keep=new Set(keepUrls),next=before.filter(u=>keep.has(u));
 if(next.length===before.length)return{changed:false,status:issue.status,remaining:next.length};
 const fresh=await recordFor(env,issue.id);
 if(!next.length){await updateRecord(env,user,fresh,{status:'resolved',data:{...fresh.data,urls:'',affected:0,change:'fixed',resolution:'Live check: these URLs now load, or they are system addresses, so they are not dead pages.'}},'audit_live_fixed');return{changed:true,status:'resolved',remaining:0}}
 await updateRecord(env,user,fresh,{data:{...fresh.data,urls:next.join('\n'),affected:next.length,change:'better'}},'audit_live_better');
 return{changed:true,status:'open',remaining:next.length}
}
export async function recheckCrawlIssues(env,user,client){
 const open=(await rows(env,"SELECT * FROM records WHERE client_id=? AND kind='issues' AND status='open'",client.id)).map(r=>({...r,data:JSON.parse(r.data||'{}')}));
 const cache=new Map();let resolved=0,updated=0;
 for(const issue of open.filter(r=>LIVE_TYPES.has(String(r.data.issue_type||'')))){
  const urls=String(issue.data.urls||'').split('\n').map(s=>s.trim()).filter(Boolean).slice(0,40),keep=[];
  for(const u of urls){if(systemPath(u))continue;const f=await follow(u,cache);if(stillBroken(issue.data.issue_type,f.status))keep.push(u)}
  const r=await applyLiveIssueStatus(env,user,issue,keep);if(r.changed&&r.status==='resolved')resolved++;else if(r.changed)updated++;
 }
 return{resolved,updated}
}
async function connectorLinks(env,client,postId){try{return await wp(env,client,'/wp-json/ch-seo/v1/links/'+postId)}catch(e){insist(!/HTTP 404/.test(e.message),'Update the CreativHeads SEO Connector plugin on this site to version 1.1 (Client Setup → download), then try again.',409);throw e}}
async function rawContent(env,client,info){const v=await wp(env,client,'/wp-json/wp/v2/'+(info.post_type==='post'?'posts':'pages')+'/'+info.post_id+'?context=edit');return String(v.content?.raw||'')}

export async function proposeAutoFixes(env,user,client,issue){
 insist(issue?.kind==='issues'&&issue.client_id===client.id,'Choose an audit issue of this client.');
 const how=autoFixOf(issue);insist(how,'This issue cannot be fixed automatically. It stays in Site Audit with instructions.',409);
 insist(client.platform==='WordPress'&&client.data.wp_user,'Connect WordPress first (Client Setup → Connect WordPress).',409);
 const urls=[...new Set(String(issue.data.urls||'').split('\n').map(s=>s.trim().split('#')[0]).filter(u=>u&&sameSite(u,client)))];
 const batch=id(),skipped=[],made=[],cache=new Map(),reason=t=>`Automatic fix for audit issue "${issue.title}". ${t}`;
 const add=async(title,data)=>{await createRecord(env,user,client.id,'fixes',str(title,240),{...data,issue_id:issue.id,batch_id:batch,ai:true,auto:how},'in_review');made.push(title)};
 const done=()=>{if(!made.length)return{created:0,kind:how,pages:urls.length,skipped:skipped.length,skipped_detail:skipped.slice(0,6),remaining:0,batch_id:batch,already:true};return{created:made.length,kind:how,pages:urls.length,skipped:skipped.length,skipped_detail:skipped.slice(0,6),remaining:0,batch_id:batch}};
 const redirects=async()=>{try{return await wp(env,client,'/wp-json/ch-seo/v1/redirects')}catch{return{}}};
 const norm=u=>{const p='/'+decodeURIComponent(pathOf(u)).toLowerCase().replace(/^\/+|\/+$/g,'');return p==='/'?'/':p+'/'};

 if(how==='redirect'){
  const map=await redirects(),broken=[];
  for(const u of urls.slice(0,30)){if(systemPath(u)){skipped.push(pathOf(u)+' is a system address (Cloudflare/WordPress), not a page');continue}if(map[norm(u)]){skipped.push(pathOf(u)+' already redirects');continue}const f=await follow(u,cache);if(![404,410].includes(f.status)){skipped.push(pathOf(u)+` now answers ${f.status||'no response'}`);continue}broken.push(u)}
  const checked=new Set(urls.slice(0,30));await applyLiveIssueStatus(env,user,issue,[...broken,...urls.filter(u=>!checked.has(u))]);
  if(broken.length){const pages=(await sitemapUrls(client)).filter(u=>!broken.includes(u));insist(pages.length,'Could not read the site map to choose redirect targets.',409);
   const ans=await aiJson(env,client,'auto_fix',{instructions:'You choose 301 redirect targets for broken URLs on a website. For each broken URL pick the single most relevant live page from the candidates (same topic, service or product). If nothing is clearly related, choose the closest parent section; use "" only if there is truly no sensible page. Never invent URLs.',input:{site:client.url,broken:broken.map(pathOf),candidates:pages.map(pathOf)},schema:{type:'object',additionalProperties:false,required:['items'],properties:{items:{type:'array',items:{type:'object',additionalProperties:false,required:['i','target','why'],properties:{i:{type:'integer'},target:{type:'string'},why:{type:'string'}}}}}}});
   const byPath=new Map(pages.map(u=>[pathOf(u),u]));
   for(const it of ans.items||[]){const from=broken[it.i],to=byPath.get(it.target);if(!from||!to){if(from)skipped.push(pathOf(from)+': no related page found');continue}
    await add(`Redirect: ${pathOf(from)} → ${pathOf(to)}`,{kind:'redirect',url:new URL(pathOf(from),client.url).href,post_id:0,before:'',after:to,reason:reason(`${pathOf(from)} returns 404, so visitors and Google hit a dead end. A 301 redirect sends them to ${pathOf(to)}. ${str(it.why,200)}`)})}}
  return done()}

 if(how==='redirect_chain'){
  const map=await redirects();
  for(const u of urls.slice(0,30)){const f=await follow(u,cache);if(f.hops<2||f.status!==200){skipped.push(pathOf(u)+' is no longer a chain');continue}
   const rule=map[norm(u)];if(!rule){skipped.push(pathOf(u)+': this redirect is set on the server or in another plugin, change it there');continue}
   await add(`Shorten redirect: ${pathOf(u)}`,{kind:'redirect',url:new URL(norm(u),client.url).href,post_id:0,before:rule.to||'',after:f.final,reason:reason(`${pathOf(u)} passes through ${f.hops} redirects. Pointing it straight to ${pathOf(f.final)} makes it faster and keeps its ranking power.`)})}
  return done()}

 if(how==='links'){
  const map=await redirects();let checks=0;const pending=[];
  for(const u of urls.slice(0,15)){const info=await pageInfo(u);if(!info.post_id){skipped.push(pathOf(u)+': listing page (edit its links in the theme or menu)');continue}
   const {urls:links}=await connectorLinks(env,client,info.post_id),reps=[],dead=[];
   for(const href of links){if(checks>=80)break;let abs;try{abs=new URL(href,client.url).href}catch{continue}if(!/^https?:/.test(abs)||!sameSite(abs,client)||SKIP_EXT.test(abs)||/\/wp-(admin|content|json)\//.test(abs)||systemPath(abs))continue;
    checks++;const f=await follow(abs.split('#')[0],cache);
    if(f.hops>0&&f.status===200&&f.final!==abs)reps.push({from:href,to:f.final,why:`redirects to ${pathOf(f.final)}`});
    else if([404,410].includes(f.status)){const m=map[norm(abs)];if(m?.to)reps.push({from:href,to:m.to,why:`was removed; ${pathOf(m.to)} replaces it`});else dead.push(href)}}
   pending.push({info,reps,dead})}
  const dead=[...new Set(pending.flatMap(p=>p.dead))];
  if(dead.length){const pages=await sitemapUrls(client);if(pages.length){const ans=await aiJson(env,client,'auto_fix',{instructions:'These links on a website point to pages that no longer exist. For each, choose the most relevant live page from the candidates, or "" if nothing fits. Never invent URLs.',input:{site:client.url,dead:dead.map(h=>pathOf(new URL(h,client.url).href)),candidates:pages.map(pathOf)},schema:{type:'object',additionalProperties:false,required:['items'],properties:{items:{type:'array',items:{type:'object',additionalProperties:false,required:['i','target'],properties:{i:{type:'integer'},target:{type:'string'}}}}}}});
   const byPath=new Map(pages.map(u=>[pathOf(u),u])),pick=new Map((ans.items||[]).map(x=>[dead[x.i],byPath.get(x.target)]));
   for(const p of pending)for(const h of p.dead){const to=pick.get(h);if(to)p.reps.push({from:h,to,why:`no longer exists; ${pathOf(to)} is the closest live page`});else skipped.push(pathOf(p.info.url)+`: no replacement for ${h}`)}}}
  for(const {info,reps} of pending){const uniq=[...new Map(reps.map(r=>[r.from,r])).values()].slice(0,40);if(!uniq.length){skipped.push(pathOf(info.url)+': links already fine');continue}
   await add(`Links: ${pathOf(info.url)} (${uniq.length} link${uniq.length===1?'':'s'})`,{kind:'links',url:info.url,post_id:info.post_id,post_type:info.post_type,replacements:uniq.map(({from,to})=>({from,to})),
    before:uniq.map(r=>r.from).join('\n'),after:uniq.map(r=>r.to).join('\n'),reason:reason(uniq.map(r=>`${r.from} ${r.why}`).join('; ').slice(0,600))})}
  return done()}

 if(how==='canonical'){
  for(const u of urls.slice(0,20)){const info=await pageInfo(u);if(!info.post_id||!info.canonical){skipped.push(pathOf(u)+(info.post_id?': no canonical tag':': listing page'));continue}
   let target=info.canonical;try{target=new URL(info.canonical,info.url).href}catch{}const f=await follow(target,cache);
   const next=f.status===200?f.final:(await follow(info.url,cache)).final;if(!next||next===target){skipped.push(pathOf(u)+': canonical already fine');continue}
   const stored=(await wp(env,client,'/wp-json/ch-seo/v1/seo-meta/'+info.post_id));insist('canonical' in stored,'Update the CreativHeads SEO Connector plugin on this site to version 1.1 (Client Setup → download), then try again.',409);
   await add(`Canonical: ${pathOf(info.url)}`,{kind:'canonical',url:info.url,post_id:info.post_id,post_type:info.post_type,before:stored.canonical||'',after:next,reason:reason(`The canonical tag points to ${pathOf(target)}, which ${f.status===200?'redirects':'is broken'}. Google should be told the real page: ${pathOf(next)}.`)})}
  return done()}

 if(how==='duplicate'){
  const pages=[];for(const u of urls.slice(0,12)){const info=await pageInfo(u);if(info.post_id)pages.push(info);else skipped.push(pathOf(u)+': listing page')}
  insist(pages.length>1,'Need at least two editable pages to compare.',409);
  const ans=await aiJson(env,client,'auto_fix',{instructions:'These pages were flagged as duplicate content. Group pages that are really about the same thing. In each group choose the main page (the clearest, most complete or most important URL). Leave pages that are genuinely different out of any group.',input:{pages:pages.map((p,i)=>({i,url:pathOf(p.url),title:p.title,h1:p.h1,text:p.text.slice(0,500)}))},schema:{type:'object',additionalProperties:false,required:['groups'],properties:{groups:{type:'array',items:{type:'object',additionalProperties:false,required:['main','duplicates','why'],properties:{main:{type:'integer'},duplicates:{type:'array',items:{type:'integer'}},why:{type:'string'}}}}}}});
  for(const g of ans.groups||[]){const main=pages[g.main];if(!main)continue;for(const j of g.duplicates||[]){const p=pages[j];if(!p||p===main)continue;const stored=await wp(env,client,'/wp-json/ch-seo/v1/seo-meta/'+p.post_id);insist('canonical' in stored,'Update the CreativHeads SEO Connector plugin on this site to version 1.1 (Client Setup → download), then try again.',409);
   await add(`Canonical: ${pathOf(p.url)} → ${pathOf(main.url)}`,{kind:'canonical',url:p.url,post_id:p.post_id,post_type:p.post_type,before:stored.canonical||'',after:main.url,reason:reason(`${pathOf(p.url)} repeats ${pathOf(main.url)}. A canonical tag tells Google which one to rank, so they stop competing. ${str(g.why,200)}`)})}}
  return done()}

 if(how==='orphan'){
  const pages=(await sitemapUrls(client)).filter(u=>!urls.includes(u));insist(pages.length,'Could not read the site map to find related pages.',409);
  const orphans=[];for(const u of urls.slice(0,8)){const info=await pageInfo(u);if(info.ok)orphans.push(info);else skipped.push(pathOf(u)+' is not reachable')}
  const ans=await aiJson(env,client,'auto_fix',{instructions:'Each orphan page has no internal links pointing to it. For each, pick the one most related existing page (from candidates) that should link to it, and write one short natural sentence for that page: text before the link, the link text (2-6 words, descriptive, not "click here"), and text after. Match the site language. No prices or claims that are not in the orphan title.',input:{site:client.url,orphans:orphans.map((o,i)=>({i,url:pathOf(o.url),title:o.title,h1:o.h1})),candidates:pages.map(pathOf).slice(0,300)},schema:{type:'object',additionalProperties:false,required:['items'],properties:{items:{type:'array',items:{type:'object',additionalProperties:false,required:['i','source','before','anchor','after'],properties:{i:{type:'integer'},source:{type:'string'},before:{type:'string'},anchor:{type:'string'},after:{type:'string'}}}}}}});
  const byPath=new Map(pages.map(u=>[pathOf(u),u])),bySource=new Map();
  for(const it of ans.items||[]){const o=orphans[it.i],src=byPath.get(it.source);if(!o||!src){if(o)skipped.push(pathOf(o.url)+': no related page');continue}const list=bySource.get(src)||[];list.push({o,it});bySource.set(src,list)}
  for(const [src,list] of bySource){const info=await pageInfo(src);if(!info.post_id){skipped.push(pathOf(src)+': listing page');continue}const l=await connectorLinks(env,client,info.post_id);if(l.builder){skipped.push(pathOf(src)+': built with Elementor, add the link there');continue}
   const raw=await rawContent(env,client,info),para=list.map(({o,it})=>`<p>${esc(str(it.before,200))} <a href="${esc(o.url)}">${esc(str(it.anchor,80))}</a>${esc(str(it.after,200))}</p>`).join('\n'),next=raw+'\n'+para;
   await add(`Internal link: ${pathOf(src)} → ${list.map(x=>pathOf(x.o.url)).join(', ')}`,{kind:'page_content',url:info.url,post_id:info.post_id,post_type:info.post_type,content_before:raw,content_after:next,hash_before:await sha(raw),hash_after:await sha(next),
    before:`${pathOf(src)} has no link to ${list.map(x=>pathOf(x.o.url)).join(', ')}`,after:'Adds at the end of the page:\n'+list.map(({o,it})=>`${str(it.before,200)} [${str(it.anchor,80)}](${pathOf(o.url)})${str(it.after,200)}`).join('\n'),reason:reason('Pages with no internal links are hard for Google and visitors to find. A link from a related page fixes that.')})}
  return done()}

 if(how==='thin'){
  let guide='';try{const w=await writingContext(env,client,'English');guide=typeof w==='string'?w:JSON.stringify(w||{})}catch{}
  for(const u of urls.slice(0,4)){const info=await pageInfo(u);if(!info.post_id){skipped.push(pathOf(u)+': listing page');continue}const l=await connectorLinks(env,client,info.post_id);if(l.builder){skipped.push(pathOf(u)+': built with Elementor, add text there');continue}
   const raw=await rawContent(env,client,info),words=info.text.split(' ').filter(Boolean).length;
   const ans=await aiJson(env,client,'auto_fix',{max:5000,instructions:'This web page has too little text for Google to understand it. Write 2-3 extra sections (an H2 heading and 1-2 short paragraphs each, optionally one short list) that genuinely help a visitor of this page, in the same language and brand voice. Use only facts present in the page or the brand guide; never invent prices, numbers, awards or guarantees. Return simple HTML using only h2, p, ul, li, strong.',input:{url:info.url,title:info.title,h1:info.h1,current_text:info.text.slice(0,2500),brand_guide:guide.slice(0,4000)},schema:{type:'object',additionalProperties:false,required:['html','summary'],properties:{html:{type:'string'},summary:{type:'string'}}}});
   const extra=cleanHtml(ans.html,client);if(extra.length<200){skipped.push(pathOf(u)+': AI text too short');continue}const next=raw+'\n'+extra,added=extra.replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean).length;
   await add(`More text: ${pathOf(info.url)} (+${added} words)`,{kind:'page_content',url:info.url,post_id:info.post_id,post_type:info.post_type,content_before:raw,content_after:next,hash_before:await sha(raw),hash_after:await sha(next),
    before:`${words} words on the page`,after:`Adds about ${added} words at the end:\n`+extra.replace(/<\/(h2|p|li)>/g,'\n').replace(/<[^>]+>/g,'').replace(/\n{2,}/g,'\n').trim().slice(0,1500),reason:reason(`Thin pages rank poorly. ${str(ans.summary,300)}`)})}
  return done()}
 insist(false,'Unknown automatic fix.',409)}
export const sameHost=(a,b)=>{try{return bare(new URL(a).hostname)===bare(new URL(b).hostname)}catch{return false}};
