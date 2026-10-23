import {test} from 'node:test';
import assert from 'node:assert/strict';
import {keywordMatchesServices,competingPages} from '../worker/providers.js';
import {quality,pageKind,shapeBlogFields,scheduleSlots,blogPhoto,pickBlogMedia,placeBlogImages,placeBlogFaq,ensureBlogInternalLinks,articleScenes} from '../worker/validation.js';
import {reportWindow,reportSpotlight} from '../worker/report-data.js';

const services='digital marketing courses, SEO training, Google Ads, content writing';
const place='Kochi, Kerala';

test('service and place keywords match a digital marketing institute',()=>{
  for(const keyword of ['digital marketing institute in kerala','digital marketing course kochi','seo training in kochi','google ads course kerala','content writing course'])
    assert.equal(keywordMatchesServices(keyword,services,place),true,keyword);
});

test('place-only and unrelated competitor keywords do not match',()=>{
  for(const keyword of ['hospital administration courses','x ray search','ibis academy','professional network platform','professional networking platform','free ai tools','content creation','digital media academy','institutes in kerala','zeed academy','dotin academy','zuan education','zeon academy','airport course','hospital management course','diploma of airport management'])
    assert.equal(keywordMatchesServices(keyword,services,place),false,keyword);
});

test('a city name alone is not a service match',()=>{
  assert.equal(keywordMatchesServices('kochi','kochi, kerala','Kochi, Kerala'),false);
  assert.equal(keywordMatchesServices('best institute in kerala',services,place),false);
});

test('competing pages keep the dedicated page when the homepage ranks higher',()=>{
  const found=competingPages('digital marketing course in kottakkal',[
    {url:'https://level8.in/digital-marketing-course-in-kottakkal/',clicks:1,impressions:20,position:27},
    {url:'https://level8.in/',clicks:0,impressions:25,position:1.9}
  ]);
  assert.equal(found.homepageWinning,true);
  assert.equal(found.primary.url,'https://level8.in/digital-marketing-course-in-kottakkal/');
  assert.equal(found.ranking.url,'https://level8.in/');
});

test('root articles are blogs and course URLs stay landing pages',()=>{
  assert.equal(pageKind('/how-seo-works'),'blog');
  assert.equal(pageKind('/digital-marketing-vs-content-writing'),'blog');
  assert.equal(pageKind('/blog/'),'blog');
  assert.equal(pageKind('/contact'),'landing');
  assert.equal(pageKind('/digital-marketing-course-in-kottakkal'),'landing');
  assert.equal(pageKind('/'),'landing');
});

test('blog meta keeps the focus keyword inside the length limits',()=>{
  const shaped=shapeBlogFields({meta_title:'A very long title about an seo course that keeps going past the sixty character limit for search results',meta_description:'x'.repeat(220),slug:'a-different-long-slug-that-does-not-start-with-the-keyword',tags:['one','two','three','four','five','six'],categories:['Learn','Courses','Students','Extra'],cta:'Talk today'},'seo course');
  assert.ok(shaped.meta_title.length<=60,shaped.meta_title);
  assert.ok(shaped.meta_title.toLowerCase().includes('seo course'));
  assert.ok(shaped.meta_description.length<=160);
  assert.ok(shaped.meta_description.toLowerCase().includes('seo course'));
  assert.ok(shaped.slug.length<=75&&shaped.slug.includes('seo-course'));
  assert.equal(shaped.tags.split(',').filter(Boolean).length,5);
  assert.equal(shaped.categories.split(',').filter(Boolean).length,3);
});

test('blog generation restores required internal links when the model omits them',()=>{
  const body=ensureBlogInternalLinks('# Guide\n\nIntro paragraph.\n\n## What should you learn?\n\nHelpful advice.\n\n## FAQs\n\nQ1. What is this?\n\nA. It is a guide.\n',{brand:'Level8',home:'https://level8.in/',contact:'https://level8.in/contact/',blogs:['https://level8.in/instagram-reels-and-youtube-shorts-marketing-best-practices-for-kerala-uae-markets/','https://level8.in/blog/seo-guide/'],landings:['https://level8.in/digital-marketing-course-in-kottakkal/']});
  assert.match(body,/\[Level8\]\(https:\/\/level8\.in\/\)/);
  assert.match(body,/\[related guide\]\(https:\/\/level8\.in\/instagram-reels-and-youtube-shorts-marketing-best-practices-for-kerala-uae-markets\/\)/);
  assert.match(body,/\[digital marketing course\]\(https:\/\/level8\.in\/digital-marketing-course-in-kottakkal\/\)/);
  assert.match(body,/\[Contact Level8\]\(https:\/\/level8\.in\/contact\/\)/);
});

