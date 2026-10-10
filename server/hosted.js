// Online (Vercel + Supabase) front door for SEO Studio.
// - Sign-in with Supabase Auth (Google, or an email link). Only active team members get in.
// - Keeps a signed, HttpOnly session cookie and passes the verified email to the worker.
// - Never trusts identity headers sent by the browser.
import {createHmac,timingSafeEqual} from 'node:crypto';

const COOKIE='studio_session',DAYS=7;
const b64=s=>Buffer.from(s).toString('base64url');
const html=(body,status=200,headers={})=>new Response(body,{status,headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY',...headers}});
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeReturn=v=>{const s=String(v||'/');return s.startsWith('/')&&!s.startsWith('//')&&!s.startsWith('/\\')?s:'/'};

export function createHosted({worker,env}){
 const secret=createHmac('sha256',String(env.CREDENTIAL_ENCRYPTION_KEY||'')).update('studio-session-v1').digest();
 const sign=v=>createHmac('sha256',secret).update(v).digest('base64url');
 const supa=String(env.SUPABASE_URL||'').replace(/\/$/,''),anon=String(env.SUPABASE_ANON_KEY||'');
 const secure=env.VERCEL?'; Secure':'';
 const sessionCookie=email=>{const v=b64(JSON.stringify({e:email,x:Date.now()+DAYS*864e5}));return `${COOKIE}=${v}.${sign(v)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DAYS*86400}${secure}`};
 const clearCookie=`${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
 function readSession(request){
  const raw=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='));if(!raw)return null;
  const [v,sig]=raw.slice(COOKIE.length+1).split('.');if(!v||!sig)return null;const want=sign(v);
  if(sig.length!==want.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(want)))return null;
  try{const s=JSON.parse(Buffer.from(v,'base64url').toString());return s.x>Date.now()&&s.e?s.e:null}catch{return null}
 }
 const member=async email=>env.DB.prepare('SELECT id,email,active FROM members WHERE email=?').bind(email).first();

 const page=(title,inner,script='')=>html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · SEO Studio</title><link rel="icon" href="/favicon.svg"><style>
:root{--ink:#16182b;--mut:#5b6078;--line:#e3e5ef;--pri:#4648d4;--bg:#f6f7fb;--card:#fff}
@media (prefers-color-scheme:dark){:root{--ink:#eceefe;--mut:#a3a8c3;--line:#2b2f45;--bg:#0f1120;--card:#171a2e}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:15px/1.5 "Segoe UI",Inter,system-ui,sans-serif;padding:16px}
.card{width:100%;max-width:400px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px}
.logo{display:flex;gap:10px;align-items:center;font-weight:700;margin-bottom:18px}.logo i{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#4648d4,#8b5cf6)}
h1{font-size:21px;margin:0 0 6px}p{color:var(--mut);margin:0 0 18px}
.btn{display:flex;justify-content:center;align-items:center;gap:8px;width:100%;padding:11px 14px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:600 15px inherit;text-decoration:none;cursor:pointer}
.btn.pri{background:var(--pri);border-color:var(--pri);color:#fff}
.or{display:flex;align-items:center;gap:10px;color:var(--mut);font-size:13px;margin:16px 0}.or:before,.or:after{content:"";flex:1;height:1px;background:var(--line)}
input{width:100%;padding:11px 12px;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--ink);font:inherit;margin-bottom:10px}
.msg{margin-top:12px;font-size:14px;color:var(--mut)}.err{color:#d6454a}
</style></head><body><main class="card"><div class="logo"><i></i>SEO Studio</div>${inner}</main>${script?`<script>${script}</script>`:''}</body></html>`);

 function loginPage(url,error=''){
  const ret=safeReturn(url.searchParams.get('return_to'));
  const cb=`${url.origin}/auth/callback?return_to=${encodeURIComponent(ret)}`;
  const google=`${supa}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(cb)}`;
  return page('Sign in',`<h1>Sign in</h1><p>Use the account your Admin added to SEO Studio.</p>
<a class="btn pri" href="${esc(google)}">Continue with Google</a>
<div class="or">or get a sign-in link by email</div>
<form id="f"><input type="email" name="email" placeholder="you@company.com" required autocomplete="email"><button class="btn" type="submit">Email me a link</button></form>
<div class="msg ${error?'err':''}" id="m">${esc(error)}</div>`,
`document.getElementById('f').onsubmit=async e=>{e.preventDefault();const m=document.getElementById('m');m.className='msg';m.textContent='Sending…';try{const r=await fetch('/auth/email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e.target.email.value,return_to:${JSON.stringify(ret)}})});const d=await r.json();m.textContent=d.message||d.error;if(!r.ok)m.className='msg err'}catch{m.className='msg err';m.textContent='Could not send. Try again.'}}`);
 }

 async function verifyToken(token){
  const r=await fetch(`${supa}/auth/v1/user`,{headers:{apikey:anon,Authorization:'Bearer '+token}});
  if(!r.ok)return null;const u=await r.json();return u?.email?String(u.email).trim().toLowerCase():null;
 }

 return async function handle(request){
  const url=new URL(request.url),p=url.pathname;
  if(!supa||!anon||!env.CREDENTIAL_ENCRYPTION_KEY)return html('<h1>SEO Studio is not configured</h1><p>Set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_DB_URL and CREDENTIAL_ENCRYPTION_KEY in Vercel.</p>',500);

  if(p==='/login'||p==='/signin-with-chatgpt')return loginPage(url,url.searchParams.get('error')||'');
  if(p==='/logout'||p==='/signout-with-chatgpt')return new Response(null,{status:302,headers:{Location:'/login','Set-Cookie':clearCookie,'Cache-Control':'no-store'}});
  if(p==='/auth/callback'){
   // Supabase returns the sign-in token in the address fragment, which only the browser can read.
   return page('Signing in','<h1>Signing you in…</h1><p id="m">One moment.</p>',
`(async()=>{const h=new URLSearchParams(location.hash.slice(1)),q=new URLSearchParams(location.search),m=document.getElementById('m');history.replaceState(null,'',location.pathname);const t=h.get('access_token');if(!t){m.textContent=h.get('error_description')||q.get('error_description')||'Sign-in was cancelled.';m.className='err';return}const r=await fetch('/auth/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({access_token:t})});const d=await r.json().catch(()=>({}));if(r.ok)location.replace(q.get('return_to')&&q.get('return_to').startsWith('/')&&!q.get('return_to').startsWith('//')?q.get('return_to'):'/');else{m.className='err';m.innerHTML='';m.append(d.error||'Sign-in failed.');const a=document.createElement('a');a.href='/login';a.textContent=' Back to sign in';m.append(a)}})()`);
  }
  if(p==='/auth/session'&&request.method==='POST'){
   if(request.headers.get('origin')!==url.origin)return json({error:'Same-origin request required.'},403);
   let body;try{body=await request.json()}catch{return json({error:'Invalid request.'},400)}
   const email=await verifyToken(String(body.access_token||''));if(!email)return json({error:'Sign-in could not be verified. Try again.'},401);
   const m=await member(email);if(!m||!m.active)return json({error:`${email} is not on the SEO Studio team. Ask your Admin to add this email.`},403);
   return json({ok:true},200,{'Set-Cookie':sessionCookie(email)});
  }
  if(p==='/auth/email'&&request.method==='POST'){
   if(request.headers.get('origin')!==url.origin)return json({error:'Same-origin request required.'},403);
   let body;try{body=await request.json()}catch{return json({error:'Invalid request.'},400)}
   const email=String(body.email||'').trim().toLowerCase(),done={message:'If this email is on the SEO Studio team, a sign-in link is on its way. Check your inbox.'};
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:'Enter a valid email.'},400);
   const m=await member(email);if(!m||!m.active)return json(done);
   const cb=`${url.origin}/auth/callback?return_to=${encodeURIComponent(safeReturn(body.return_to))}`;
   const r=await fetch(`${supa}/auth/v1/otp?redirect_to=${encodeURIComponent(cb)}`,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email,create_user:true})});
   if(!r.ok)return json({error:'The email could not be sent right now. Use Continue with Google, or try again later.'},502);
   return json(done);
  }

  // Everything else goes to SEO Studio with the verified email only.
  const headers=new Headers(request.headers);
  for(const k of [...headers.keys()])if(k.startsWith('oai-authenticated-'))headers.delete(k);
  const email=readSession(request);
  if(email)headers.set('oai-authenticated-user-email',email);
  else if(!p.startsWith('/api/')&&!p.startsWith('/oauth/')&&!/\.(css|js|svg|zip|png|ico)$/.test(p)&&request.method==='GET')
   return new Response(null,{status:302,headers:{Location:'/login?return_to='+encodeURIComponent(p+url.search),'Cache-Control':'no-store'}});
  const init={method:request.method,headers};if(!['GET','HEAD'].includes(request.method)){init.body=await request.arrayBuffer()}
  return worker.fetch(new Request(url,init),env,{waitUntil(){},passThroughOnException(){}});
 };
}
