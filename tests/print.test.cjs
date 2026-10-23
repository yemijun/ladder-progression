const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','assets/js/export-ui.js'),'utf8');
const logic=source.split('/* EXPORT-PRINT-START:')[1].split('/* EXPORT-PRINT-END */')[0];
function printPage(fail){
  let printed=false,afterprint,message;
  const classes=new Set(),roots=[];
  function element(tag){return {tag,children:[],append(...nodes){this.children.push(...nodes)},remove(){this.removed=true}};}
  const body={append:node=>roots.push(node),classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}};
  const context=vm.createContext({
    exportPrintRoot:null,
    collectExportRequest:()=>{if(fail)throw Error('请选择动作');return {snapshot:{},options:{}}},
    buildExportPages:()=>[{title:'计划',heading:'卧推',subtitle:'快照',metrics:[],notes:[],columns:['重量'],rows:[[80]]}],
    document:{body,createElement:element,querySelectorAll:()=>{throw Error('Printing must not modify workspaces')}},
    window:{print:()=>{printed=true},addEventListener:(name,fn)=>{afterprint=fn}},
    setMsg:text=>{message=text}
  });
  vm.runInContext(logic.slice(logic.indexOf('function cleanupExportPrint'))+';exportPrint();',context);
  return {printed,roots,classes,afterprint,message};
}
test('print creates a standalone document and cleans it up without touching workspace state',()=>{
  const p=printPage(false);
  assert.equal(p.printed,true);assert.equal(p.roots[0].id,'exportPrintRoot');assert.ok(p.classes.has('export-printing'));
  const section=p.roots[0].children[0];assert.equal(section.children[1].textContent,'卧推');
  p.afterprint();assert.equal(p.roots[0].removed,true);assert.equal(p.classes.size,0);
});
test('invalid export requests do not open the print dialog',()=>{
  const p=printPage(true);assert.equal(p.printed,false);assert.equal(p.roots.length,0);assert.ok(p.message.includes('请选择动作'));
});