test('a formatted blog passes the blog quality gate',()=>{
  const home='https://level8.in/',contact='https://level8.in/contact/',img='https://level8.in/wp-content/uploads/class.jpg',post1='https://level8.in/how-seo-works/',post2='https://level8.in/what-is-content-writing/',landing='https://level8.in/digital-marketing-course-in-kottakkal/';
  const filler=n=>Array(n).fill('lesson').join(' ');
  const body=`# SEO course guide

Level8 teaches this [Level8](${home}) seo course for new students. The seo course starts with the basics.

## What is an seo course?

${filler(520)} Students compare seo training with a google ads course.

![seo course classroom](${img})

Read the [SEO guide](${post1}) and the [writing guide](${post2}). The [course page](${landing}) explains the syllabus. Google documents ranking in [Search Central](https://developers.google.com/search/docs/fundamentals/seo-starter-guide).

## How long does an seo course take?

${filler(520)} A content writing course and a digital marketing course sit beside this class. This seo course stays practical. The seo course includes weekly reviews.

![digital marketing course class](${img})

## Why start an seo course with Level8?

Level8 is the team that teaches it. Join [Level8](${home}) when the next batch opens. This seo course rewards steady practice.

[Talk to Level8](${contact}) today.

## FAQs

Q1. Who can join an seo course?

A. ${filler(40)}

Q2. How much practice is included?

A. ${filler(40)}
`;
  const data={blog:true,keyword:'seo course',focus_keyword:'seo course',related_keywords:'seo training, google ads course, content writing course, digital marketing course',meta_title:'SEO course guide for new students',meta_description:'Learn what an seo course covers, who should join, and how practice, classes and live projects are arranged for students.',slug:'seo-course',body,word_min:1200,word_max:3000,brand_name:'Level8',home_url:home,contact_url:contact,blog_images:img,featured_image:'https://level8.in/wp-content/uploads/2026/10/seo-course-featured.webp',featured_media_id:'4065',blog_links:[post1,post2].join('\n'),landing_links:landing,avoid_hosts:'zeonacademy.com',tags:'SEO, Training, Course, Kerala, Students',categories:'Digital marketing, Courses, Career'};
  const gate=quality(data.meta_title,data);
  assert.equal(gate.passed,true,gate.checks.filter(c=>!c.passed).map(c=>c.name).join('; '));
  const broken=quality(data.meta_title,{...data,body:body.replace('## What is an seo course?','## What an seo course includes')});
  assert.equal(broken.checks.find(c=>c.name==='Every H2 is a question').passed,false);
});

test('a daily blog schedule uses every working day and skips Sundays',()=>{
  const slots=scheduleSlots('2026-10',6,1,'2026-10-21');
  assert.deepEqual([...new Set(slots.map(s=>s.date))],['2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31']);
  assert.equal(slots.filter(s=>s.kind==='blog').length,10);
  assert.equal(slots.filter(s=>s.kind==='landing').length,2);
  assert.equal(slots.filter(s=>s.date==='2026-10-21'&&s.kind==='landing').length,1);
  assert.equal(slots.some(s=>new Date(s.date+'T00:00:00Z').getUTCDay()===0),false);
});

test('three blogs a week are spread across the working days',()=>{
  assert.deepEqual(scheduleSlots('2026-10',3,0,'2026-10-26').map(s=>s.date),['2026-10-26','2026-10-29','2026-10-31']);
});

test('daily and weekly report windows follow the latest search day',()=>{
  const days=['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18'].map(date=>({date}));
  const day=reportWindow('day',days);
  assert.equal(day.end,'2026-10-18');
  assert.equal(day.prevEnd,'2026-10-17');
  assert.equal(day.period_key,'2026-10-18');
  const week=reportWindow('week',days);
  assert.equal(week.start,'2026-10-12');
  assert.equal(week.end,'2026-10-18');
  assert.equal(week.prevStart,'2026-10-05');
  assert.equal(week.prevEnd,'2026-10-11');
  assert.equal(week.period_key,'2026-10-12');
  const locked=reportWindow('day',days,'2026-10-15');
  assert.equal(locked.end,'2026-10-15');
});

test('the report spotlight names a rise and a fall',()=>{
  const up=reportSpotlight({clicks:42,position:8.2,previous:{clicks:36,days:1,position:9.1}},{period:'day',query:'seo course',action:'Move “seo course” into the top 3'});
  assert.equal(up.tone,'up');
  assert.match(up.headline,/rose 17%/);
  assert.match(up.detail,/seo course/);
  assert.equal(up.action,'Move “seo course” into the top 3');
  const down=reportSpotlight({clicks:10,previous:{clicks:20,days:1}},{period:'week'});
  assert.equal(down.tone,'down');
  assert.match(down.headline,/fell 50%/);
});

