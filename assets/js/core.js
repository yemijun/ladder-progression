const LIFT_SPECS = {
  bench: { key:'bench', name:'卧推', measureStep:5, regressGap:3, advanceGap:1, baseStep:5, advanceStep:10, regressDrop:5 },
  squat: { key:'squat', name:'深蹲', measureStep:10, regressGap:5, advanceGap:2, baseStep:5, advanceStep:10, regressDrop:5 }
};

const ALL_LIFTS = ['bench', 'squat'];
const CYCLE_COUNT = 4;      /* 小循环 1–4 */
const SETS_PER_TIER = 5;    /* 每个重量 5 组 */
const START_REPS_BASE = 7;  /* 小循环1 开把档 7 次 */
const REPS_STEP = 1;        /* 每个小循环开把档 +1 次 */
const REPS_DROP = 2;        /* 每递增一档重量，次数 −2 */
const SESSIONS_PER_WEEK = 2;/* 每个动作每周训练次数的默认值 */

/* 小循环在「实际执行序列」里覆盖的周次区间（按该动作自己的每周次数换算） */
function cycleWeekRange(A, cycleIndex){
  const pw = A.perWeek || SESSIONS_PER_WEEK;
  const ws = [];
  A.timeline.forEach((t, i) => {
    if (t.cycle === cycleIndex) ws.push(pw > 0 ? Math.floor(i / pw) + 1 : 0);
  });
  if (!ws.length) return '';
  const a = Math.min.apply(null, ws), b = Math.max.apply(null, ws);
  return a === b ? ('第 ' + a + ' 周') : ('第 ' + a + '–' + b + ' 周');
}

/* 按每周训练次数把训练序列排进周次；perWeek ≤ 0 表示暂停，不排期 */
function layoutWeeks(sessions, perWeek){
  const pw = Math.round(Number(perWeek));
  const weeks = [];
  if (!pw || pw <= 0) return weeks;
  sessions.forEach((s, i) => {
    const w = Math.floor(i / pw) + 1;
    const slot = i % pw;
    if (!weeks[w - 1]) weeks[w - 1] = { week:w, slots:[] };
    weeks[w - 1].slots[slot] = s;
  });
  return weeks;
}

function decideMode(key, tenRM, repsAfterStep, forceMode, stepOverride, unit){
  const s = LIFT_SPECS[key];
  const u = unit === 'lb' ? 'lb' : 'kg';
  const gap = 10 - repsAfterStep;

  let mode;
  if (forceMode && forceMode !== 'auto') mode = forceMode;
  else if (gap >= s.regressGap) mode = 'regress';
  else if (gap <= s.advanceGap) mode = 'advance';
  else mode = 'base';

  let step;
  if (stepOverride && stepOverride !== 'auto') step = Number(stepOverride);
  else if (mode === 'advance') step = s.advanceStep;
  else step = s.baseStep;

  const open = Math.max(5, (mode === 'regress') ? (tenRM - s.regressDrop) : tenRM);

  return { key, name:s.name, unit:u, tenRM, repsAfterStep, gap, mode, step, open, spec:s };
}

/* 单个小循环：自开把档起逐档递增、次数递减 2 次，直至 1 次 */
function buildCycle(open, step, cycleIndex){
  const tiers = [];
  let weight = open;
  let reps = START_REPS_BASE + (cycleIndex - 1) * REPS_STEP;
  while (reps >= 1){
    tiers.push({ weight, reps, sets: SETS_PER_TIER });
    weight += step;
    reps -= REPS_DROP;
  }
  return tiers;
}

/* 单个动作的完整计划——每个动作各自带「每周训练次数」，
   小循环固定按 1 → 4 顺序执行；把 perWeek 设为 0 即暂停该动作。 */
function buildLiftPlan(key, cfg, unit){
  const d = decideMode(key, cfg.tenRM, cfg.repsAfterStep, cfg.forceMode, cfg.stepOverride, unit);
  const perWeek = (cfg.perWeek === undefined || cfg.perWeek === null)
    ? SESSIONS_PER_WEEK : Math.max(0, Math.round(Number(cfg.perWeek)));
  const cycles = [];
  for (let k = 1; k <= CYCLE_COUNT; k++){
    cycles.push({ index:k, tiers: buildCycle(d.open, d.step, k) });
  }
  const sessions = [];
  cycles.forEach(cy => cy.tiers.forEach(t => {
    sessions.push({ cycle: cy.index, weight: t.weight, reps: t.reps, sets: t.sets });
  }));
  const weeks = layoutWeeks(sessions, perWeek);
  return { decided:d, cycles, sessions, weeks, totalWeeks: weeks.length, perWeek: perWeek };
}

/* liftKeys 省略时生成全部动作；仅传一个即为单动作计划 */
function buildProgram(cfg, unit, liftKeys){
  const keys = (liftKeys && liftKeys.length) ? liftKeys : ALL_LIFTS;
  const out = {};
  keys.forEach(k => { out[k] = buildLiftPlan(k, cfg[k], unit); });
  return out;
}

