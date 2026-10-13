// Staff (SEO Lead) cannot change client settings or connections, and only see client activity.
import{test}from'node:test';import assert from'node:assert/strict';import{api}from'../worker/api.js';import{database}from'./helpers.mjs';
const{DB,sqlite}=database(),env={DB,CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,5).toString('base64')},origin='https://studio.example';
const ADMIN='admin@creativheads.com',LEAD='lead@creativheads.com';
async function call(path,method='GET',data,who=ADMIN){const h={'oai-authenticated-user-email':who};if(method!=='GET'){h.Origin=origin;h['Content-Type']='application/json'}const r=await api(new Request(origin+'/api/'+path,{method,headers:h,...(data?{body:JSON.stringify(data)}:{})}),env);return{status:r.status,data:await r.json().catch(()=>null)}}
await call('bootstrap');
sqlite.prepare("INSERT INTO members(id,email,name,role,active,created_at) VALUES('lead1',?,'Lead','seo_lead',1,'2026-01-01')").run(LEAD);
const client=(await call('clients','POST',{name:'Perm Client',url:'https://perm.example/',platform:'WordPress',data:{}})).data;
sqlite.prepare("INSERT INTO audit_log(id,client_id,actor,action,target,detail,created_at) VALUES('a1',NULL,?,'configure_member','x','{}','2026-01-02'),('a2',?,?,'replace_wordpress_secret',?,'{}','2026-01-03')").run(ADMIN,client.id,ADMIN,client.id);

await test('A01: SEO Lead cannot change client settings, connections or workspaces',async()=>{
 assert.equal((await call('clients/'+client.id,'PUT',{name:'Hacked',url:client.url,platform:'WordPress',data:{},revision:client.revision},LEAD)).status,403);
 assert.equal((await call('clients','POST',{name:'New',url:'https://new.example/',platform:'WordPress',data:{}},LEAD)).status,403);
 assert.equal((await call('clients/'+client.id,'DELETE',{},LEAD)).status,403);
 assert.equal((await call('connections','POST',{client_id:client.id,provider:'gsc'},LEAD)).status,403);
 assert.equal((await call('connections','POST',{client_id:client.id,action:'save_password',password:'x'},LEAD)).status,403);
 assert.equal((await call('clients/'+client.id,'GET',null,LEAD)).status,200,'viewing is still allowed');
 assert.equal((await call('clients/'+client.id,'PUT',{name:'Renamed',url:client.url,platform:'WordPress',data:{},revision:client.revision})).status,200,'admin can still edit');
});
await test('A02: SEO Lead activity has no admin or secret events and no agency-wide rows',async()=>{
 const lead=(await call('activity',undefined,null,LEAD)).data,leadClient=(await call('activity?client_id='+client.id,undefined,null,LEAD)).data;
 for(const rows of [lead,leadClient]){assert.ok(rows.every(r=>r.client_id&&r.action!=='configure_member'&&!/secret/.test(r.action)),JSON.stringify(rows.map(r=>r.action)))}
 assert.ok(lead.some(r=>r.action==='create_client'),'normal client activity is kept');
 const adm=(await call('activity')).data;assert.ok(adm.some(r=>r.action==='configure_member')&&adm.some(r=>r.action==='replace_wordpress_secret'),'admins still see everything');
});
