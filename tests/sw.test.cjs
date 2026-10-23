const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');
function worker(online = true){
  const handlers = {}, deleted = [], writes = [];
  const cached = {cached:true};
  const response = {ok:true,clone:()=>({fresh:true})};
  const cache = {put:async (...args)=>writes.push(args)};
  vm.runInNewContext(source,{
    URL, Response,
    location:{origin:'https://example.com'},
    self:{registration:{scope:'https://example.com/ladder/'},addEventListener:(name,fn)=>{handlers[name]=fn},clients:{claim:async()=>{}},skipWaiting:async()=>{}},
    caches:{open:async()=>cache,match:async()=>cached,keys:async()=>['ladder-progression-v1.1.0','ladder-progression-v1.2.0','other-app'],delete:async key=>deleted.push(key)},
    fetch:async()=>{if(!online) throw new Error('offline');return response}
  });
  const request = (url,mode='navigate')=>{
    let result;
    handlers.fetch({request:{url,mode,method:'GET'},respondWith:promise=>{result=promise}});
    return result;
  };
  return {handlers,deleted,writes,cached,response,request};
}
test('online navigation fetches fresh HTML and updates cache',async()=>{
  const w=worker();
  assert.equal(await w.request('https://example.com/ladder/'),w.response);
  assert.equal(w.writes.length,1);
});
test('offline navigation falls back to cached HTML',async()=>{
  const w=worker(false);
  assert.equal(await w.request('https://example.com/ladder/'),w.cached);
});
test('worker leaves other origins and apps alone',()=>{
  const w=worker();
  assert.equal(w.request('https://example.com/another-app/'),undefined);
  assert.equal(w.request('https://another.com/ladder/'),undefined);
});
test('activation only deletes this app old caches',async()=>{
  const w=worker();let task;
  w.handlers.activate({waitUntil:promise=>{task=promise}});
  await task;
  assert.deepEqual(w.deleted,['ladder-progression-v1.1.0']);
});
