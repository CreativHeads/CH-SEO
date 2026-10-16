// Automatic fixes end to end against a simulated WordPress site and a simulated OpenAI.
import{test}from'node:test';import assert from'node:assert/strict';import{api}from'../worker/api.js';import{database}from'./helpers.mjs';import{sha}from'../worker/autofix.js';
const{DB,sqlite}=database(),env={DB,CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,6).toString('base64'),OPENAI_API_KEY:'sk-test-local-only-not-real',OPENAI_MODEL:'gpt-5.4-mini',OPENAI_DRAFT_MAX_USD:'0.5',OPENAI_INPUT_USD_PER_MILLION:'2',OPENAI_OUTPUT_USD_PER_MILLION:'10'},O='https://studio.example',S='https://site.example';
const call=async(m,p,b)=>{const r=await api(new Request(O+'/api/'+p,{method:m,headers:{'oai-authenticated-user-email':'admin@creativheads.com','content-type':'application/json',Origin:O},body:b?JSON.stringify(b):undefined}),env);return{status:r.status,data:await r.json()}};

// The simulated site: pages, a 404, a 301, a WordPress connector and a sitemap.
const site={redirects:{},meta:{42:{plugin:'rank_math',title:'About',description:'',noindex:false,canonical:''}},content:{42:'<p>Read <a href="/old-service/">our service</a> and <a href="https://site.example/gone/">this</a>.</p>'},canonicalTag:{42:'https://site.example/about-us/'}};
const pages={'/about/':42,'/services/clear-aligners/':0,'/services/':0,'/contact/':0};
const page=(path)=>{const id=pages[path];return new Response(`<html><head><title>${path}</title>${id&&site.canonicalTag[id]?`<link rel="canonical" href="${site.canonicalTag[id]}">`:''}</head><body><main><h1>${path}</h1>${id?site.content[id]:'<p>Page</p>'}</main></body></html>`,{status:200,headers:{'content-type':'text/html',...(id?{link:`<${S}/wp-json/wp/v2/pages/${id}>; rel="alternate"`}:{})}})};
const links=id=>[...String(site.content[id]).matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
let aiAnswer=null;const wpCalls=[];
globalThis.fetch=async(u,o={})=>{u=String(u);const method=(o.method||'GET').toUpperCase(),body=o.body?JSON.parse(o.body):null;
 if(u.startsWith('https://dns.google/'))return new Response(JSON.stringify({Answer:[{type:1,data:'93.184.216.34'}]}));
 if(u==='https://api.openai.com/v1/responses')return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify(aiAnswer(JSON.parse(body.input)))}]}],usage:{input_tokens:100,output_tokens:50}}));
 const url=new URL(u);if(url.origin!==S)return new Response('no',{status:500});const p=url.pathname;
 if(p.startsWith('/wp-json/')){wpCalls.push(method+' '+p);
  if(p==='/wp-json/ch-seo/v1/redirects'){if(method==='POST'){const from=body.from.toLowerCase().replace(/\/?$/,'/');if(body.to)site.redirects[from]={to:body.to};else delete site.redirects[from]}return Response.json(site.redirects)}
  let m=p.match(/^\/wp-json\/ch-seo\/v1\/seo-meta\/(\d+)$/);if(m){if(method==='POST'){Object.assign(site.meta[m[1]],body);if('canonical' in body)site.canonicalTag[m[1]]=body.canonical||'https://site.example/about/'}return Response.json(site.meta[m[1]])}
  m=p.match(/^\/wp-json\/ch-seo\/v1\/links\/(\d+)$/);if(m){if(method==='POST')for(const r of body.replacements)site.content[m[1]]=site.content[m[1]].split(`href="${r.from}"`).join(`href="${r.to}"`);return Response.json({builder:false,urls:links(m[1])})}
  m=p.match(/^\/wp-json\/wp\/v2\/pages\/(\d+)$/);if(m){if(method==='POST')site.content[m[1]]=body.content;return Response.json({id:Number(m[1]),content:{raw:site.content[m[1]]}})}
  return new Response('{}',{status:404})}
 if(p==='/wp-sitemap.xml')return new Response(`<urlset>${Object.keys(pages).map(x=>`<url><loc>${S}${x}</loc></url>`).join('')}</urlset>`);
 if(p==='/old-service/')return new Response('',{status:301,headers:{location:S+'/services/clear-aligners/'}});
 if(p==='/about-us/')return new Response('',{status:301,headers:{location:S+'/about/'}});
 if(p==='/gone/'||p==='/old-page/')return site.redirects[p]?new Response('',{status:301,headers:{location:site.redirects[p].to}}):new Response('not found',{status:404});
 if(p in pages)return page(p);return new Response('not found',{status:404})};