test('a heading-style FAQ is rewritten as Q1 and A',()=>{
  const raw='## Why start an seo course?\n\nThe class starts with practice.\n\n## What are the common questions about an seo course?\n\n### Who can join an seo course?\n\nAnyone with a laptop can join.\n\n### How much practice is included?\n\nWeekly reviews are included.\n';
  const out=placeBlogFaq(raw);
  assert.match(out,/## FAQs\n\nQ1\. Who can join an seo course\?\n\nA\. Anyone with a laptop can join\.\n\nQ2\. How much practice is included\?\n\nA\. Weekly reviews are included\./);
  assert.doesNotMatch(out,/^### /m);
});

test('blog photos reject logos and thin images, and the article gets two photos plus a featured image',()=>{
  assert.equal(blogPhoto('https://level8.in/wp-content/uploads/2025/04/Asset-1@2x-1024x124.png',1024,124),false);
  assert.equal(blogPhoto('https://level8.in/wp-content/uploads/2026/10/AI-Content.webp',2560,1344),true);
  const picked=pickBlogMedia({featured:[{id:4065,url:'https://level8.in/wp-content/uploads/2026/10/featured.webp',alt:'AI writers'}],content:[{id:4060,url:'https://level8.in/wp-content/uploads/2026/10/one.webp'},{id:4062,url:'https://level8.in/wp-content/uploads/2026/10/two.webp'},{id:4065,url:'https://level8.in/wp-content/uploads/2026/10/featured.webp'}]},'seo course');
  assert.equal(picked.featured.id,4065);
  assert.deepEqual(picked.content.map(c=>c.id),[4060,4062]);
  const body=placeBlogImages('# Title\n\nIntro\n\n![logo](https://level8.in/logo.png)\n\n## What is an seo course?\n\nFirst.\n\n## How long does an seo course take?\n\nSecond.\n',picked.content.map(c=>c.url),'seo course',['digital marketing course']);
  assert.equal((body.match(/!\[/g)||[]).length,2);
  assert.match(body,/!\[seo course\]\(https:\/\/level8\.in\/wp-content\/uploads\/2026\/10\/one\.webp\)/);
  assert.match(body,/!\[digital marketing course\]\(https:\/\/level8\.in\/wp-content\/uploads\/2026\/10\/two\.webp\)/);
  assert.doesNotMatch(body,/logo\.png/);
  assert.deepEqual(articleScenes('# Title\n\n## What is an seo course?\n\nFirst.\n\n## How long does an seo course take?\n\nSecond.\n\n## FAQs\n\nQ1. Who can join?\n'),['What is an seo course?','How long does an seo course take?']);
});

test('a service landing page uses the search format',()=>{
  const gate=quality('Digital marketing course',{landing:true,keyword:'digital marketing course',focus_keyword:'digital marketing course',meta_title:'Digital marketing course',meta_description:'Short.',slug:'x',body:'# Digital marketing course\n\nA short page.',word_min:900,word_max:1800});
  const names=gate.checks.map(c=>c.name);
  assert.ok(names.includes('At least four SEO headings, with the focus keyword in one H2'));
  assert.ok(names.includes('Services FAQ uses Q1 and A, with three to five questions'));
  assert.ok(names.includes('At least two images use the focus keyword or a related keyword in the alt text'));
  assert.equal(gate.checks.find(c=>c.name==='At least four high-volume keywords appear on the page').passed,false);
  assert.equal(gate.checks.some(c=>c.name==='Every H2 is a question'),false);
});

test('pages that are not blogs keep the original quality gate',()=>{
  const gate=quality('Web design guide',{keyword:'web design',meta_title:'Web design services for local businesses',meta_description:'Explore web design services for local businesses, with clear planning, practical steps and helpful resources for your team.',slug:'web-design-guide',body:'# Web design\n\nWeb design '+Array(310).fill('planning').join(' ')+'\n\n[One](https://example.com/a) [Two](https://example.com/b) [Three](https://example.com/c)',word_min:300,word_max:1000,brand_verified:true,facts_verified:true,links_verified:true,originality_verified:true,schema_verified:true});
  assert.equal(gate.passed,true,gate.checks.filter(c=>!c.passed).map(c=>c.name).join('; '));
  assert.equal(gate.checks.some(c=>c.name==='Every H2 is a question'),false);
});
