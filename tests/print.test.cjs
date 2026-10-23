const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','assets/js/app.js'),'utf8');
const logic=app.slice(app.indexOf('let printDetails ='),app.indexOf('function exportCsv()'));
function printPage(selected){
  const details=[{open:false},{open:true}], modules=[{},{ }];
  for(const mod of modules)mod.classList={toggle:(name,value)=>{mod.hidden=value},remove:()=>{mod.hidden=false}};
  let printed=false, afterprint, message;
  vm.runInNewContext(logic+';exportPrint();',{
    selectedModules:()=>selected?[modules[0]]:[],setMsg:text=>{message=text},
    document:{querySelectorAll:selector=>selector.includes('details')?details:modules},
    window:{print:()=>{printed=true},addEventListener:(name,fn)=>{afterprint=fn}}
  });
  return {details,modules,printed,afterprint,message};
}
test('print opens folded content, filters modules and restores the prior UI afterwards',()=>{
  const p=printPage(true);
  assert.equal(p.printed,true);
  assert.deepEqual(p.details.map(d=>d.open),[true,true]);
  assert.deepEqual(p.modules.map(m=>m.hidden),[false,true]);
  p.afterprint();
  assert.deepEqual(p.details.map(d=>d.open),[false,true]);
  assert.ok(p.modules.every(m=>!m.hidden));
});
test('print with no selected module leaves UI untouched',()=>{
  const p=printPage(false);
  assert.equal(p.printed,false);
  assert.deepEqual(p.details.map(d=>d.open),[false,true]);
  assert.ok(p.message);
});
