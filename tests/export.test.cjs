const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const context=vm.createContext({Blob,TextEncoder});
vm.runInContext(fs.readFileSync(path.join(root,'assets/js/core.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root,'assets/js/export-model.js'),'utf8'),context);
const run=code=>vm.runInContext(code,context);
const json=code=>JSON.parse(run('JSON.stringify('+code+')'));
run("var cfg={bench:{tenRM:80,repsAfterStep:8,perWeek:2,unit:'kg',failThreshold:2},squat:{tenRM:130,repsAfterStep:8,perWeek:2,unit:'kg',failThreshold:2}};var logs={bench:[],squat:[]};var options={purpose:'plan',scope:'all',title:'训练计划'}");
const snapshot=()=>run("captureExportSnapshot(cfg,logs,['bench'],'2026-10-24 12:30')");
test('snapshot includes live configuration and remains unchanged when inputs change',()=>{
  run("var snap=captureExportSnapshot(cfg,logs,['bench'],'2026-10-24 12:30');cfg.bench.tenRM=100;logs.bench.push({completed:true})");
  assert.equal(run('snap.lifts[0].settings.tenRM'),80);
  assert.equal(run('snap.lifts[0].adjusted.next.weight'),80);
  assert.equal(run('snap.lifts[0].log.length'),0);
  run('cfg.bench.tenRM=80;logs.bench=[]');
});
test('plan pages honor selected action, cycle and adjusted failures',()=>{
  run("var failed=captureExportSnapshot(cfg,{bench:[{completed:false},{completed:false}]},['bench'],'now');var pages=buildExportPages(failed,{purpose:'plan',scope:'current',title:'计划'})");
  assert.ok(json('pages').every(p=>p.lift==='bench' && p.cycle===1));
  assert.ok(json('pages').flatMap(p=>p.rows).some(r=>r[2]==='75kg' && r[4]==='下一次'));
  assert.equal(json('buildExportPages(captureExportSnapshot(cfg,logs,["bench"],"now"),options)').length,4);
});
test('report exports recorded weights rather than reinterpreting them from current settings',()=>{
  run("var actual={at:'2026-10-24 12:00',cycle:1,weight:42.5,sets:5,reps:7,actual:6,completed:false};var report=captureExportSnapshot(cfg,{bench:[actual]},['bench'],'now')");
  const pages=json("buildExportPages(report,{purpose:'report',scope:'all'})");
  assert.equal(pages[0].rows.length,1);assert.equal(pages[0].rows[0][1],'42.5kg');assert.equal(pages[0].rows[0][3],6);
});
test('pause and completed rounds do not present a future task as ready to train',()=>{
  const pages=json("buildExportPages(captureExportSnapshot({...cfg,bench:{...cfg.bench,perWeek:0}},logs,['bench'],'now'),{purpose:'training',scope:'all'})");
  assert.equal(pages[0].metrics[0][1],'已暂停排期');assert.equal(pages[0].metrics[1][1],'—');
});
test('large reports paginate, and excessive requests are rejected before drawing',()=>{
  run("var large=captureExportSnapshot(cfg,{bench:Array.from({length:25},()=>actual)},['bench'],'now')");
  const pages=json("buildExportPages(large,{purpose:'report',scope:'all'})");
  assert.equal(pages.length,3);assert.ok(pages.every(p=>p.rows.length<=12));
  assert.throws(()=>run("buildExportPages(captureExportSnapshot(cfg,{bench:Array.from({length:1000},()=>actual)},['bench'],'now'),{purpose:'report',scope:'all'})"));
});
test('CSV has one header, fixed columns and separates actual records from projected tasks',()=>{
  const logs=json("exportCsvRows(report,'logs','all')"),plan=json("exportCsvRows(report,'plan','all')");
  assert.equal(logs.length,2);assert.ok(logs.every(r=>r.length===9));
  assert.equal(logs[1][4],42.5);assert.ok(plan.length>logs.length);assert.ok(plan.every(r=>r.length===9));
  const text=run('serializeExportCsv([["=SUM(A1)","中文,内容",42.5]])');
  assert.ok(text.startsWith('\ufeff'));assert.ok(text.includes("'=SUM"));assert.ok(text.includes('"中文,内容"'));
});
test('filenames retain action, timestamp and distinct page suffixes even with a long title',()=>{
  run("var page={title:'标题'.repeat(40),heading:'卧推 · 本轮训练报告'}");
  const one=run("exportPageName(page,'2026-10-24 12:30',0)"),two=run("exportPageName(page,'2026-10-24 12:30',1)");
  assert.notEqual(one,two);assert.ok(one.endsWith('_01.png'));assert.ok(!one.includes(':'));
  assert.ok(one.startsWith('卧推'));
  assert.ok(run("exportPageName({title:'计划',heading:'卧推'},'now',0)").includes('卧推'));
});
test('canvas scaling stays within side and area limits',()=>{
  const scale=run('boundedExportScale(3,720,2000)');
  assert.ok(scale*2000<=4096);assert.ok(720*2000*scale*scale<=8000000);assert.ok(scale<=3);
});
test('archive-only files cannot masquerade as complete backups, including legacy exports',()=>{
  assert.equal(run("archiveOnlyBackup({kind:'archive',logs:{},archives:[{}]})"),true);
  assert.equal(run("archiveOnlyBackup({logs:{},archives:[{}]})"),true);
  assert.equal(run("archiveOnlyBackup({settings:{},logs:{bench:[],squat:[]},archives:[{}]})"),false);
});

test('importing an archive forces merge even when replacement is requested and deduplicates history',()=>{
  const app=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
  run("var workoutLog={bench:[actual],squat:[]},archives=[],state={roundSaved:{}};var settingsApplied=false;function saveLog(){}function saveArchives(){}function renderAll(){}function applyBackupSettings(){settingsApplied=true}");
  run(app.slice(app.indexOf('function logKey('),app.indexOf('function buildRulesFor(')));
  run("var archived={kind:'archive',logs:{},archives:[{id:'saved-round',savedAt:'2026-10-23 12:00',unit:'kg',lifts:[{key:'bench',name:'卧推',mode:'base',tenRM:60,open:60,step:5,sessions:1,done:0,failed:1,regress:0,weeks:1,peak:60,log:[actual]}]}]}");
  assert.equal(run("applyBackup(archived,'replace')"),'merge');
  assert.equal(run('workoutLog.bench.length'),1);assert.equal(run('workoutLog.bench[0].weight'),42.5);
  assert.equal(run('settingsApplied'),false);assert.equal(run('archives.length'),1);
  run("applyBackup(archived,'merge')");assert.equal(run('archives.length'),1);
});
test('stored ZIP uses standard CRC and central directory with unique UTF-8 filenames',async()=>{
  assert.equal(run("exportCrc32(new TextEncoder().encode('123456789'))"),0xcbf43926);
  const zip=await run("createExportZip([{name:'卧推_01.png',blob:new Blob(['one'])},{name:'卧推_02.png',blob:new Blob(['two'])}])");
  const data=Buffer.from(await zip.arrayBuffer());
  assert.equal(data.readUInt32LE(0),0x04034b50);
  assert.equal(data.readUInt32LE(data.length-22),0x06054b50);
  assert.equal(data.readUInt16LE(data.length-12),2);
  assert.equal(data.readUInt32LE(data.readUInt32LE(data.length-6)),0x02014b50);
  fs.mkdirSync(path.join(root,'tmp'),{recursive:true});fs.writeFileSync(path.join(root,'tmp/export-test.zip'),data);
});
