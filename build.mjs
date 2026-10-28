import fs from 'node:fs';import vm from 'node:vm';import {execFileSync} from 'node:child_process';
const routes={all_client_overview:'all-clients',client_dashboard:'client-dashboard',client_setup_connections:'client-setup',keyword_research:'keyword-research',site_audit:'site-audit',fixes_and_approvals:'fixes-and-approvals',developer_tickets:'developer-tickets',content_studio:'content-studio',aeo_visibility_suite:'aeo-visibility',schema_generator_validator:'schema-generator',monthly_plan_content_refresh:'monthly-plan',reports_assistant_administration:'reports-admin'};
const aliases={'reports-and-admin':'reports-admin','reports-assistant-administration':'reports-admin','client-setup-connections':'client-setup','client-settings':'client-setup','settings':'client-setup'};
fs.mkdirSync('configs',{recursive:true});
for(const [name,route]of Object.entries(routes)){
 let html=fs.readFileSync(`reference/${name}.html`,'utf8');const ctx={tailwind:{}};const match=html.match(/<script id="tailwind-config">([\s\S]*?)<\/script>/);vm.runInNewContext(match[1],ctx);
 const config={...ctx.tailwind.config,content:[`./reference/${name}.html`]};fs.writeFileSync(`configs/${route}.cjs`,'module.exports='+JSON.stringify(config)+';');
 html=html.replace(/<script src="https:\/\/cdn.tailwindcss.com"><\/script>/,'').replace(match[0],`<link rel="stylesheet" href="/${route}.css"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="icon" type="image/png" href="/favicon.png"><script src="/navigation.js" defer></script>`);
 html=html.replace(/<a\b[^>]*\bdata-path="([^"]+)"[^>]*>/g,(tag,path)=>tag.replace(/href="[^"]*"/,`href="/${aliases[path]||path}/"`));
 if(!html.includes('<title>'))html=html.replace('</head>',`<title>Climb · ${route.replaceAll('-',' ')}</title></head>`);
 fs.mkdirSync(`dist/${route}`,{recursive:true});fs.writeFileSync(`dist/${route}/index.html`,html);if(route==='client-dashboard')fs.writeFileSync('dist/index.html',html);
 // execFileSync(process.execPath,['node_modules/tailwindcss/lib/cli.js','-c',`configs/${route}.cjs`,'-i','input.css','-o',`dist/${route}.css`,'--minify'],{stdio:'pipe'});
}
console.log('Restored all 12 original Stitch screens; compiled their individual theme configurations.');
