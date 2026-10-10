// Online version: Postgres (Supabase) database layer and the sign-in front door.
import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{translate,pgliteDatabase}from'../server/pg-db.js';import{createHosted}from'../server/hosted.js';import worker from'../worker/index.js';

const origin='https://studio.example',KEY=Buffer.alloc(32,9).toString('base64');
const DB=await pgliteDatabase(fs.readFileSync('supabase/schema.sql','utf8'));
await DB.prepare("INSERT INTO members(id,email,name,role,active,created_at) VALUES('m1','admin@creativheads.com','Admin','admin',1,'2026-01-01'),('m2','lead@creativheads.com','Lead','seo_lead',1,'2026-01-01'),('m3','gone@creativheads.com','Gone','staff',0,'2026-01-01')").run();
const env={DB,CREDENTIAL_ENCRYPTION_KEY:KEY,SUPABASE_URL:'https://proj.supabase.co',SUPABASE_ANON_KEY:'anon'};
const tokens={'tok-admin':'admin@creativheads.com','tok-lead':'Lead@CreativHeads.com','tok-gone':'gone@creativheads.com','tok-stranger':'someone@gmail.com'};
const sent=[];const realFetch=globalThis.fetch;
globalThis.fetch=async(u,o={})=>{u=String(u);if(u.startsWith(env.SUPABASE_URL+'/auth/v1/user')){const t=String(o.headers?.Authorization||'').replace('Bearer ','');return tokens[t]?new Response(JSON.stringify({email:tokens[t]})):new Response('{}',{status:401})}if(u.startsWith(env.SUPABASE_URL+'/auth/v1/otp')){sent.push(JSON.parse(o.body).email);return new Response('{}')}return realFetch(u,o)};
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
await test('Email links are only sent to active team members',async()=>{
 const r1=await req('/auth/email',{method:'POST',body:{email:'lead@creativheads.com'}}),r2=await req('/auth/email',{method:'POST',body:{email:'someone@gmail.com'}});
 assert.equal(r1.status,200);assert.equal(r2.status,200);assert.equal((await r1.json()).message,(await r2.json()).message);assert.deepEqual(sent,['lead@creativheads.com']);
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
