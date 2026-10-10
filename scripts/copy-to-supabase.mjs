// Copies everything from this PC's database (.local/studio.sqlite) into Supabase.
// Usage:  set SUPABASE_DB_URL in .env, then run:  npm run copy-to-supabase
// Rows that already exist in Supabase are kept as they are (nothing is overwritten or deleted).
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';

export const TABLES=['members','settings','clients','client_secrets','connections','records','record_history','jobs','usage_log','audit_log'];
const KEYS={settings:'key',client_secrets:'client_id'};

export async function copyAll(sqlite,DB,report=()=>{}){
 const totals={};
 for(const table of TABLES){
  const rows=sqlite.prepare(`SELECT * FROM ${table}`).all();totals[table]={found:rows.length,added:0};
  if(!rows.length){report(table,0,0);continue}
  const cols=Object.keys(rows[0]);
  for(let i=0;i<rows.length;i+=50){
   const chunk=rows.slice(i,i+50),args=[],values=[];
   for(const r of chunk){values.push('('+cols.map(()=>'?').join(',')+')');for(const c of cols)args.push(r[c]===undefined?null:r[c])}
   const res=await DB.prepare(`INSERT INTO ${table}(${cols.join(',')}) VALUES ${values.join(',')} ON CONFLICT (${KEYS[table]||'id'}) DO NOTHING`).bind(...args).run();
   totals[table].added+=res.meta.changes;
  }
  report(table,totals[table].found,totals[table].added);
 }
 return totals;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(fs.existsSync('.env'))process.loadEnvFile('.env');
 const url=process.env.SUPABASE_DB_URL;
 if(!url){console.error('Add SUPABASE_DB_URL (Supabase -> Connect -> Session pooler connection string) to .env first.');process.exit(1)}
 const {supabaseDatabase}=await import('../server/pg-db.js');
 const DB=await supabaseDatabase(url);
 const sqlite=new DatabaseSync('.local/studio.sqlite',{readOnly:true});
 console.log('Copying this PC\'s SEO Studio data into Supabase...');
 await copyAll(sqlite,DB,(t,found,added)=>console.log(`  ${t.padEnd(15)} ${String(found).padStart(5)} found, ${String(added).padStart(5)} added`));
 console.log('Done. Use the same CREDENTIAL_ENCRYPTION_KEY in Vercel so saved API keys keep working.');
 process.exit(0);
}
