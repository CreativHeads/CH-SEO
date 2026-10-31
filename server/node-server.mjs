// Plain Node.js server for a VPS (behind Caddy for HTTPS). Same app as the Vercel function in api/index.js.
// Also runs the daily autopilot at 01:30 UTC (07:00 IST), the job Vercel Cron does on Vercel.
import http from 'node:http';
import {GET as handle} from '../api/index.js';

const PORT=Number(process.env.PORT||3000),APP_URL=String(process.env.APP_URL||'').replace(/\/$/,'');

const server=http.createServer(async(req,res)=>{
 try{
  // Caddy terminates HTTPS and forwards the original host and scheme.
  const proto=String(req.headers['x-forwarded-proto']||'http').split(',')[0].trim(),host=String(req.headers['x-forwarded-host']||req.headers.host||'localhost').split(',')[0].trim();
  const chunks=[];for await(const c of req)chunks.push(c);
  const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(', '):String(v));
  const body=chunks.length&&!['GET','HEAD'].includes(req.method)?Buffer.concat(chunks):undefined;
  const response=await handle(new Request(proto+'://'+host+req.url,{method:req.method,headers,body}));
  const out={};response.headers.forEach((v,k)=>{if(k!=='set-cookie')out[k]=v});
  const cookies=response.headers.getSetCookie?.()||[];if(cookies.length)out['set-cookie']=cookies;
  res.writeHead(response.status,out);
  res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error(e);if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Climb could not complete this request.'}))}
});
server.requestTimeout=310000;server.headersTimeout=320000;
server.listen(PORT,()=>console.log('Climb is listening on port '+PORT));

// Daily autopilot at 01:30 UTC.
function scheduleDaily(){
 const secret=String(process.env.CRON_SECRET||'');if(secret.length<16||!APP_URL){console.log('Daily autopilot is off: set CRON_SECRET (16+ characters) and APP_URL.');return}
 const next=new Date();next.setUTCHours(1,30,0,0);if(next<=new Date())next.setUTCDate(next.getUTCDate()+1);
 setTimeout(async()=>{
  try{const r=await handle(new Request(APP_URL+'/api/cron/daily',{headers:{authorization:'Bearer '+secret}}));console.log(new Date().toISOString(),'daily autopilot:',r.status,(await r.text()).slice(0,300))}
  catch(e){console.error(new Date().toISOString(),'daily autopilot failed:',e.message)}
  scheduleDaily();
 },next-Date.now());
 console.log('Next daily autopilot: '+next.toISOString());
}
scheduleDaily();
