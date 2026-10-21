import {test} from 'node:test';
import assert from 'node:assert/strict';
import {keywordMatchesServices} from '../worker/providers.js';

const services='digital marketing courses, SEO training, Google Ads, content writing';
const place='Kochi, Kerala';

test('service and place keywords match a digital marketing institute',()=>{
  for(const keyword of ['digital marketing institute in kerala','digital marketing course kochi','seo training in kochi','google ads course kerala','content writing course'])
    assert.equal(keywordMatchesServices(keyword,services,place),true,keyword);
});

test('place-only and unrelated competitor keywords do not match',()=>{
  for(const keyword of ['hospital administration courses','x ray search','ibis academy','professional network platform','professional networking platform','free ai tools','content creation','digital media academy','institutes in kerala'])
    assert.equal(keywordMatchesServices(keyword,services,place),false,keyword);
});

test('a city name alone is not a service match',()=>{
  assert.equal(keywordMatchesServices('kochi','kochi, kerala','Kochi, Kerala'),false);
  assert.equal(keywordMatchesServices('best institute in kerala',services,place),false);
});
