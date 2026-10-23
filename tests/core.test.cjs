const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const html = readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
const core = html.split('CORE-START')[1].split('CORE-END')[0];
const context = vm.createContext({});
vm.runInContext(core.slice(core.indexOf('const LIFT_SPECS'), core.lastIndexOf('/*')), context);
const run = expression => vm.runInContext(expression, context);
test('bench and squat thresholds remain independent', () => {
  assert.equal(run("decideMode('bench',100,7,'auto','auto','kg').mode"), 'regress');
  assert.equal(run("decideMode('bench',100,8,'auto','auto','kg').mode"), 'base');
  assert.equal(run("decideMode('bench',100,9,'auto','auto','kg').step"), 10);
  assert.equal(run("decideMode('squat',130,7,'auto','auto','kg').mode"), 'base');
  assert.equal(run("decideMode('squat',130,8,'auto','auto','kg').mode"), 'advance');
});
test('four cycles preserve 5 sets and 18 training tiers', () => {
  assert.equal(run("buildLiftPlan('bench',{tenRM:100,repsAfterStep:8},'kg').sessions.length"), 18);
  assert.equal(run("buildCycle(100,5,1).map(t=>t.reps).join(',')"), '7,5,3,1');
  assert.equal(run("buildCycle(100,5,4).map(t=>t.reps).join(',')"), '10,8,6,4,2');
  assert.equal(run("buildCycle(100,5,4).every(t=>t.sets===5)"), true);
});
test('pass advances, failure retries, threshold regresses to cycle opening', () => {
  run("var cycles = buildLiftPlan('bench',{tenRM:100,repsAfterStep:8},'kg').cycles");
  assert.equal(run('applyLog(cycles,[{completed:true}],5,2,2).next.weight'), 105);
  assert.equal(run('applyLog(cycles,[{completed:false}],5,2,2).next.weight'), 100);
  assert.equal(run('applyLog(cycles,[{completed:true},{completed:false},{completed:false}],5,2,2).next.weight'), 95);
  assert.equal(run('applyLog(cycles,Array.from({length:18},()=>({completed:true})),5,2,2).next'), null);
});
test('pause removes scheduling without deleting progress', () => {
  assert.equal(run('applyLog(cycles,[{completed:true}],5,2,0).weeks.length'), 0);
  assert.equal(run('applyLog(cycles,[{completed:true}],5,2,0).logged'), 1);
  assert.equal(run('applyLog(cycles,[],5,2,3).totalWeeks'), 6);
});
test('repeated regressions never produce zero or negative weights', () => {
  assert.equal(run("decideMode('bench',5,1,'auto','auto','kg').open"), 5);
  assert.equal(run('applyLog(cycles,Array.from({length:100},()=>({completed:false})),5,2,2).timeline.every(t=>t.weight>=5)'), true);
});
test('actual reps reject invalid input but allow zero', () => {
  for (const input of ['', ' ', '-1', '1.5', '100', 'NaN']) assert.equal(run(`validActual(${JSON.stringify(input)})`), false);
  for (const input of ['0', '7', '99']) assert.equal(run(`validActual(${JSON.stringify(input)})`), true);
});
test('backup validation accepts old records and rejects malformed or executable content', () => {
  run("var backup={logs:{bench:[{at:'2026-10-24 12:00',cycle:1,weight:100,reps:7,sets:5,actual:7,completed:true}],squat:[]},archives:[]}");
  assert.equal(run('validateBackup(backup)===backup'), true);
  assert.throws(() => run('validateBackup({logs:{bench:[null]}})'));
  assert.throws(() => run("validateBackup({logs:{bench:[{...backup.logs.bench[0],at:'<img src=x onerror=alert(1)>'}]}})"));
  assert.throws(() => run("validateBackup({logs:{bench:[{...backup.logs.bench[0],weight:'100'}]}})"));
  assert.throws(() => run("validateBackup({archives:[{id:'invalid',lifts:[]}]})"));
});
test('all inline scripts compile', () => {
  for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script);
});
