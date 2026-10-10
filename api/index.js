// Vercel function: every request (pages and API) comes here, see vercel.json.
import worker from '../dist/server/index.js';
import {supabaseDatabase} from '../server/pg-db.js';
import {createHosted} from '../server/hosted.js';

let handler;
async function ready(){
 if(handler)return handler;
 const env={...process.env};
 env.DB=await supabaseDatabase(env.SUPABASE_DB_URL);
 handler=createHosted({worker,env});
 return handler;
}
async function handle(request){
 // vercel.json sends the original path as ?__path= (Vercel also adds ?path=); restore the real address.
 const url=new URL(request.url),path=url.searchParams.get('__path');
 if(path!==null){url.pathname=path.startsWith('/')?path:'/'+path;url.searchParams.delete('__path');const extra=url.searchParams.get('path');if(extra!==null&&'/'+extra.replace(/^\/+|\/+$/g,'')===url.pathname.replace(/\/+$/,''))url.searchParams.delete('path');request=new Request(url,request)}
 try{return await (await ready())(request)}
 catch(e){console.error(e);return new Response(JSON.stringify({error:'SEO Studio could not complete this request.'}),{status:500,headers:{'Content-Type':'application/json'}})}
}
export const GET=handle,POST=handle,PUT=handle,PATCH=handle,DELETE=handle,HEAD=handle,OPTIONS=handle;