await call('GET','bootstrap');
const client=(await call('POST','clients',{name:'Auto Client',url:S+'/',platform:'WordPress',data:{wp_user:'Admin'}})).data;
await call('POST','connections',{client_id:client.id,action:'save_password',password:'abcd efgh ijkl mnop'});
const issue=(type,urls,title)=>{const rid=crypto.randomUUID();sqlite.prepare("INSERT INTO records(id,client_id,kind,title,status,data,revision,created_by,created_at,updated_at) VALUES(?,?,'issues',?,'open',?,1,'admin@creativheads.com',?,?)").run(rid,client.id,title,JSON.stringify({issue_type:'crawl:'+type,urls:urls.map(u=>S+u).join('\n'),severity:'high'}),new Date().toISOString(),new Date().toISOString());return rid};
const propose=async rid=>{const job=(await call('POST','jobs',{client_id:client.id,kind:'propose_fixes',input:{record_id:rid}})).data;return call('POST','jobs/'+job.id+'/run',{})};
const fixes=batch=>sqlite.prepare("SELECT id,revision,status,data FROM records WHERE kind='fixes' AND client_id=?").all(client.id).map(r=>({...r,data:JSON.parse(r.data)})).filter(r=>!batch||r.data.batch_id===batch);
const approve=async f=>call('POST','records/'+f.id+'/action',{action:'approve',revision:f.revision});

await test('404 pages get a 301 redirect to the best live page, applied on approval',async()=>{
 aiAnswer=inp=>({items:inp.broken.map((b,i)=>({i,target:'/services/clear-aligners/',why:'Same service'}))});
 const run=await propose(issue('is_4xx_code',['/old-page/'],'Pages not found (4xx)'));assert.equal(run.status,200,JSON.stringify(run.data));
 const [f]=fixes(run.data.result.batch_id);assert.equal(f.status,'in_review');assert.equal(f.data.kind,'redirect');assert.equal(f.data.after,S+'/services/clear-aligners/');
 const a=await approve(f);assert.equal(a.status,200,JSON.stringify(a.data));assert.ok(['applied','verification_pending'].includes(a.data.status),a.data.status+' '+(a.data.auto_apply_error||''));
 assert.equal(site.redirects['/old-page/'].to,S+'/services/clear-aligners/');
});
await test('Links to redirected and dead pages are rewritten, and can be rolled back',async()=>{
 aiAnswer=inp=>({items:inp.dead.map((d,i)=>({i,target:'/contact/'}))});
 const run=await propose(issue('broken_links',['/about/'],'Pages with broken links'));assert.equal(run.status,200,JSON.stringify(run.data));
 const [f]=fixes(run.data.result.batch_id);assert.equal(f.data.kind,'links');assert.equal(f.data.replacements.length,2);
 const a=await approve(f);assert.ok(['applied','verification_pending'].includes(a.data.status),JSON.stringify(a.data.auto_apply_error||a.data.status));
 assert.match(site.content[42],/clear-aligners/);assert.match(site.content[42],/contact/);assert.doesNotMatch(site.content[42],/old-service|gone/);
 const now=fixes(run.data.result.batch_id)[0];const job=(await call('POST','jobs',{client_id:client.id,kind:'rollback_fix',input:{record_id:now.id}})).data;const rb=await call('POST','jobs/'+job.id+'/run',{});assert.equal(rb.status,200,JSON.stringify(rb.data));
 assert.match(site.content[42],/old-service/);
});
await test('A canonical tag pointing to a redirect is corrected',async()=>{
 const run=await propose(issue('canonical_to_redirect',['/about/'],'Canonical points to a redirect'));assert.equal(run.status,200,JSON.stringify(run.data));
 const [f]=fixes(run.data.result.batch_id);assert.equal(f.data.kind,'canonical');assert.equal(f.data.after,S+'/about/');
 const a=await approve(f);assert.equal(a.data.status,'applied',JSON.stringify(a.data.auto_apply_error||a.data.status));assert.equal(site.meta[42].canonical,S+'/about/');
});
await test('Thin pages get extra helpful text; a page edited meanwhile is protected',async()=>{
 aiAnswer=()=>({html:'<h2>Why choose clear aligners</h2><p>Clear aligners straighten teeth gently and are almost invisible, so you can smile with confidence during treatment.</p><script>alert(1)</script><p>Our team plans every step with you and checks progress at each visit.</p>',summary:'Adds two useful sections.'});
 const run=await propose(issue('low_character_count',['/about/'],'Very little text (thin content)'));assert.equal(run.status,200,JSON.stringify(run.data));
 const [f]=fixes(run.data.result.batch_id);assert.equal(f.data.kind,'page_content');assert.doesNotMatch(f.data.content_after,/<script/);assert.equal(f.data.hash_before,await sha(site.content[42]));
 site.content[42]+='<p>Edited by someone</p>';const blocked=await approve(f);assert.match(String(blocked.data.auto_apply_error||''),/edited on the site|changed since/i);
});
await test('Orphan pages get a link from a related page',async()=>{
 site.content[42]='<p>About us.</p>';aiAnswer=inp=>({items:inp.orphans.map((o,i)=>({i,source:'/about/',before:'Questions? Visit our',anchor:'contact page',after:' any time.'}))});
 const run=await propose(issue('is_orphan_page',['/contact/'],'Orphan pages'));assert.equal(run.status,200,JSON.stringify(run.data));
 const [f]=fixes(run.data.result.batch_id);assert.equal(f.data.kind,'page_content');
 const a=await approve(f);assert.ok(['applied','verification_pending'].includes(a.data.status),JSON.stringify(a.data.auto_apply_error||a.data.status));
 assert.match(site.content[42],/<a href="https:\/\/site\.example\/contact\/">contact page<\/a>/);
});
await test('Issues that need the server or hosting are refused with a clear message',async()=>{
 const run=await propose(issue('high_loading_time',['/about/'],'Slow loading pages'));assert.equal(run.status,409);
});
