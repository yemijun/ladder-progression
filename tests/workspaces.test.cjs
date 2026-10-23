const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname,'..');
const app = fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
const logic = app.slice(app.indexOf('const LIFTS_KEY'),app.indexOf('/* LIFT-VISIBILITY-END */'));
function workspace(saved){
  const handlers={}, inputs={}, storage=new Map(saved ? [['tp-lifts',JSON.stringify(saved)]] : []);
  const logs={bench:[{completed:true}],squat:[{completed:false}]};
  const context=vm.createContext({
    ALL_LIFTS:['bench','squat'],
    $:id=>inputs[id] ||= {checked:true,addEventListener:(name,fn)=>{handlers[id]=fn}},
    localStorage:{getItem:key=>storage.get(key)},
    persistLocal:(key,value)=>{storage.set(key,JSON.stringify(value))},
    renderAll:()=>{},workoutLog:logs
  });
  vm.runInContext(logic,context);
  return {storage,logs,run:code=>vm.runInContext(code,context),
    toggle:(lift,on)=>{inputs['enable-'+lift].checked=on;handlers['enable-'+lift]()}};
}
test('first visit and legacy backups enable both workspaces',()=>{
  const p=workspace();assert.equal(p.run('visibleLifts().join()'),'bench,squat');
  p.run('loadEnabledLifts({bench:false})');assert.equal(p.run('visibleLifts().join()'),'squat');
  p.run('loadEnabledLifts(undefined)');assert.equal(p.run('visibleLifts().join()'),'bench,squat');
});
test('closing active lift falls back to remaining workspace and preserves all logs',()=>{
  const p=workspace();const before=JSON.stringify(p.logs);
  p.toggle('bench',false);
  assert.equal(p.run("availableTab('bench')"),'squat');
  assert.equal(p.run('visibleLifts().join()'),'squat');
  assert.equal(JSON.stringify(p.logs),before);
  assert.deepEqual(JSON.parse(p.storage.get('tp-lifts')),{bench:false,squat:true});
  p.toggle('bench',true);assert.equal(p.run('visibleLifts().join()'),'bench,squat');
});
test('both disabled still allow history, export and re-enabling',()=>{
  const p=workspace({bench:false,squat:false});
  assert.equal(p.run("availableTab('bench')"),'history');
  assert.equal(p.run("availableTab('export')"),'export');
  p.toggle('squat',true);assert.equal(p.run("availableTab('bench')"),'squat');
});
test('all local resources and precache entries exist after reorganization',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const precache=sw.slice(sw.indexOf('const ASSETS'),sw.indexOf("self.addEventListener('install'"));
  const assets=vm.runInNewContext(precache+';ASSETS;');
  for(const url of assets){
    assert.ok(fs.existsSync(path.join(root,url.split('?')[0])),url);
  }
  for(const [,url] of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)){
    assert.ok(assets.includes(url),`not precached: ${url}`);
  }
  assert.ok(html.includes('viewport-fit=cover'));
  const css=fs.readFileSync(path.join(root,'assets/css/app.css'),'utf8');
  assert.ok(css.includes('safe-area-inset-bottom'));
  assert.ok(css.includes('html,body{background:var(--bg)'));
});
test('full backup retains disabled-workspace data and preferences',()=>{
  const context=vm.createContext({
    SETTING_IDS:[],themeMode:'auto',enabledLifts:{bench:true,squat:false},
    BACKUP_VERSION:1,sessionStamp:()=> '2026-10-24 12:00',
    workoutLog:{bench:[],squat:[{completed:true}]},archives:[]
  });
  vm.runInContext(app.slice(app.indexOf('function collectBackup()'),app.indexOf('function backupSummary()')),context);
  const backup=JSON.parse(vm.runInContext('JSON.stringify(collectBackup())',context));
  assert.deepEqual(backup.settings.enabledLifts,{bench:true,squat:false});
  assert.equal(backup.logs.squat.length,1);
});
test('restoring backup settings restores switches, legacy backups keep both enabled',()=>{
  const p=workspace({bench:false,squat:false});
  p.run('globalThis.applySettingsToInputs=()=>{};globalThis.saveSettings=()=>{}');
  p.run(app.slice(app.indexOf('function applyBackupSettings(s)'),app.indexOf('/* 合并导入时用这条指纹')));
  p.run('applyBackupSettings({enabledLifts:{bench:false,squat:true}})');
  assert.equal(p.run('visibleLifts().join()'),'squat');
  p.run('applyBackupSettings({})');
  assert.equal(p.run('visibleLifts().join()'),'bench,squat');
});
