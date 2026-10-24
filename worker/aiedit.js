// Content editor modes: "AI Assisted" rewrites an article on instruction using the client's Brandroom (KB) brand guide;
// "Pro Editor" shows that same brand guide beside the manual editor. Nothing is saved here: the person reviews and saves.
import {insist,log} from './db.js';
import {writingContext,brandBrief} from './providers.js';
import {aiJson} from './autofix.js';

// The brand guide from Brandroom, shortened for display and for the AI prompt.
export async function brandGuide(env,client,language='English'){
 let text='';try{text=await writingContext(env,client,language)}catch{text=''}
 if(!text)text=await brandBrief(env,client);
 return{text:String(text||'').slice(0,12000),source:text?'Brandroom':'none'};
}

export async function aiEdit(env,user,client,record,{instruction,selection='',current=''}){
 insist(record.kind==='content','Choose an article to edit.');
 const d=record.data||{},body=String(current||d.body||'');
 insist(body.trim().length>40,'Write or generate the article first, then ask AI to change it.');
 insist(instruction&&instruction.length>=3,'Tell the AI what to change.');
 const guide=await brandGuide(env,client,d.language||'English'),part=String(selection||'').trim();
 const instructions=['You edit SEO articles for the brand described in brand_guide. Follow the editor\'s instruction exactly and change nothing else.',
  'Keep the brand voice, facts, product names, links and image lines ( ![alt](url) ) from the article. Never invent prices, statistics, awards or claims that are not in the article or brand guide.',
  'Keep the focus keyword natural (no stuffing). Return Markdown: ## and ### headings, paragraphs, - lists, **bold**. No # H1.',
  part?'Only rewrite the passage in "selection"; return the rewritten passage as "text" and leave "body" empty.':'Return the complete edited article as "body" and leave "text" empty.',
  'In "summary" say in one short sentence what you changed.'].join(' ');
 const out=await aiJson(env,client,'ai_edit',{instructions,max:9000,
  input:{instruction,focus_keyword:d.focus_keyword||d.keyword||'',language:d.language||'English',brand_guide:guide.text||'No brand guide in Brandroom yet: keep the current tone.',article:body.slice(0,60000),selection:part.slice(0,6000)},
  schema:{type:'object',additionalProperties:false,required:['body','text','summary'],properties:{body:{type:'string'},text:{type:'string'},summary:{type:'string'}}}});
 const result=part?String(out.text||'').trim():String(out.body||'').trim();
 insist(result.length>(part?2:40),'The AI returned an empty answer. Try a clearer instruction.',502);
 await log(env,user,'ai_edit',record.id,client.id,{instruction:instruction.slice(0,300),selection:!!part}).run();
 return{[part?'text':'body']:result,summary:String(out.summary||'').slice(0,300),brand_guide:guide.source};
}
