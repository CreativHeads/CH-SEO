// Per-member section access (none / view / edit) and monthly limits on paid actions.
// Stored in settings as access:<member id>. Admins always have full access.
import {one,rows,run,insist,now} from './db.js';

export const SECTIONS={
  keywords:{label:'Keywords',kinds:['keywords'],jobs:['keyword_research','import_gsc_queries','rank_check','propose_keyword_fixes','create_landing_page','create_blog']},
  audit:{label:'Site Audit',kinds:['issues','audits'],jobs:['quick_audit','full_audit','poll_audit','pagespeed']},
  fixes:{label:'Fixes',kinds:['fixes'],jobs:['propose_fixes','apply_fix','rollback_fix']},
  tickets:{label:'Dev Tickets',kinds:['tickets'],jobs:[]},
  content:{label:'Content & Plan',kinds:['content','plans','refresh'],jobs:['generate_draft','push_content']},
  aeo:{label:'AI Visibility',kinds:['questions','aeo'],jobs:['aeo_check']},
  schema:{label:'Schema',kinds:['schemas'],jobs:['prepare_schema']},
  reports:{label:'Reports',kinds:['reports'],jobs:['ask']}
};
export const LIMITS={ai_drafts:{label:'AI article drafts',job:'generate_draft'},ai_fixes:{label:'AI fix runs',job:'propose_fixes'},keyword_research:{label:'Keyword research searches',job:'keyword_research'},aeo_checks:{label:'AI visibility checks',job:'aeo_check'},full_crawls:{label:'Full site crawls',job:'full_audit'},ai_questions:{label:'Ask Studio AI questions',job:'ask'}};
const LEVEL={none:0,view:1,edit:2};

const defaults=role=>Object.fromEntries(Object.keys(SECTIONS).map(k=>[k,role==='staff'?'view':'edit']));
export async function accessFor(env,member){
  const row=await one(env,'SELECT value FROM settings WHERE key=?','access:'+member.id),saved=row?JSON.parse(row.value):{};
  const sections={...defaults(member.role),...(saved.sections||{})},limits={};
  for(const k of Object.keys(LIMITS))limits[k]=Number(saved.limits?.[k])>0?Number(saved.limits[k]):0;
  if(member.role==='admin')for(const k of Object.keys(sections))sections[k]='edit';
  return{sections,limits,updated_at:saved.updated_at||null,updated_by:saved.updated_by||null};
}
export const sectionOfKind=kind=>Object.keys(SECTIONS).find(k=>SECTIONS[k].kinds.includes(kind))||null;
export const sectionOfJob=job=>Object.keys(SECTIONS).find(k=>SECTIONS[k].jobs.includes(job))||null;
export async function requireSection(env,user,section,level){
  if(!section||user.role==='admin')return;
  const a=await accessFor(env,user);
  insist(LEVEL[a.sections[section]]>=LEVEL[level],`You do not have ${level==='edit'?'edit':'view'} access to ${SECTIONS[section].label}. Ask an Admin to change your access.`,403);
}
export async function hiddenKinds(env,user){
  if(user.role==='admin')return[];
  const a=await accessFor(env,user);
  return Object.entries(a.sections).filter(([,v])=>v==='none').flatMap(([k])=>SECTIONS[k].kinds);
}
const monthStart=()=>{const m=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit'}).format(new Date());return m+'-01'};
export async function usageFor(env,member){
  const counts=Object.fromEntries((await rows(env,"SELECT kind,COUNT(*) n FROM jobs WHERE actor=? AND created_at>=? AND status IN ('queued','running','succeeded') GROUP BY kind",member.email,monthStart())).map(r=>[r.kind,Number(r.n)]));
  counts.propose_fixes=(counts.propose_fixes||0)+(counts.propose_keyword_fixes||0);counts.generate_draft=(counts.generate_draft||0)+(counts.create_landing_page||0)+(counts.create_blog||0);
  return Object.fromEntries(Object.entries(LIMITS).map(([k,v])=>[k,counts[v.job]||0]));
}
export async function checkLimit(env,user,job){
  if(user.role==='admin')return;
  const mapped=job==='propose_keyword_fixes'?'propose_fixes':['create_landing_page','create_blog'].includes(job)?'generate_draft':job;
  const key=Object.keys(LIMITS).find(k=>LIMITS[k].job===mapped);if(!key)return;
  const a=await accessFor(env,user);if(!a.limits[key])return;
  const used=(await usageFor(env,user))[key];
  insist(used<a.limits[key],`Monthly limit reached: ${LIMITS[key].label} (${used} of ${a.limits[key]}). Ask an Admin to raise your limit.`,429);
}
export async function saveAccess(env,admin,member,body){
  insist(member,'Team member not found.',404);
  insist(member.role!=='admin','Admins always have full access.',409);
  const sections={},limits={};
  for(const k of Object.keys(SECTIONS)){const v=body.sections?.[k];sections[k]=['none','view','edit'].includes(v)?v:defaults(member.role)[k]}
  for(const k of Object.keys(LIMITS)){const n=Math.floor(Number(body.limits?.[k]||0));insist(n>=0&&n<=10000,'Limits must be between 0 and 10,000.');limits[k]=n}
  const value=JSON.stringify({sections,limits,updated_at:now(),updated_by:admin.email});
  await run(env,'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','access:'+member.id,value);
  return accessFor(env,member);
}
