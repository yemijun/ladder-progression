const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','assets/js/app.js'),'utf8');
const logic=app.split('/* WORKSPACE-VIEWS-START */')[1].split('/* WORKSPACE-VIEWS-END */')[0];
function page(saved){
  const views=['train','plan','settings'],timer={hidden:false},slots={};
  let active='bench', persisted;
  const panels={},buttons={};
  for(const k of ['bench','squat']){
    panels[k]=views.map(view=>({dataset:{viewpane:view},hidden:false}));
    buttons[k]=views.map(view=>({dataset:{view},setAttribute(name,value){this[name]=value}}));
    slots[k]={appendChild(node){node.parent=k}};
  }
  const context=vm.createContext({
    ALL_LIFTS:['bench','squat'],
    localStorage:{getItem:()=>saved?JSON.stringify(saved):null,setItem:(key,value)=>{persisted=JSON.parse(value)}},
    document:{querySelector:selector=>selector==='.rest-timer'?timer:{getAttribute:()=>active}},
    $:id=>id.startsWith('timer-slot-')?slots[id.slice(11)]:{querySelectorAll:selector=>selector==='[data-viewpane]'?panels[id.slice(3)]:buttons[id.slice(3)]}
  });
  vm.runInContext(logic,context);
  return {panels,buttons,timer,choose:(k,v)=>vm.runInContext(`switchWorkspaceView('${k}','${v}')`,context),
    activate:k=>{active=k;vm.runInContext('syncTrainingChrome()',context)},saved:()=>persisted};
}
test('switching view shows exactly one panel and retains independent choices',()=>{
  const p=page();p.choose('bench','settings');p.choose('squat','plan');
  assert.deepEqual(p.panels.bench.map(x=>x.hidden),[true,true,false]);
  assert.deepEqual(p.panels.squat.map(x=>x.hidden),[true,false,true]);
  assert.deepEqual(p.saved(),{bench:'settings',squat:'plan'});
  assert.equal(p.buttons.bench[2]['aria-pressed'],'true');
});
test('one shared timer is shown only in the active training workspace',()=>{
  const p=page();p.choose('bench','train');assert.equal(p.timer.parent,'bench');
  p.choose('bench','plan');assert.equal(p.timer.hidden,true);
  p.activate('squat');assert.equal(p.timer.hidden,false);assert.equal(p.timer.parent,'squat');
  p.activate('history');assert.equal(p.timer.hidden,true);
});
test('saved views restore and invalid view requests fall back to training',()=>{
  const p=page({bench:'plan',squat:'settings'});p.choose('bench','unknown');
  assert.deepEqual(p.saved(),{bench:'train',squat:'settings'});
});
