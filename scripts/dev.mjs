// Loopback-only local development. User switching is a role-testing feature, not production login.
import http from 'node:http';
import fs from 'node:fs';
import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {execFile} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import worker from '../dist/server/index.js';
if(fs.existsSync('.env'))process.loadEnvFile('.env');
fs.mkdirSync('.local',{recursive:true,mode:0o700});
const sqlite=new DatabaseSync('.local/studio.sqlite');
sqlite.exec('PRAGMA foreign_keys=ON');
const keyPath='.local/encryption.key';
if(!process.env.CREDENTIAL_ENCRYPTION_KEY){
 if(!fs.existsSync(keyPath)){
  const tables=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);
  const hasSaved=(tables.includes('settings')&&sqlite.prepare("SELECT COUNT(*) n FROM settings WHERE key LIKE 'integration:%'").get().n)||(tables.includes('client_secrets')&&sqlite.prepare('SELECT COUNT(*) n FROM client_secrets').get().n);
  if(hasSaved)throw Error('Restore .local/encryption.key before starting: saved encrypted credentials already exist.');
  fs.writeFileSync(keyPath,randomBytes(32).toString('base64'),{mode:0o600,flag:'wx'});
 }
 process.env.CREDENTIAL_ENCRYPTION_KEY=fs.readFileSync(keyPath,'utf8').trim();
}
sqlite.exec('CREATE TABLE IF NOT EXISTS _local_migrations(name TEXT PRIMARY KEY)');
for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort()){
 if(sqlite.prepare('SELECT name FROM _local_migrations WHERE name=?').get(name))continue;
 sqlite.exec(fs.readFileSync('drizzle/'+name,'utf8'));
 sqlite.prepare('INSERT INTO _local_migrations(name) VALUES(?)').run(name);
}
const DB={prepare(sql){const statement=(args=[])=>({bind(...a){return statement(a)},async run(){const r=sqlite.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)},success:true}},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return{results:sqlite.prepare(sql).all(...args)}}});return statement()},async batch(stmts){sqlite.exec('BEGIN');try{const result=[];for(const stmt of stmts)result.push(await stmt.run());sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}}};
const env={...process.env,DB,LOCAL_DEV:true};
const sign=value=>createHmac('sha256',env.CREDENTIAL_ENCRYPTION_KEY).update(value).digest('base64url');
const json=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data))};
const origin='http://127.0.0.1:8000';
const server=http.createServer(async(req,res)=>{try{
 if(req.headers.host!=='127.0.0.1:8000')return json(res,403,{error:'Use http://127.0.0.1:8000'});
 let body='';for await(const chunk of req){body+=chunk;if(body.length>220000)return json(res,413,{error:'Request too large'})}
 const url=new URL(req.url,origin);
 if(!sqlite.prepare('SELECT id FROM members').get()){sqlite.exec(`INSERT INTO members(id,email,name,role,active,created_at) VALUES('local-owner','${env.ADMIN_EMAIL||'admin@creativheads.com'}','Admin','admin',1,'${new Date().toISOString()}')`)}
 if(url.pathname==='/local/session'){
  if(req.method==='GET')return json(res,200,{people:sqlite.prepare('SELECT id,name,email,role FROM members WHERE active=1 ORDER BY name').all()});
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  if(req.headers.origin!==origin||!req.headers['content-type']?.includes('application/json'))return json(res,403,{error:'A same-origin JSON request is required.'});
  let input;try{input=JSON.parse(body)}catch{return json(res,400,{error:'Invalid JSON'})}
  const devPass=String(process.env.DEV_PASSWORD||'');if(devPass.length<10)return json(res,403,{error:'Set DEV_PASSWORD (at least 10 characters) in .env to switch local users.'});const given=Buffer.from(String(input.password||'')),want=Buffer.from(devPass);if(given.length!==want.length||!timingSafeEqual(given,want))return json(res,401,{error:'Incorrect local developer password.'});
  const member=sqlite.prepare('SELECT id FROM members WHERE id=? AND active=1').get(String(input.id||''));
  if(!member)return json(res,404,{error:'Choose an active saved member.'});
  const value=Buffer.from(member.id).toString('base64url');return json(res,200,{switched:true},{'Set-Cookie':`studio_local_user=${value}.${sign(value)}; HttpOnly; SameSite=Strict; Path=/`});
 }
 let email,uid;
 const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('studio_local_user='));
 if(cookie){const [value,signature]=cookie.slice('studio_local_user='.length).split('.');const expected=sign(value||'');if(!signature||signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return json(res,401,{error:'Invalid local session. Clear the local website cookie and reopen.'});const member=sqlite.prepare('SELECT id,email FROM members WHERE id=? AND active=1').get(Buffer.from(value,'base64url').toString());if(!member)return json(res,401,{error:'This local member is inactive. Clear the local website cookie to return to the owner.'});email=member.email;uid=member.id}
 const headers=new Headers(req.headers);if(uid)headers.set('oai-authenticated-user-id',uid);if(email)headers.set('oai-authenticated-user-email',email);
 const response=await worker.fetch(new Request(url,{method:req.method,headers,...(req.method!=='GET'&&req.method!=='HEAD'?{body}:{})}),env,{});
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch{json(res,500,{error:'The local server could not complete this request.'})}});
server.listen(8000,'127.0.0.1',()=>{console.log('SEO Studio is ready: http://127.0.0.1:8000\nKeep this window open. Press Ctrl+C to stop.');if(process.env.STUDIO_OPEN_BROWSER==='1'&&process.platform==='win32')execFile('cmd.exe',['/c','start','','http://127.0.0.1:8000']);});
