// Postgres (Supabase) database with the same small interface the worker code uses:
// DB.prepare(sql).bind(...args).all()/first()/run() and DB.batch([...]).
// The worker SQL is written for SQLite, so a few SQLite-only forms are translated here.

const JX=/json_extract\(\s*([a-z_]+)\s*,\s*'\$\.([a-z0-9_.]+)'\s*\)/gi;
const path=p=>`'{${p.split('.').join(',')}}'`;
const ALIAS_AFTER=/^\s+(?!and\b|or\b|is\b|in\b|as\b|not\b|from\b|where\b|group\b|order\b|limit\b|desc\b|asc\b)[a-z_]+\s*(,|from\b)/i;

export function translate(sql){
 let s=sql;
 // Numbers stored inside JSON (booleans count as 1/0, like SQLite).
 s=s.replace(/CAST\(\s*json_extract\(\s*([a-z_]+)\s*,\s*'\$\.([a-z0-9_.]+)'\s*\)\s+AS\s+(INTEGER|REAL)\s*\)/gi,(m,col,p)=>{const j=`(${col}::jsonb #> ${path(p)})`;return `(CASE WHEN jsonb_typeof(${j})='boolean' THEN (CASE WHEN ${j}='true'::jsonb THEN 1 ELSE 0 END) ELSE NULLIF(${j} #>> '{}','')::double precision END)`});
 // json_extract(x)=1 also matches JSON true.
 s=s.replace(/json_extract\(\s*([a-z_]+)\s*,\s*'\$\.([a-z0-9_.]+)'\s*\)\s*=\s*1\b/gi,(m,col,p)=>`(${col}::jsonb #>> ${path(p)}) IN ('1','true')`);
 // Selected values keep their JSON type (numbers stay numbers); comparisons use text.
 s=s.replace(JX,(m,col,p,offset,all)=>{const before=all.slice(Math.max(0,offset-9),offset),after=all.slice(offset+m.length);const selected=ALIAS_AFTER.test(after)&&!/COALESCE\($/i.test(before);return selected?`(${col}::jsonb #> ${path(p)})`:`(${col}::jsonb #>> ${path(p)})`});
 s=s.replace(/INSERT OR IGNORE INTO([\s\S]*)$/i,(m,rest)=>`INSERT INTO${rest.replace(/;\s*$/,'')} ON CONFLICT DO NOTHING`);
 s=s.replace(/\sLIKE\s/g,' ILIKE ');
 // ? placeholders -> $1, $2 ... (outside quoted strings)
 let n=0,out='',quoted=false;for(const ch of s){if(ch==="'")quoted=!quoted;out+=ch==='?'&&!quoted?'$'+(++n):ch}
 return out;
}

const tidy=row=>{if(!row)return row;for(const k in row){const v=row[k];if(typeof v==='bigint')row[k]=Number(v)}return row};

// exec(text, params) => {rows, count}; transaction(fn) runs fn(exec) atomically.
export function pgDatabase({exec,transaction}){
 const statement=(sql,args=[],run=exec)=>({
  sql,args,
  bind(...a){return statement(sql,a,run)},
  async all(){const r=await run(translate(sql),args);return{results:r.rows.map(tidy),success:true}},
  async first(){const r=await run(translate(sql),args);return tidy(r.rows[0])||null},
  async run(){const r=await run(translate(sql),args);return{meta:{changes:r.count},success:true}}
 });
 return{
  prepare(sql){return statement(sql)},
  // SQLite's changes() = rows changed by the previous statement in this batch.
  async batch(stmts){return transaction(async tx=>{const out=[];let last=0;for(const s of stmts){const r=await statement(s.sql.replace(/changes\(\)/g,String(last)),s.args,tx).run();last=r.meta.changes;out.push(r)}return out})},
  async exec(sql){return exec(sql,[])}
 };
}

// Production: Supabase Postgres through the postgres.js driver.
export async function supabaseDatabase(url){
 const {default:postgres}=await import('postgres');
 const num={to:20,from:[20,1700],serialize:String,parse:Number};
 const sql=postgres(url,{prepare:false,onnotice:()=>{},max:3,idle_timeout:20,connect_timeout:15,ssl:url.includes('localhost')?false:'require',types:{num}});
 const wrap=client=>async(text,params)=>{const rows=await client.unsafe(text,params);return{rows:[...rows],count:rows.count??rows.length}};
 return Object.assign(pgDatabase({exec:wrap(sql),transaction:fn=>sql.begin(tx=>fn(wrap(tx)))}),{end:()=>sql.end()});
}

// Tests and the data copy check: in-memory Postgres (PGlite).
export async function pgliteDatabase(schemaSql){
 const {PGlite}=await import('@electric-sql/pglite');
 const db=new PGlite({parsers:{20:Number,1700:Number}});
 if(schemaSql)await db.exec(schemaSql);
 const wrap=client=>async(text,params)=>{const r=await client.query(text,params);return{rows:r.rows,count:r.affectedRows??r.rows.length}};
 return Object.assign(pgDatabase({exec:wrap(db),transaction:fn=>db.transaction(tx=>fn(wrap(tx)))}),{pglite:db});
}