/* ---------- 训练记录推演 ----------
   把「计划档位」与「实际记录」合成一条真实执行序列：
     达标      → 指针前进一档
     未达标    → 指针不动（下次重复同一档）
     连续 N 次未达标 → 重量再降 regressDrop，且指针退回本小循环的开把档
   记录用完后，余下档位按「全部达标」推演，供日程展示。                     */

function flattenTiers(cycles){
  const out = [];
  cycles.forEach(cy => cy.tiers.forEach(t => {
    out.push({ cycle: cy.index, weight: t.weight, reps: t.reps, sets: t.sets });
  }));
  return out;
}

function cycleFirstIndex(baseline, cycleIndex){
  for (let i = 0; i < baseline.length; i++){
    if (baseline[i].cycle === cycleIndex) return i;
  }
  return 0;
}

function applyLog(cycles, log, regressDrop, failThreshold, perWeek){
  const baseline = flattenTiers(cycles);
  const timeline = [];
  const thr = Math.max(1, Number(failThreshold) || 2);
  const pw = (perWeek === undefined || perWeek === null) ? SESSIONS_PER_WEEK : Math.max(0, Math.round(Number(perWeek)));
  let pos = 0, drop = 0, failStreak = 0;

  (log || []).forEach(rec => {
    const base = baseline[Math.min(pos, baseline.length - 1)];
    const completed = !!rec.completed;
    const item = {
      cycle: base.cycle, weight: Math.max(5, base.weight - drop), reps: base.reps, sets: base.sets,
      state: completed ? 'done' : 'failed',
      actual: (rec.actual === undefined || rec.actual === null) ? null : rec.actual,
      at: rec.at || '', dropped: drop, regressed: false
    };
    if (completed){
      pos += 1;
      failStreak = 0;
    } else {
      failStreak += 1;
      if (failStreak >= thr){
        drop += regressDrop;
        pos = cycleFirstIndex(baseline, base.cycle);
        failStreak = 0;
        item.regressed = true;
      }
    }
    timeline.push(item);
  });

  for (let p = pos; p < baseline.length; p++){
    const b = baseline[p];
    timeline.push({
      cycle: b.cycle, weight: Math.max(5, b.weight - drop), reps: b.reps, sets: b.sets,
      state: 'planned', actual: null, at: '', dropped: drop, regressed: false
    });
  }

  let nextIndex = -1;
  for (let i = 0; i < timeline.length; i++){
    if (timeline[i].state === 'planned'){ nextIndex = i; break; }
  }
  if (nextIndex >= 0) timeline[nextIndex].state = 'next';

  const weeks = layoutWeeks(timeline, pw);

  return {
    baseline: baseline,
    timeline: timeline,
    weeks: weeks,
    totalWeeks: weeks.length,
    perWeek: pw,
    nextIndex: nextIndex,
    next: nextIndex >= 0 ? timeline[nextIndex] : null,
    logged: timeline.filter(t => t.state === 'done' || t.state === 'failed').length,
    doneCount: timeline.filter(t => t.state === 'done').length,
    failedCount: timeline.filter(t => t.state === 'failed').length,
    regressCount: timeline.filter(t => t.regressed).length
  };
}

function validActual(value){
  return String(value).trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 99;
}

/* 在进入页面与本地存储前检查备份结构，拒绝损坏记录及可执行 HTML。 */
function validateBackup(data){
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  const checkLogs = logs => {
    if (!Array.isArray(logs)) throw new Error('训练记录格式不正确');
    logs.forEach(r => {
      if (!object(r) || typeof r.at !== 'string' || r.at.length > 40 || /[<>&"']/.test(r.at) ||
          ![r.weight, r.reps, r.sets, r.cycle].every(Number.isFinite) ||
          r.weight < 0 || r.reps < 1 || r.sets < 1 || !Number.isInteger(r.cycle) || r.cycle < 1 || r.cycle > 4 ||
          typeof r.completed !== 'boolean' || (r.actual != null && !validActual(r.actual))){
        throw new Error('备份含有无效训练记录');
      }
    });
  };
  if (!object(data) || (!data.logs && !data.archives)) throw new Error('文件内容不是本工具的备份');
  if (data.settings != null && !object(data.settings)) throw new Error('备份设置格式不正确');
  if (data.logs != null){
    if (!object(data.logs)) throw new Error('训练记录格式不正确');
    ALL_LIFTS.forEach(k => { if (data.logs[k] != null) checkLogs(data.logs[k]); });
  }
  if (data.archives != null){
    if (!Array.isArray(data.archives)) throw new Error('历史轮次格式不正确');
    data.archives.forEach(a => {
      if (!object(a) || typeof a.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(a.id) ||
          typeof a.savedAt !== 'string' || !Array.isArray(a.lifts) ||
          (a.unit !== 'kg' && a.unit !== 'lb')) throw new Error('历史轮次格式不正确');
      a.lifts.forEach(L => {
        if (!object(L) || !ALL_LIFTS.includes(L.key) ||
            !['tenRM','open','step','sessions','done','failed','regress','weeks','peak'].every(f => Number.isFinite(L[f])) ||
            typeof L.name !== 'string' || typeof L.mode !== 'string' || /[<>&"']/.test(L.name + L.mode)){
          throw new Error('历史轮次内容不正确');
        }
        checkLogs(L.log || []);
      });
    });
  }
  return data;
}

