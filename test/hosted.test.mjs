// Online version: Postgres (Supabase) database layer and the sign-in front door.
import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{translate,pgliteDatabase}from'../server/pg-db.js';import{createHosted}from'../server/hosted.js';import worker from'../worker/index.js';

const origin='https://studio.example',KEY=Buffer.alloc(32,9).toString('base64');
const DB=await pgliteDatabase(fs.readFileSync('supabase/schema.sql','utf8'));
await DB.prepare("INSERT INTO members(id,email,name,role,active,created_at) VALUES('m1','admin@creativheads.com','Admin','admin',1,'2026-01-01'),('m2','lead@creativheads.com','Lead','seo_lead',1,'2026-01-01'),('m3','gone@creativheads.com','Gone','staff',0,'2026-01-01')").run();
const env={DB,CREDENTIAL_ENCRYPTION_KEY:KEY,SUPABASE_URL:'https://proj.supabase.co',SUPABASE_ANON_KEY:'anon'};
const tokens={'tok-admin':'admin@creativheads.com','tok-lead':'Lead@CreativHeads.com','tok-gone':'gone@creativheads.com','tok-stranger':'someone@gmail.com'};
const realFetch=globalThis.fetch;
globalThis.fetch=async(u,o={})=>{u=String(u);if(u.startsWith(env.SUPABASE_URL+'/auth/v1/user')){const t=String(o.headers?.Authorization||'').replace('Bearer ','');return tokens[t]?new Response(JSON.stringify({email:tokens[t]})):new Response('{}',{status:401})}return realFetch(u,o)};
const handle=createHosted({worker,env});
const req=(path,{method='GET',body,cookie,headers={}}={})=>handle(new Request(origin+path,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json',origin}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}));
const signIn=async token=>{const r=await req('/auth/session',{method:'POST',body:{access_token:token}});return{r,cookie:(r.headers.get('set-cookie')||'').split(';')[0]}};

await test('SQLite-only SQL is translated for Postgres',()=>{
 assert.equal(translate("SELECT * FROM records WHERE client_id=? AND json_extract(data,'$.month')=?"),"SELECT * FROM records WHERE client_id=$1 AND (data::jsonb #>> '{month}')=$2");
 assert.match(translate("SELECT client_id,json_extract(data,'$.date') d FROM records"),/\(data::jsonb #> '\{date\}'\) d FROM/);
 assert.match(translate("SELECT 1 FROM records WHERE json_extract(data,'$.cited')=1"),/IN \('1','true'\)/);
 assert.match(translate("INSERT OR IGNORE INTO members(id) VALUES(?)"),/^INSERT INTO members\(id\) VALUES\(\$1\) ON CONFLICT DO NOTHING$/);
 assert.equal(translate("SELECT '?' AS q, ? AS v"),"SELECT '?' AS q, $1 AS v");
});
await test('Pages need sign-in and forged identity headers are ignored',async()=>{
 const page=await req('/client-dashboard/?client=x');assert.equal(page.status,302);assert.match(page.headers.get('location'),/^\/login\?return_to=%2Fclient-dashboard%2F/);
 const forged=await req('/api/bootstrap',{headers:{'oai-authenticated-user-email':'admin@creativheads.com'}});assert.equal(forged.status,401);
 const login=await req('/login');assert.equal(login.status,200);assert.match(await login.text(),/proj\.supabase\.co\/auth\/v1\/authorize\?provider=google/);
});
await test('Team members sign in; others are refused',async()=>{
 const a=await signIn('tok-admin');assert.equal(a.r.status,200);assert.match(a.r.headers.get('set-cookie'),/HttpOnly/);
 const boot=await req('/api/bootstrap',{cookie:a.cookie});assert.equal(boot.status,200);assert.equal((await boot.json()).user.role,'admin');
 const l=await signIn('tok-lead');assert.equal(l.r.status,200);const lb=await(await req('/api/bootstrap',{cookie:l.cookie})).json();assert.equal(lb.user.role,'seo_lead');
 assert.equal((await req('/api/admin/overview',{cookie:l.cookie})).status,403);
 assert.equal((await signIn('tok-gone')).r.status,403);assert.equal((await signIn('tok-stranger')).r.status,403);assert.equal((await signIn('bad-token')).r.status,401);
 const tampered=a.cookie.slice(0,-3)+'abc';assert.equal((await req('/api/bootstrap',{cookie:tampered})).status,401);
 const cross=await handle(new Request(origin+'/auth/session',{method:'POST',headers:{'content-type':'application/json',origin:'https://evil.example'},body:JSON.stringify({access_token:'tok-admin'})}));assert.equal(cross.status,403);
 const out=await req('/signout-with-chatgpt',{cookie:a.cookie});assert.equal(out.status,302);assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
});
await test('Login page offers email + password and Google, and sends the password only to Supabase',async()=>{
 const h=await(await req('/login?return_to=/keyword-research/')).text();
 assert.match(h,/type="password"/);assert.ok(h.includes('proj.supabase.co/auth/v1/token?grant_type=password'));assert.match(h,/provider=google/);assert.ok(!h.includes('/auth/email'));
 assert.notEqual((await req('/auth/email',{method:'POST',body:{email:'lead@creativheads.com'}})).status,200);
});
await test('Saving, history and stale-edit protection work on Postgres',async()=>{
 const {cookie}=await signIn('tok-admin');const call=async(path,method='GET',body)=>{const r=await req('/api/'+path,{method,cookie,...(body?{body}:{})});return{status:r.status,data:await r.json()}};
 const c=await call('clients','POST',{name:'PG Client',url:'https://pg.example/',platform:'WordPress',data:{}});assert.equal(c.status,201,JSON.stringify(c.data));
 const rec=await call('records','POST',{client_id:c.data.id,kind:'content',title:'Draft',data:{body:'Hi'}});assert.equal(rec.status,201,JSON.stringify(rec.data));
 const up=await call('records/'+rec.data.id,'PUT',{client_id:c.data.id,kind:'content',title:'Draft 2',data:{body:'Hi again'},revision:rec.data.revision});assert.equal(up.status,200,JSON.stringify(up.data));assert.equal(up.data.revision,2);
 const stale=await call('records/'+rec.data.id,'PUT',{client_id:c.data.id,kind:'content',title:'x',data:{},revision:1});assert.equal(stale.status,409);
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM record_history WHERE record_id=?').bind(rec.data.id).first()).n,1);
 const ov=await call('admin/overview');assert.equal(ov.status,200);
});
await test('Admin sets a login password when saving a team member; others cannot',async()=>{
 const calls=[],users=[{id:'u-lead',email:'lead@creativheads.com'}],prev=globalThis.fetch;
 globalThis.fetch=async(u,o={})=>{u=String(u);if(!u.includes('/auth/v1/admin/'))return prev(u,o);calls.push({u,method:o.method,auth:o.headers.Authorization,body:o.body&&JSON.parse(o.body)});return new Response(JSON.stringify(o.method==='GET'?{users}:{id:'new'}))};
 try{
  const noKey=await req('/api/people',{method:'POST',cookie:(await signIn('tok-admin')).cookie,body:{name:'N',email:'new@creativheads.com',role:'seo_lead',password:'longenough1'}});assert.equal(noKey.status,400);assert.match((await noKey.json()).error,/SUPABASE_SERVICE_ROLE_KEY/);
  const h2=createHosted({worker,env:{...env,SUPABASE_SERVICE_ROLE_KEY:'service-key'}});
  const r2=(path,{body,cookie})=>h2(new Request(origin+path,{method:'POST',headers:{cookie,'content-type':'application/json',origin},body:JSON.stringify(body)}));
  const admin=(await signIn('tok-admin')).cookie,lead=(await signIn('tok-lead')).cookie;
  assert.equal((await r2('/api/people',{cookie:admin,body:{name:'N',email:'new@creativheads.com',role:'seo_lead',password:'short'}})).status,400);
  const made=await r2('/api/people',{cookie:admin,body:{name:'New',email:'New@CreativHeads.com',role:'seo_lead',active:true,password:'longenough1'}});assert.equal(made.status,200);assert.match((await made.json()).login,/Password set/);
  assert.ok(calls.some(c=>c.method==='POST'&&c.body.email==='new@creativheads.com'&&c.body.password==='longenough1'&&c.body.email_confirm===true&&c.auth==='Bearer service-key'));
  assert.equal((await DB.prepare("SELECT role FROM members WHERE email='new@creativheads.com'").first()).role,'seo_lead');
  const reset=await r2('/api/people',{cookie:admin,body:{name:'Lead',email:'lead@creativheads.com',role:'seo_lead',active:true,password:'another-pass'}});assert.equal(reset.status,200);assert.ok(calls.some(c=>c.method==='PUT'&&c.u.endsWith('/users/u-lead')&&c.body.password==='another-pass'));
  const n=calls.length;const denied=await r2('/api/people',{cookie:lead,body:{name:'X',email:'x@creativheads.com',role:'admin',password:'longenough1'}});assert.equal(denied.status,403);assert.equal(calls.length,n,'a refused save never touches logins');
  const plain=await r2('/api/people',{cookie:admin,body:{name:'Lead',email:'lead@creativheads.com',role:'seo_lead',active:true}});assert.equal(plain.status,200);assert.equal(calls.length,n,'no password, no login change');
 }finally{globalThis.fetch=prev}
});
await test('Daily autopilot really runs each step on Postgres (cron path)',async()=>{
 const {runAutopilot}=await import('../worker/autopilot.js');
 await DB.prepare("INSERT INTO clients(id,name,url,platform,data,archived,revision,created_at,updated_at) VALUES('ap1','AP Client','https://ap.example/','Other','{}',0,1,'2026-01-01','2026-01-01')").run();
 const prev=globalThis.fetch;globalThis.fetch=async(u,o)=>String(u).startsWith('https://dns.google/resolve?name=ap.example')?new Response(JSON.stringify({Answer:String(u).endsWith('type=A')?[{type:1,data:'93.184.216.34'}]:[]})):String(u).startsWith('https://ap.example')?new Response('<html><head><title>AP Client home page title here</title><meta name="description" content="A description that is long enough for the quick homepage check to accept it."></head><body><h1>Hello</h1></body></html>',{headers:{'content-type':'text/html'}}):prev(u,o);
 try{const r=await runAutopilot(env,{sendEmail:false});const c=r.clients.find(x=>x.client_id==='ap1');
  assert.ok(c.steps.length>0);for(const s of c.steps)assert.equal(s.ok,true,s.kind+': '+s.error);
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM jobs WHERE client_id='ap1' AND status='succeeded'").first()).n>0,true);
  assert.ok(await DB.prepare("SELECT 1 FROM settings WHERE key='autopilot:last'").first());
 }finally{globalThis.fetch=prev}
});
