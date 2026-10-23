

/* ==========================================================================
   UI
   ========================================================================== */
const $ = (id) => document.getElementById(id);
const LIFT_NAME = { bench:'卧推', squat:'深蹲' };

let noticeTimeout;
function showNotice(message, error){
  clearTimeout(noticeTimeout);
  const el = $('appNotice');
  el.textContent = message;
  el.classList.toggle('error', !!error);
  el.hidden = false;
  if (!error) noticeTimeout = setTimeout(() => { el.hidden = true; }, 5000);
}
function persistLocal(key, value){
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e){ showNotice('本次更改未能保存到浏览器。请立即前往「导出」备份数据，并检查存储空间或浏览器隐私设置。', true); return false; }
}

/* 使用截止时间计算，后台标签页计时也不会因 interval 降频而变慢。 */
let restRemaining = 180, restDeadline = 0, restInterval = null;
function paintTimer(){
  if (restDeadline) restRemaining = Math.max(0, Math.ceil((restDeadline - Date.now()) / 1000));
  $('timerClock').textContent = String(Math.floor(restRemaining / 60)).padStart(2, '0') + ':' + String(restRemaining % 60).padStart(2, '0');
  if (restDeadline && restRemaining === 0){
    clearInterval(restInterval); restInterval = null; restDeadline = 0;
    $('timerStart').textContent = '再休息一组';
    $('timerHint').textContent = '休息结束，准备好后开始下一组';
    showNotice('3 分钟组间休息结束，准备好后开始下一组。');
  }
}
$('timerStart').addEventListener('click', () => {
  if (restDeadline){
    paintTimer(); restDeadline = 0; clearInterval(restInterval); restInterval = null;
    $('timerStart').textContent = '继续休息';
    $('timerHint').textContent = '计时已暂停';
  } else {
    if (!restRemaining) restRemaining = 180;
    restDeadline = Date.now() + restRemaining * 1000;
    restInterval = setInterval(paintTimer, 250);
    $('timerStart').textContent = '暂停';
    $('timerHint').textContent = '放松呼吸，为下一组做好准备';
    paintTimer();
  }
});
$('timerReset').addEventListener('click', () => {
  restDeadline = 0; restRemaining = 180; clearInterval(restInterval); restInterval = null;
  $('timerStart').textContent = '开始休息';
  $('timerHint').textContent = '完成一组，给身体 3 分钟恢复';
  paintTimer();
});
document.addEventListener('visibilitychange', paintTimer);
document.addEventListener('input', e => { if (e.target.matches('input[type=number]')) e.target.setCustomValidity(''); });

/* 每个动作一套完整、独立的工作区标记（避免两份静态标记不同步） */
function liftOptionsHtml(k){
  const name = LIFT_NAME[k], step = LIFT_SPECS[k].measureStep;
  return '' +
  '<div class="fieldgroup"><span class="fgtitle">基础参数</span><div class="grid g4">' +
    '<div class="field"><label>' + name + ' 10RM 重量</label>' +
      '<input type="number" id="' + k + 'RM" value="' + (k === 'bench' ? 100 : 130) + '" min="5" max="1000" step="2.5"></div>' +
    '<div class="field"><label>' + name + '：递增 ' + step + 'kg 后完成次数</label>' +
      '<input type="number" id="' + k + 'Reps" value="8" min="1" max="10" step="1">' +
      '<div class="live" id="live-' + k + '"></div></div>' +
  '</div></div>' +
  '<div class="fieldgroup"><span class="fgtitle">判定与推进节奏</span><div class="grid g4">' +
    '<div class="field"><label>判定模式</label><select id="' + k + 'ForceMode">' +
      '<option value="auto">自动判定（推荐）</option><option value="base">指定为基础模板</option>' +
      '<option value="regress">指定为退阶（开把 −5）</option><option value="advance">指定为进阶（跨度 10）</option></select></div>' +
    '<div class="field"><label>重量跨度（每档递增）</label><select id="' + k + 'Step">' +
      '<option value="auto">依模式自动</option><option value="5">5 kg</option><option value="10">10 kg</option></select></div>' +
    '<div class="field"><label>每周训练次数</label><select id="' + k + 'PerWeek">' +
      '<option value="0">暂停（本轮不推进）</option><option value="1">1 次 / 周</option>' +
      '<option value="2" selected>2 次 / 周</option><option value="3">3 次 / 周</option></select></div>' +
    '<div class="field"><label>重量单位</label><select id="' + k + 'Unit">' +
      '<option value="kg">公斤（kg）</option><option value="lb">磅（lb）</option></select></div>' +
    '<div class="field"><label>连续未达标多少次后下调重量</label><select id="' + k + 'Threshold">' +
      '<option value="1">1 次</option><option value="2" selected>2 次（默认）</option>' +
      '<option value="3">3 次</option></select></div>' +
  '</div></div>';
}

function workspaceHtml(k){
  const name = LIFT_NAME[k], step = LIFT_SPECS[k].measureStep;
  return '' +
  '<section class="card mod k-info" id="mod-setup-' + k + '">' +
    '<h2>' + name + ' · 基准重量与断层 <span class="tag">修改后自动重算</span></h2>' +
    '<p class="hint"><b>10RM</b> 指在动作标准的前提下，恰好能完成 10 次、第 11 次无法完成的重量（非极限单次重量）。该数值是' + name + '计划的锚点。</p>' +
    liftOptionsHtml(k) +
    '<div class="blocktitle" style="margin-top:20px">测试方法</div>' +
    '<div class="guide"><ol class="steps">' +
      '<li><b>测定 10RM。</b>充分热身后逐级递增负荷，确定恰好能完成 10 次、第 11 次无法完成的重量。级间休息不少于 3 分钟。</li>' +
      '<li><b>测定递增一档后的极限次数。</b>' + name + '递增 <b>' + step + 'kg</b>，动作标准不变做到力竭，记录完成次数。</li>' +
      '<li><b>计算断层值。</b><code>断层 = 10 − 递增后完成次数</code><div class="live" id="gapExample-' + k + '"></div></li>' +
    '</ol>' +
    '<p class="guide-note">如需提高精度可继续递增一档重复测试；各档降幅不一致时<b>以第一档为准</b>。暂无法测试时可保留默认值，后续修改该数值，计划会自动重算。</p></div>' +
    '<div class="ref" id="refBox-' + k + '"></div>' +
  '</section>' +

  '<section class="card mod k-plan" id="mod-cycles-' + k + '">' +
    '<h2>' + name + ' · 四个小循环的重量与组次编排</h2>' +
    '<p class="hint">同一重量完成 5 组；每递增一档，次数递减 2 次，直至 1 次。小循环 1 至 4 的开把档依次为 7、8、9、10 次。</p>' +
    '<div id="cycles-' + k + '"></div>' +
  '</section>' +

  '<section class="card mod k-sched" id="mod-schedule-' + k + '">' +
    '<h2>' + name + ' · 周训练日程 <span class="tag" id="cadenceTag-' + k + '">每周 2 练</span></h2>' +
    '<p class="hint">表格中每个单元格对应一次训练，该次训练仅执行一个重量档；组间休息 <b>3 分钟</b>。</p>' +
    '<div id="schedule-' + k + '"></div>' +
  '</section>' +

  '<section class="card no-print k-prog" id="mod-round-' + k + '">' +
    '<h2>' + name + ' · 本轮进度 <span class="tag" id="roundTag-' + k + '">进行中</span></h2>' +
    '<div id="roundBox-' + k + '"></div>' +
  '</section>' +

  '<section class="card mod k-log" id="mod-log-' + k + '">' +
    '<h2>' + name + ' · 训练记录与调整</h2>' +
    '<p class="hint">每次训练结束后录入实际完成次数，后续日程随即重算：达标进入下一档，未达标下一次重复同一档，同一档连续未达标则下调重量并从本小循环开把档重走。</p>' +
    '<div id="log-' + k + '"></div>' +
    '<div class="blocktitle" style="margin-top:20px">执行规则</div>' +
    '<ol class="rules" id="rules-' + k + '"></ol>' +
  '</section>';
}

(function buildWorkspaces(){
  ALL_LIFTS.forEach(k => {
    const ws = $('ws-' + k);
    ws.innerHTML = workspaceHtml(k);
    ws.prepend($('mod-log-' + k));
    const nav = document.createElement('nav');
    nav.className = 'workspace-nav no-print';
    nav.setAttribute('aria-label', LIFT_NAME[k] + '页面导航');
    nav.innerHTML = [['log','训练打卡'],['setup','计划设置'],['cycles','循环编排'],['schedule','训练日程'],['round','本轮进度']]
      .map(([id, label]) => '<a href="#mod-' + id + '-' + k + '">' + label + '</a>').join('');
    ws.prepend(nav);
    const guide = $('mod-setup-' + k).querySelector('.guide');
    const heading = guide.previousElementSibling;
    const details = document.createElement('details');
    details.className = 'setup-guide';
    heading.replaceWith(details);
    const summary = document.createElement('summary');
    summary.textContent = '第一次使用？查看 10RM 测试方法';
    details.append(summary, guide);
    ws.querySelectorAll('.field').forEach(field => {
      const label = field.querySelector('label'), input = field.querySelector('input,select');
      if (label && input) label.htmlFor = input.id;
    });
  });
})();

/* ---------- 训练记录状态（本地持久化） ---------- */
const LOG_KEY = 'tp-log';
const THRESHOLD_KEY = 'tp-fail-threshold';
const state = { roundSaved: { bench: false, squat: false } };
let workoutLog = { bench: [], squat: [] };
let legacyThreshold = null;

function loadLog(){
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (raw){
      const o = JSON.parse(raw);
      ALL_LIFTS.forEach(k => { if (o && Array.isArray(o[k])) workoutLog[k] = o[k]; });
    }
  } catch (e) {}
  try {
    const t = Number(localStorage.getItem(THRESHOLD_KEY));
    if (t >= 1 && t <= 5) legacyThreshold = t;   /* 旧版全局阈值，迁移给两个动作 */
  } catch (e) {}
}
function saveLog(){
  const saved = persistLocal(LOG_KEY, workoutLog);
  /* 记录一变，本轮就不再是「已保存」状态 */
  ALL_LIFTS.forEach(k => { state.roundSaved[k] = false; });
  return saved;
}
function sessionStamp(){
  const d = new Date(), p = n => (n < 10 ? '0' + n : String(n));
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
         ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

const MODE_TEXT = {
  base:    { label:'基础模板', cls:'base',    why:'断层约 2 次，与每档递减 2 次的编排一致，按 10RM 开把、跨度 5kg 执行。' },
  regress: { label:'退阶方案', cls:'regress', why:'断层偏大，表明开把档位过高：开把重量整体下调 5kg，优先提升基础容量。' },
  advance: { label:'进阶方案', cls:'advance', why:'断层仅 1–2 次，力量曲线密集：5kg 跨度效率偏低，跨度调整为 10kg。' }
};

function readCfg(){
  const out = { cfg: {} };
  ALL_LIFTS.forEach(k => {
    const unit = $(k + 'Unit').value;
    const rawStep = $(k + 'Step').value;
    out.cfg[k] = {
      tenRM: Math.max(5, Math.min(1000, Number($(k + 'RM').value) || 5)),
      repsAfterStep: Math.max(1, Math.min(10, Math.round(Number($(k + 'Reps').value) || 1))),
      forceMode: $(k + 'ForceMode').value,
      stepOverride: (unit === 'lb' && rawStep !== 'auto') ? String(Number(rawStep) * 2) : rawStep,
      perWeek: Number($(k + 'PerWeek').value),
      unit: unit,
      failThreshold: Math.max(1, Math.min(5, Number($(k + 'Threshold').value) || 2))
    };
  });
  return out;
}

function renderCyclesFor(k, unit, prog){
  const d = prog.decided;
  $('cycles-' + k).innerHTML =
    '<div class="liftbox">' +
      '<div class="lhead">' +
        '<b>' + d.name + '</b>' +
        '<span class="badge ' + MODE_TEXT[d.mode].cls + '">' + MODE_TEXT[d.mode].label + '</span>' +
        '<span class="badge">开把 ' + d.open + unit + ' · 跨度 ' + d.step + unit + '</span>' +
      '</div>' +
      '<div class="cycles" style="margin-top:12px">' +
        prog.cycles.map(cy =>
          '<div class="cyc"><h4>小循环 ' + cy.index + '　开把档 ' + cy.tiers[0].reps + ' 次</h4>' +
          cy.tiers.map(t => '<div class="tier"><span class="tw">' + t.weight + unit +
            '</span><span class="tr">' + t.sets + ' 组 × ' + t.reps + ' 次</span></div>').join('') +
          '</div>').join('') +
      '</div>' +
    '</div>';
}

const CYCLE_CLASS = ['c1', 'c2', 'c3', 'c4'];
const STATE_TEXT = { done:'已达标', failed:'未达标', next:'下一次', planned:'' };

/* 一次训练一个小块，色条跟着所属小循环 */
function sessionBlock(e, nth, total, unit){
  const cls = CYCLE_CLASS[e.cycle - 1], st = e.state;
  return '<div class="ss ' + cls + (st === 'planned' ? '' : ' ' + st) + '">' +
    '<span class="wt">' + e.weight + '<small>' + unit + '</small></span>' +
    '<span class="sch">' + e.sets + ' 组 × ' + e.reps + ' 次</span>' +
    '<span class="cycchip ' + cls + '">小循环 ' + e.cycle + ' · 第 ' + nth + '/' + total + ' 次</span>' +
    (st === 'planned' ? '' : '<span class="st ' + st + '">' + STATE_TEXT[st] + '</span>') +
    (e.regressed ? '<span class="st regress">已下调重量</span>' : '') +
  '</div>';
}

function renderScheduleFor(k, unit, prog, A){
  const box = $('schedule-' + k);
  if (!(A.perWeek > 0)){
    box.innerHTML = '<div class="empty-note">该动作在本轮设为「暂停」，不参与推进。档位完整保留，把「每周训练次数」改回 1–3 次即可继续排期。</div>';
    return;
  }
  const pw = A.perWeek;

  let rows = '';
  for (let i = 0; i < A.totalWeeks; i++){
    const wk = A.weeks[i];
    const slots = (wk && wk.slots) ? wk.slots : [];
    const filled = slots.filter(Boolean);
    const inner = filled.length
      ? slots.map((e, slot) => e ? sessionBlock(e, i * pw + slot + 1, A.timeline.length, unit) : '').join('')
      : '<span class="arcmeta">—</span>';
    rows += '<tr>' +
      '<td class="wkcell"><span class="wknum">第 ' + (i + 1) + ' 周</span>' +
      '<span class="wksub">' + filled.length + ' 次</span></td>' +
      '<td class="sched-cell">' + inner + '</td>' +
    '</tr>';
  }

  const chips = prog.cycles.map(cy => {
    const cls = CYCLE_CLASS[cy.index - 1], t0 = cy.tiers[0];
    return '<div class="tl ' + cls + '"><b>小循环 ' + cy.index + '</b>' +
      '<span>' + cycleWeekRange(A, cy.index) + ' · ' + cy.tiers.length + ' 个重量档</span>' +
      '<span>开把 ' + t0.weight + unit + ' × ' + t0.reps + ' 次</span></div>';
  }).join('');

  let cards = '';
  for (let i = 0; i < A.totalWeeks; i++){
    const wk = A.weeks[i];
    const slots = (wk && wk.slots) ? wk.slots : [];
    let sess = '';
    slots.forEach((e, slot) => {
      if (!e) return;
      const cls = CYCLE_CLASS[e.cycle - 1];
      sess += '<div class="wksess ' + cls + '">' +
        '<div class="wktop">' +
          '<span class="wkname">第 ' + (i * pw + slot + 1) + '/' + A.timeline.length + ' 次</span>' +
          '<span class="wt">' + e.weight + '<small>' + unit + '</small></span>' +
        '</div>' +
        '<div class="wkbot">' +
          '<span class="sch">' + e.sets + ' 组 × ' + e.reps + ' 次</span>' +
          '<span><span class="cycchip ' + cls + '">小循环 ' + e.cycle + '</span>' +
          (e.state === 'planned' ? '' : '<span class="st ' + e.state + '">' + STATE_TEXT[e.state] + '</span>') +
          '</span>' +
        '</div>' +
      '</div>';
    });
    cards += '<div class="wkcard"><div class="wkhead"><b>第 ' + (i + 1) + ' 周</b>' +
      '<span>' + slots.filter(Boolean).length + ' 次</span></div>' + sess + '</div>';
  }

  box.innerHTML =
    '<div class="kpi">' +
      '<div><span>总周数</span><b>' + A.totalWeeks + ' 周</b></div>' +
      '<div><span>每周次数</span><b>' + pw + ' 次</b></div>' +
      '<div><span>计划训练</span><b>' + A.timeline.length + ' 次</b></div>' +
      '<div><span>组间休息</span><b>3 分钟</b></div>' +
    '</div>' +
    '<div class="timeline">' + chips + '</div>' +
    '<div class="tbl only-desktop">' +
      '<table class="sched" style="min-width:520px">' +
        '<thead><tr><th class="wkcol">周次</th><th>' + prog.decided.name + ' · 训练内容</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>' +
    '<div class="only-mobile">' + cards + '</div>';
}

/* 手机端的单条训练记录卡片（记录页与历史轮次明细共用） */
function logItemHtml(r, unit, extraChip){
  return '<div class="logitem">' +
    '<div class="logitem-top">' +
      '<b>' + r.weight + unit + ' × ' + r.sets + ' 组 × ' + r.reps + ' 次</b>' +
      '<span><span class="st ' + (r.completed ? 'done' : 'failed') + '">' +
        (r.completed ? '达标' : '未达标') + '</span>' + (extraChip || '') + '</span>' +
    '</div>' +
    '<div class="logitem-bot">' + r.at + ' · 小循环 ' + r.cycle + ' · 实际 ' +
      ((r.actual === null || r.actual === undefined) ? '—' : r.actual + ' 次') + '</div>' +
  '</div>';
}

function renderLogFor(k, unit, prog, A){
  const d = prog.decided, log = workoutLog[k] || [];
  const drop = LIFT_SPECS[k].regressDrop;

  const next = (A.perWeek === 0)
    ? '<div class="empty-note">该动作在本轮设为「暂停」，不参与推进。把「每周训练次数」改回 1–3 次后即可继续记录。</div>'
    : A.next
    ? '<div class="nextbox">' +
        '<div>' +
          '<div class="nextmeta">下次训练　小循环 ' + A.next.cycle + '　第 ' + (A.nextIndex + 1) + '/' + A.timeline.length + ' 次</div>' +
          '<div class="nextbig">' + A.next.weight + '<small>' + unit + '</small> × ' + A.next.sets + ' 组 × ' + A.next.reps + ' 次</div>' +
        '</div>' +
        '<div class="logrow no-export">' +
          '<div class="field"><label for="actual-' + k + '">实际完成次数（最难一组）</label>' +
            '<input type="number" id="actual-' + k + '" min="0" max="99" step="1" value="' + A.next.reps + '">' +
          '</div>' +
          '<button class="primary" data-log="' + k + '">记录本次训练</button>' +
        '</div>' +
      '</div>' +
      '<div class="logstat">' +
        '<span>达到 <b>' + A.next.reps + '</b> 次 → 下次进入下一档</span>' +
        '<span>少于 <b>' + A.next.reps + '</b> 次 → 下次重做本档</span>' +
      '</div>'
    : '<div class="empty-note">四个小循环已全部执行完毕。可重新测定 10RM 与断层，开始新一轮。</div>';

  const rows = log.map((r, i) => ({ r: r, i: i })).reverse().map(o => {
    const t = A.timeline[o.i] || {};
    return '<tr>' +
      '<td>' + o.r.at + '</td>' +
      '<td>小循环 ' + o.r.cycle + '</td>' +
      '<td>' + o.r.weight + unit + ' × ' + o.r.sets + ' 组 × ' + o.r.reps + ' 次</td>' +
      '<td>' + (o.r.actual === null || o.r.actual === undefined ? '—' : o.r.actual + ' 次') + '</td>' +
      '<td><span class="st ' + (o.r.completed ? 'done' : 'failed') + '">' + (o.r.completed ? '达标' : '未达标') + '</span>' +
        (t.regressed ? '<span class="st regress">重量下调 ' + drop + unit + '</span>' : '') + '</td>' +
    '</tr>';
  }).join('');

  /* 手机端用条目卡片，避免横向滚动时看不到「结果」 */
  const mobileRows = log.slice().reverse().map(r =>
    logItemHtml(r, unit, r.regressed ? '<span class="st regress">下调 ' + drop + unit + '</span>' : '')
  ).join('');

  $('log-' + k).innerHTML =
    '<div class="liftbox">' +
      '<div class="lhead">' +
        '<b>' + d.name + '</b>' +
        '<span class="badge ' + MODE_TEXT[d.mode].cls + '">' + MODE_TEXT[d.mode].label + '</span>' +
        '<span class="badge">开把 ' + d.open + unit + ' · 跨度 ' + d.step + unit + '</span>' +
      '</div>' +
      '<div style="margin-top:12px">' + next + '</div>' +
      '<div class="logstat">' +
        '<span>已记录 <b>' + A.logged + '</b> 次</span>' +
        '<span>达标 <b>' + A.doneCount + '</b> 次</span>' +
        '<span>未达标 <b>' + A.failedCount + '</b> 次</span>' +
        '<span>重量下调 <b>' + A.regressCount + '</b> 次</span>' +
        '<span>剩余 <b>' + (A.timeline.length - A.logged) + '</b> 档</span>' +
      '</div>' +
      (log.length
        ? '<div class="tbl only-desktop" style="margin-top:14px"><table style="min-width:560px">' +
            '<thead><tr><th>时间</th><th>小循环</th><th>要求</th><th>实际</th><th>结果</th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table></div>' +
          '<div class="only-mobile" style="margin-top:12px">' + mobileRows + '</div>' +
          '<div class="actions no-export" style="margin-top:12px">' +
            '<button data-undo="' + k + '">撤销最后一次</button>' +
            '<button data-clear="' + k + '">清空' + d.name + '记录</button>' +
          '</div>'
        : '<div class="empty-note">尚无记录，完成一次训练后回来录入即可。</div>') +
    '</div>';
}

/* ---------- 训练记录的增 / 撤销 / 清空 ---------- */
function adjustedFor(k){
  const { cfg } = readCfg();
  const unit = cfg[k].unit;
  const prog = buildLiftPlan(k, cfg[k], unit);
  const A = applyLog(prog.cycles, workoutLog[k] || [], LIFT_SPECS[k].regressDrop, cfg[k].failThreshold, prog.perWeek);
  return { prog: prog, A: A, unit: unit, cfg: cfg };
}

function recordSession(k){
  const cur = adjustedFor(k);
  if (!cur.A.next || cur.A.perWeek === 0) return;
  const input = $('actual-' + k);
  if (!input || !validActual(input.value)){
    if (input){ input.setCustomValidity('请输入 0–99 之间的整数；未完成可填 0。'); input.reportValidity(); }
    return;
  }
  const actual = Number(input.value);
  workoutLog[k] = (workoutLog[k] || []).concat([{
    at: sessionStamp(),
    cycle: cur.A.next.cycle,
    weight: cur.A.next.weight,
    reps: cur.A.next.reps,
    sets: cur.A.next.sets,
    actual: actual,
    completed: actual >= cur.A.next.reps
  }]);
  const saved = saveLog();
  renderAll();
  if (saved) showNotice(LIFT_NAME[k] + '训练已记录。' + (actual >= cur.A.next.reps ? '已进入下一档。' : '下次安排已更新。'));
}

function undoLast(k){
  if (!workoutLog[k] || !workoutLog[k].length) return;
  workoutLog[k] = workoutLog[k].slice(0, -1);
  saveLog();
  renderAll();
}

function clearLiftLog(k){
  if (!window.confirm('清空' + LIFT_NAME[k] + '本轮的全部训练记录？已归档的历史轮次会保留。')) return;
  workoutLog[k] = [];
  saveLog();
  renderAll();
}

/* ==========================================================================
   标签页：卧推 / 深蹲 / 历史轮次 / 导出
   ========================================================================== */
const TAB_KEY = 'tp-tab';

/* LIFT-VISIBILITY-START: hiding a workspace never removes its training data. */
const LIFTS_KEY = 'tp-lifts';
let enabledLifts = { bench:true, squat:true };
let workspacesInitialized = false;
function loadEnabledLifts(value){
  ALL_LIFTS.forEach(k => { enabledLifts[k] = !value || value[k] !== false; });
}
try { loadEnabledLifts(JSON.parse(localStorage.getItem(LIFTS_KEY) || 'null')); } catch (e) {}
function visibleLifts(){ return ALL_LIFTS.filter(k => enabledLifts[k]); }
function availableTab(name){
  if (name === 'history' || name === 'export') return name;
  return visibleLifts().includes(name) ? name : (visibleLifts()[0] || 'history');
}
function syncLiftVisibility(){
  ALL_LIFTS.forEach(k => {
    $('enable-' + k).checked = enabledLifts[k];
    document.querySelector('[data-tab="' + k + '"]').hidden = !enabledLifts[k];
    document.querySelector('[data-pane="' + k + '"]').hidden = !enabledLifts[k];
    const group = document.querySelector('#exportModules [data-group="' + k + '"]');
    if (group){
      group.hidden = !enabledLifts[k];
      group.querySelectorAll('input').forEach(input => { input.disabled = !enabledLifts[k]; });
    }
  });
  const active = document.querySelector('.tab.active');
  let name = active ? active.getAttribute('data-tab') : visibleLifts()[0];
  if (!workspacesInitialized){
    try { name = localStorage.getItem(TAB_KEY) || name; } catch (e) {}
    workspacesInitialized = true;
  }
  switchTab(name);
}
ALL_LIFTS.forEach(k => $('enable-' + k).addEventListener('change', () => {
  enabledLifts[k] = $('enable-' + k).checked;
  persistLocal(LIFTS_KEY, enabledLifts);
  renderAll();
}));
/* LIFT-VISIBILITY-END */

function switchTab(name){
  const tabs = [].slice.call(document.querySelectorAll('.tab'));
  name = availableTab(name);
  tabs.forEach(b => {
    const active = b.getAttribute('data-tab') === name;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  [].slice.call(document.querySelectorAll('.tabpane'))
    .forEach(p => p.classList.toggle('active', p.getAttribute('data-pane') === name));
  try { localStorage.setItem(TAB_KEY, name); } catch (e) {}
}

/* ==========================================================================
   概览 / 本轮进度 / 历史轮次
   ========================================================================== */
const ARCHIVE_KEY = 'tp-archive';
let archives = [];
/* 历史轮次的管理状态：展开、勾选、待确认删除、正在重命名 */
const openArcs = {};
const pickedArcs = {};
const pendingDel = {};
let renamingId = null;
let batchDeletePending = false;

function loadArchives(){
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    const o = raw ? JSON.parse(raw) : [];
    archives = Array.isArray(o) ? o : [];
  } catch (e) { archives = []; }
}
function saveArchives(){
  persistLocal(ARCHIVE_KEY, archives);
}

function liftSummary(k, cfg){
  const unit = cfg[k].unit;
  const prog = buildLiftPlan(k, cfg[k], unit);
  const A = applyLog(prog.cycles, workoutLog[k] || [], LIFT_SPECS[k].regressDrop, cfg[k].failThreshold, prog.perWeek);
  return { k: k, name: prog.decided.name, unit: unit, prog: prog, A: A, cfg: cfg[k],
           mode: MODE_TEXT[prog.decided.mode] };
}

function renderHero(){
  const { cfg } = readCfg();
  const rows = visibleLifts().map(k => {
    const s = liftSummary(k, cfg);
    const pct = s.A.timeline.length ? Math.round(s.A.logged / s.A.timeline.length * 100) : 0;
    return '<button class="hero-lift" data-goto="' + k + '">' +
      '<span class="hl-top"><span class="hl-name">' + s.name + '</span>' +
        '<span class="badge ' + s.mode.cls + '">' + s.mode.label + '</span></span>' +
      '<span class="hl-prog"><b>' + s.A.logged + '</b> / ' + s.A.timeline.length + ' 次</span>' +
      '<span class="hl-meta">开把 <b>' + s.prog.decided.open + s.unit + '</b> · 跨度 ' +
        s.prog.decided.step + s.unit + ' · ' +
        (s.A.perWeek > 0 ? '每周 ' + s.A.perWeek + ' 次' : '<b>已暂停</b>') +
        (s.A.perWeek === 0 ? ' · 恢复训练后继续' : s.A.next ? ' · 下一次 ' + s.A.next.weight + s.unit + ' × ' + s.A.next.sets + ' 组 × ' + s.A.next.reps + ' 次'
                  : ' · 本轮已完成') + '</span>' +
      '<span class="hl-bar"><i style="width:' + pct + '%"></i></span>' +
    '</button>';
  }).join('');

  $('hero').innerHTML =
    '<div class="hero-top">' +
      '<div>' +
        '<h2>你的训练概览 <span class="section-en">YOUR PROGRESS</span></h2>' +
        '<div class="herometa">各自进步，同样坚持。选择动作，开始今天的训练。</div>' +
      '</div>' +
      '<div class="herometa">' + (archives.length ? '已保存 ' + archives.length + ' 个历史轮次' : '尚无历史轮次') + '</div>' +
    '</div>' +
    '<div class="hero-lifts' + (visibleLifts().length === 1 ? ' single-lift' : '') + '">' +
      (rows || '<p class="empty-note">暂未启用训练动作。打开上方开关即可继续，原有记录仍然保留。</p>') + '</div>';
}

function renderRoundFor(k, unit, prog, A){
  const st = { total: A.timeline.length, logged: A.logged, complete: A.next === null };
  const tag = $('roundTag-' + k);
  const box = $('roundBox-' + k);
  if (!tag || !box) return;
  tag.textContent = st.complete ? '已完成' : '进行中';

  let html = '<div class="progress"><i style="width:' +
      (st.total ? Math.round(st.logged / st.total * 100) : 0) + '%"></i></div>' +
    '<div class="logstat"><span>已完成 <b>' + st.logged + '</b> / ' + st.total + ' 次训练</span>' +
    '<span>剩余 <b>' + (st.total - st.logged) + '</b> 档</span></div>';

  if (st.complete && !state.roundSaved[k]){
    html += '<div class="actions"><button class="primary" data-save-round="' + k + '">保存本轮训练记录</button></div>' +
      '<div class="live">本轮计划已全部执行完毕。保存后可随时在「历史轮次」中查看，并开始新一轮。</div>';
  } else if (state.roundSaved[k]){
    html += '<div class="actions"><button data-new-round="' + k + '">开始新一轮</button></div>' +
      '<div class="live">本轮记录已归档到「历史轮次」。开始新一轮会清空该动作的当前记录，不影响已保存的历史。</div>';
  } else {
    html += '<div class="live">完成全部 ' + st.total + ' 次训练后，即可保存这一整轮的记录。</div>';
  }
  box.innerHTML = html;
}

const stChip = ok => '<span class="st ' + (ok ? 'done' : 'failed') + '">' + (ok ? '达标' : '未达标') + '</span>';

function archiveTitle(a){ return a.title || a.savedAt; }
function safeName(s){ return String(s).replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || '训练记录'; }

/* 一轮的明细（汇总表 + 逐次记录），列表展开与图片导出共用 */
function archiveBodyHtml(a){
  const summary = a.lifts.map(L =>
    '<tr><td>' + L.name + '</td><td>' + L.mode + '</td>' +
    '<td>' + L.open + a.unit + ' → ' + L.peak + a.unit + '</td>' +
    '<td>' + L.sessions + ' 次 / ' + L.weeks + ' 周</td>' +
    '<td>达标 ' + L.done + ' · 未达标 ' + L.failed + ' · 降重 ' + L.regress + '</td></tr>').join('');
  const logs = a.lifts.filter(L => (L.log || []).length).map(L =>
    '<div class="arcmeta" style="margin-top:14px">' + L.name + ' 训练记录</div>' +
    '<div class="tbl only-desktop"><table style="min-width:560px">' +
      '<thead><tr><th>时间</th><th>小循环</th><th>要求</th><th>实际</th><th>结果</th></tr></thead><tbody>' +
      L.log.map(r => '<tr><td>' + r.at + '</td><td>小循环 ' + r.cycle + '</td>' +
        '<td>' + r.weight + a.unit + ' × ' + r.sets + ' 组 × ' + r.reps + ' 次</td>' +
        '<td>' + (r.actual === null || r.actual === undefined ? '—' : r.actual + ' 次') + '</td>' +
        '<td>' + stChip(!!r.completed) + '</td></tr>').join('') +
      '</tbody></table></div>' +
    '<div class="only-mobile">' + L.log.slice().reverse().map(r => logItemHtml(r, a.unit, '')).join('') + '</div>'
  ).join('');
  return '<div class="tbl" style="margin-top:12px"><table style="min-width:560px">' +
      '<thead><tr><th>动作</th><th>模式</th><th>开把 → 最高</th><th>规模</th><th>结果</th></tr></thead>' +
      '<tbody>' + summary + '</tbody></table></div>' + logs;
}

function pickedList(){ return archives.filter(a => pickedArcs[a.id]); }
function logCount(a){ return a.lifts.reduce((s, L) => s + ((L.log || []).length), 0); }

function renderHistory(){
  const box = $('historyBox');
  if (!archives.length){
    box.innerHTML = '<div class="empty-note">还没有保存的轮次。完成一整轮训练后，在「训练记录」页点击「保存本轮训练记录」即可归档。</div>';
    return;
  }
  const picked = pickedList().length;
  const allPicked = picked === archives.length;

  let html = '<div class="arc-tools">' +
    '<span class="arcmeta">共 <b>' + archives.length + '</b> 轮' +
      (picked ? ' · 已选 <b>' + picked + '</b> 轮' : '') + '</span>' +
    '<button data-arc-pickall="1">' + (allPicked ? '取消全选' : '全选') + '</button>' +
    '<button data-arc-bcsv="1"' + (picked ? '' : ' disabled') + '>批量导出 CSV</button>' +
    '<button data-arc-bjson="1"' + (picked ? '' : ' disabled') + '>批量导出 JSON</button>' +
    (batchDeletePending
      ? '<span class="arc-confirm">确定删除选中的 ' + picked + ' 轮？' +
          '<button data-arc-bdelgo="1" class="dangerish">确认删除</button>' +
          '<button data-arc-bdelcancel="1">取消</button></span>'
      : '<button data-arc-bdel="1" class="dangerish"' + (picked ? '' : ' disabled') + '>批量删除</button>') +
  '</div>';

  html += archives.map(a => {
    const isOpen = !!openArcs[a.id];
    const isPick = !!pickedArcs[a.id];
    const renaming = (renamingId === a.id);

    const title = renaming
      ? '<input class="arc-rename" id="rename-' + a.id + '" value="' + escapeHtml(archiveTitle(a)) + '" maxlength="60">'
      : '<b>' + escapeHtml(archiveTitle(a)) + '</b>';

    const acts = pendingDel[a.id]
      ? '<span class="arc-confirm">删除这一轮？' +
          '<button data-arc-delgo="' + a.id + '" class="dangerish">确认删除</button>' +
          '<button data-arc-delcancel="' + a.id + '">取消</button></span>'
      : '<button data-arc-toggle="' + a.id + '">' + (isOpen ? '收起' : '展开') + '</button>' +
        (renaming
          ? '<button data-arc-renamesave="' + a.id + '">保存名称</button>'
          : '<button data-arc-rename="' + a.id + '">重命名</button>') +
        '<button data-arc-png="' + a.id + '">导出图片</button>' +
        '<button data-arc-csv="' + a.id + '">导出 CSV</button>' +
        '<button data-arc-json="' + a.id + '">导出 JSON</button>' +
        '<button data-arc-del="' + a.id + '" class="dangerish">删除</button>';

    return '<div class="arc' + (isOpen ? ' open' : '') + (isPick ? ' picked' : '') + '">' +
      '<div class="arc-head">' +
        '<label class="arc-pick"><input type="checkbox" data-arc-pick="' + a.id + '"' + (isPick ? ' checked' : '') + '></label>' +
        '<div class="arc-title">' + title +
          '<span class="arcmeta">' + a.lifts.map(L => L.name).join(' + ') +
            ' · 共 ' + logCount(a) + ' 次训练 · 保存于 ' + a.savedAt + '</span>' +
        '</div>' +
        '<div class="arc-acts">' + acts + '</div>' +
      '</div>' +
      '<div class="arc-body">' + archiveBodyHtml(a) + '</div>' +
    '</div>';
  }).join('');

  box.innerHTML = html;

  if (renamingId){
    const el = $('rename-' + renamingId);
    if (el){ el.focus(); if (el.select) el.select(); }
  }
}

/* ---------- 归档操作 ---------- */
function saveRound(k){
  const { cfg } = readCfg();
  const s = liftSummary(k, cfg);
  const entry = {
    id: 'r' + Date.now() + '-' + k,
    title: s.name + ' 第 ' + (archives.filter(a => (a.lifts || []).some(L => L.key === k)).length + 1) + ' 轮 · ' + sessionStamp(),
    savedAt: sessionStamp(),
    unit: s.unit,
    threshold: s.cfg.failThreshold,
    lifts: [{
      key: k, name: s.name, mode: s.mode.label,
      tenRM: s.prog.decided.tenRM, open: s.prog.decided.open, step: s.prog.decided.step,
      sessions: s.A.timeline.length, done: s.A.doneCount, failed: s.A.failedCount,
      regress: s.A.regressCount, weeks: s.A.totalWeeks,
      peak: s.A.timeline.reduce((m, t) => Math.max(m, t.weight), 0),
      log: (workoutLog[k] || []).slice()
    }]
  };
  archives.unshift(entry);
  saveArchives();
  state.roundSaved[k] = true;
  renderAll();
  switchTab('history');
}

function startNewRound(k){
  workoutLog[k] = [];
  saveLog();
  state.roundSaved[k] = false;
  renderAll();
  switchTab(k);
}

function toggleArc(id){ openArcs[id] = !openArcs[id]; renderAll(); }
function togglePick(id){ pickedArcs[id] = !pickedArcs[id]; renderAll(); }
function pickAll(){
  const all = archives.every(a => pickedArcs[a.id]);
  archives.forEach(a => { pickedArcs[a.id] = !all; });
  renderAll();
}
function commitRename(id){
  const a = archives.filter(x => x.id === id)[0];
  const el = $('rename-' + id);
  if (a && el){
    const v = String(el.value || '').trim();
    a.title = v || a.savedAt;
    saveArchives();
    setMsg('已重命名为「' + a.title + '」。', 'ok');
  }
  renamingId = null;
  renderAll();
}
function doDelete(id){
  archives = archives.filter(a => a.id !== id);
  delete pickedArcs[id]; delete openArcs[id]; delete pendingDel[id];
  saveArchives();
  renderAll();
  setMsg('已删除该轮记录。', 'ok');
}
function doBatchDelete(){
  const ids = pickedList().map(a => a.id);
  archives = archives.filter(a => ids.indexOf(a.id) < 0);
  ids.forEach(id => { delete pickedArcs[id]; delete openArcs[id]; delete pendingDel[id]; });
  batchDeletePending = false;
  saveArchives();
  renderAll();
  setMsg('已删除 ' + ids.length + ' 轮记录。', 'ok');
}

/* 导出：CSV / JSON / 图片。JSON 与导出页的备份格式一致，可直接再导入 */
function pushArchiveRows(a, rows){
  (a.lifts || []).forEach(L => (L.log || []).forEach(r => {
    rows.push([archiveTitle(a), L.name, L.mode, a.unit, r.at, '小循环' + r.cycle, r.weight, r.sets, r.reps,
               (r.actual === null || r.actual === undefined) ? '' : r.actual,
               r.completed ? '达标' : '未达标']);
  }));
}
const ARCHIVE_CSV_HEAD = ['轮次', '动作', '模式', '单位', '时间', '小循环', '重量', '组数', '要求次数', '实际次数', '结果'];

function writeCsv(name, rows){
  const csv = '\ufeff' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  downloadBlob(new Blob([csv], { type:'text/csv;charset=utf-8' }), name);
}

function archiveCsv(id){
  const a = archives.filter(x => x.id === id)[0];
  if (!a) return;
  const rows = [ARCHIVE_CSV_HEAD.slice()];
  pushArchiveRows(a, rows);
  if (rows.length <= 1){ setMsg('该轮次没有可导出的训练记录。', 'err'); return; }
  writeCsv('训练记录_' + safeName(archiveTitle(a)) + '.csv', rows);
  setMsg('已导出「' + archiveTitle(a) + '」的 CSV。', 'ok');
}

function batchCsv(){
  const sel = pickedList();
  if (!sel.length) return;
  const rows = [ARCHIVE_CSV_HEAD.slice()];
  sel.forEach(a => pushArchiveRows(a, rows));
  if (rows.length <= 1){ setMsg('选中的轮次没有可导出的训练记录。', 'err'); return; }
  writeCsv('训练记录_合并' + sel.length + '轮.csv', rows);
  setMsg('已导出 ' + sel.length + ' 轮的 CSV。', 'ok');
}

function archiveJson(id){
  const a = archives.filter(x => x.id === id)[0];
  if (!a) return;
  downloadBlob(new Blob([JSON.stringify({
    app:'阶梯递进力量计划生成器', version: BACKUP_VERSION, exportedAt: sessionStamp(),
    logs: {}, archives: [a]
  }, null, 2)], { type:'application/json;charset=utf-8' }),
    '训练记录_' + safeName(archiveTitle(a)) + '.json');
  setMsg('已导出该轮 JSON，可在「导出」页导入还原。', 'ok');
}

function batchJson(){
  const sel = pickedList();
  if (!sel.length) return;
  downloadBlob(new Blob([JSON.stringify({
    app:'阶梯递进力量计划生成器', version: BACKUP_VERSION, exportedAt: sessionStamp(),
    logs: {}, archives: sel
  }, null, 2)], { type:'application/json;charset=utf-8' }),
    '训练记录_' + sel.length + '轮.json');
  setMsg('已导出 ' + sel.length + ' 轮的 JSON。', 'ok');
}

function exportArchivePng(id){
  const a = archives.filter(x => x.id === id)[0];
  if (!a) return;
  setMsg('正在生成图片，请稍候…');
  renderCanvasFrom(vars => {
    const root = document.createElement('div');
    root.className = 'export-root';
    root.style.width = '1160px';
    Object.keys(vars).forEach(k => root.style.setProperty(k, vars[k]));
    const head = document.createElement('div');
    head.className = 'export-head';
    head.innerHTML = '<b>' + escapeHtml(archiveTitle(a)) + '</b>' +
      '<span>' + escapeHtml(a.savedAt) + ' · 共 ' + logCount(a) + ' 次训练</span>';
    root.appendChild(head);
    const sec = document.createElement('section');
    sec.className = 'card';
    sec.innerHTML = archiveBodyHtml(a);
    /* 导出为固定宽度文档，去掉仅手机端显示的卡片副本 */
    [].slice.call(sec.querySelectorAll('.only-mobile, .no-export')).forEach(n => n.parentNode.removeChild(n));
    root.appendChild(sec);
    return root;
  }, Number($('pngScale').value) || 2, $('pngBg').value).then(canvas => {
    canvas.toBlob(blob => {
      if (!blob){ setMsg('图片生成失败。', 'err'); return; }
      downloadBlob(blob, '训练记录_' + safeName(archiveTitle(a)) + '.png');
      setMsg('已导出图片，尺寸 ' + canvas.width + ' × ' + canvas.height + ' 像素。', 'ok');
    }, 'image/png');
  }).catch(e => setMsg('图片导出失败（' + e.message + '）。', 'err'));
}

/* ==========================================================================
   数据备份与转移（设定 + 训练记录 + 历史轮次 打包成 JSON）
   ========================================================================== */
const BACKUP_VERSION = 1;
const SETTING_IDS = ['benchRM','squatRM','benchReps','squatReps',
  'benchForceMode','squatForceMode','benchStep','squatStep','benchUnit','squatUnit',
  'benchPerWeek','squatPerWeek','benchThreshold','squatThreshold'];
/* 合法取值：载入时过滤掉损坏或过期的值 */
const SETTING_OPTIONS = {
  unit: ['kg','lb'], forceMode: ['auto','base','regress','advance'], stepOverride: ['auto','5','10']
};
const PER_LIFT_OPTIONS = {
  ForceMode: ['auto','base','regress','advance'],
  Step: ['auto','5','10'],
  Unit: ['kg','lb'],
  PerWeek: ['0','1','2','3'],
  Threshold: ['1','2','3']
};
/* 旧版是全局的 forceMode / stepOverride / unit / failThreshold，首次升级时摊给两个动作 */
function migrateLegacy(s){
  if (!s || typeof s !== 'object') return s;
  const out = Object.assign({}, s);
  ALL_LIFTS.forEach(k => {
    if (out[k + 'ForceMode'] === undefined && s.forceMode !== undefined) out[k + 'ForceMode'] = s.forceMode;
    if (out[k + 'Step'] === undefined && s.stepOverride !== undefined) out[k + 'Step'] = s.stepOverride;
    if (out[k + 'Unit'] === undefined && s.unit !== undefined) out[k + 'Unit'] = s.unit;
    if (out[k + 'Threshold'] === undefined && s.failThreshold !== undefined) out[k + 'Threshold'] = String(s.failThreshold);
    if (out[k + 'Threshold'] === undefined && legacyThreshold !== null) out[k + 'Threshold'] = String(legacyThreshold);
  });
  return out;
}
const SETTINGS_KEY = 'tp-settings';
let pendingBackup = null;

function saveSettings(){
  const s = {};
  SETTING_IDS.forEach(id => { const el = $(id); if (el) s[id] = el.value; });
  persistLocal(SETTINGS_KEY, s);
}

function loadSettings(){
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (e) { s = null; }
  if (!s || typeof s !== 'object') return;
  applySettingsToInputs(s);
}

function applySettingsToInputs(s){
  ALL_LIFTS.forEach(k => {
    ['RM','Reps','ForceMode','Step','Unit','PerWeek','Threshold'].forEach(field => {
      const id = k + field, el = $(id);
      if (!el) return;
      const raw = s[id];
      if (raw === undefined || raw === null || raw === '') return;
      const v = String(raw);
      const allowed = PER_LIFT_OPTIONS[field];
      if (allowed && allowed.indexOf(v) < 0) return;
      el.value = v;
    });
  });
}

function collectBackup(){
  const settings = {};
  SETTING_IDS.forEach(id => { const el = $(id); if (el) settings[id] = el.value; });
  settings.theme = themeMode;
  settings.enabledLifts = Object.assign({}, enabledLifts);
  return {
    app: '阶梯递进力量计划生成器',
    version: BACKUP_VERSION,
    exportedAt: sessionStamp(),
    settings: settings,
    logs: { bench: (workoutLog.bench || []).slice(), squat: (workoutLog.squat || []).slice() },
    archives: archives.slice()
  };
}

function backupSummary(){
  return {
    logs: ALL_LIFTS.reduce((a, k) => a + ((workoutLog[k] || []).length), 0),
    archives: archives.length
  };
}

function renderBackupInfo(){
  const el = $('backupInfo');
  if (!el) return;
  const st = backupSummary();
  const kb = Math.max(1, Math.round(JSON.stringify(collectBackup(), null, 2).length / 1024));
  el.innerHTML = '本机现有数据：训练记录 <b>' + st.logs + '</b> 条，历史轮次 <b>' + st.archives +
    '</b> 个，备份文件约 <b>' + kb + ' KB</b>。';
}

function exportBackup(){
  const st = backupSummary();
  downloadBlob(new Blob([JSON.stringify(collectBackup(), null, 2)], { type:'application/json;charset=utf-8' }),
    '阶梯递进力量计划_备份_' + sessionStamp().replace(/[:\s]/g, '-') + '.json');
  setMsg('已导出备份：训练记录 ' + st.logs + ' 条、历史轮次 ' + st.archives + ' 个。', 'ok');
}

/* 覆盖导入时才套用备份里的设定，合并导入保持当前设定不变 */
function applyBackupSettings(s){
  applySettingsToInputs(s);
  loadEnabledLifts(s.enabledLifts);
  persistLocal(LIFTS_KEY, enabledLifts);
  if (['auto', 'light', 'dark'].includes(s.theme)){
    applyTheme(s.theme);
    try { localStorage.setItem(THEME_KEY, s.theme); } catch (e) {}
  }
  saveSettings();
}

/* 合并导入时用这条指纹去重，重复导入同一个文件不会产生重复记录 */
function logKey(r){
  return [r.at, r.cycle, r.weight, r.reps, r.sets, r.actual, r.completed ? 1 : 0].join('|');
}

function applyBackup(data, mode){
  validateBackup(data);
  const inLogs = data.logs || {};
  const inArc = Array.isArray(data.archives) ? data.archives : [];

  if (mode === 'replace'){
    ALL_LIFTS.forEach(k => { workoutLog[k] = Array.isArray(inLogs[k]) ? inLogs[k].slice() : []; });
    archives = inArc.slice();
    if (data.settings) applyBackupSettings(data.settings);
  } else {
    ALL_LIFTS.forEach(k => {
      const cur = workoutLog[k] || [];
      const seen = {};
      cur.forEach(r => { seen[logKey(r)] = true; });
      const add = [];
      (Array.isArray(inLogs[k]) ? inLogs[k] : []).forEach(r => {
        const key = logKey(r);
        if (!seen[key]){ seen[key] = true; add.push(r); }
      });
      workoutLog[k] = cur.concat(add)
        .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
    });
    const arcSeen = {};
    archives.forEach(a => { arcSeen[a.id] = true; });
    inArc.forEach(a => { if (a && a.id && !arcSeen[a.id]){ archives.push(a); arcSeen[a.id] = true; } });
    archives.sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
  }
  saveLog();
  saveArchives();
  ALL_LIFTS.forEach(k => { state.roundSaved[k] = false; });
  renderAll();
}

function buildRulesFor(k, cfg){
  const drop = LIFT_SPECS[k].regressDrop;
  const name = LIFT_NAME[k];
  return [
    '<b>每次训练结束后录入结果</b>：在「' + name + ' · 训练记录与调整」中填写实际完成次数，后续日程随即重算。未录入时，剩余档位按全部达标推演。',
    '<b>达标</b>（完成规定次数）→ 按计划进入下一重量档。',
    '<b>未达标</b> → 下一次重复同一重量档，不加重。',
    '<b>同一档位连续 ' + cfg.failThreshold + ' 次未达标</b> → 重量下调 ' + drop + 'kg，并从当前小循环的开把档重新执行。',
    '<b>组间休息固定为 3 分钟</b>，不应压缩。',
    '<b>退阶属于计划组成部分，并非失败</b>：下调重量重新递进后，通常可回到原档位继续进阶。'
  ];
}

/* 判定标准与示例：全部依据已录入的 10RM 实时计算 */
function renderRefFor(k, unit, cfg, prog){
  const s = LIFT_SPECS[k];
  const W = cfg.tenRM;
  const rows = [];
  const bands = [
    { label:'≥ ' + s.regressGap, mode:'regress', open:W - s.regressDrop, step:s.baseStep },
    { label:(k === 'bench' ? '= 2' : (s.advanceGap + 1) + ' ~ ' + (s.regressGap - 1)), mode:'base', open:W, step:s.baseStep },
    { label:'≤ ' + s.advanceGap, mode:'advance', open:W, step:s.advanceStep }
  ];
  bands.forEach(b => {
    const mt = MODE_TEXT[b.mode];
    rows.push('<tr>' +
      '<td><b>' + b.label + '</b></td>' +
      '<td><span class="badge ' + mt.cls + '">' + mt.label + '</span></td>' +
      '<td>开把 <b>' + b.open + unit + '</b>，跨度 ' + b.step + unit + '</td>' +
    '</tr>');
  });

  const exRows = [];
  const nextW = W + s.measureStep;
  const decided = prog.decided;
  const branches = [
    { mode:'regress', reps:10 - s.regressGap,       open:W - s.regressDrop, step:s.baseStep },
    { mode:'base',    reps:10 - (s.regressGap - 1), open:W,                 step:s.baseStep },
    { mode:'advance', reps:10 - s.advanceGap,       open:W,                 step:s.advanceStep }
  ];
  branches.forEach(b => {
    const mt = MODE_TEXT[b.mode];
    const mine = (b.mode === decided.mode);
    const reps = mine ? cfg.repsAfterStep : b.reps;
    exRows.push('<tr' + (mine ? ' class="mine"' : '') + '>' +
      '<td>' + W + unit + ' × 10</td>' +
      '<td>' + nextW + unit + ' × ' + reps + '</td>' +
      '<td><b>' + (10 - reps) + '</b></td>' +
      '<td><span class="badge ' + mt.cls + '">' + mt.label + '</span>' +
        (mine ? ' <span class="badge">当前输入</span>' : '') + '</td>' +
      '<td>开把 <b>' + b.open + unit + '</b>，跨度 ' + b.step + unit + '</td>' +
    '</tr>');
  });

  $('refBox-' + k).innerHTML =
    '<h3>判定标准（每 ' + s.measureStep + unit + ' 一档，重量按已录入的 10RM 计算）</h3>' +
    '<table><thead><tr><th>断层</th><th>判定</th><th>执行方案</th></tr></thead>' +
    '<tbody>' + rows.join('') + '</tbody></table>' +
    '<h3 style="margin-top:18px">示例：以当前 10RM 为基准的三种判定结果</h3>' +
    '<table><thead><tr><th>当前 10RM</th><th>递增一档后</th><th>断层</th><th>判定</th><th>执行方案</th></tr></thead>' +
    '<tbody>' + exRows.join('') + '</tbody></table>';
}

/* 第 3 步算式：直接引用已录入数值 */
function renderGapExampleFor(k, cfg, unit){
  const el = $('gapExample-' + k);
  if (!el) return;
  const s = LIFT_SPECS[k];
  const W = cfg.tenRM, reps = cfg.repsAfterStep;
  el.innerHTML = '当前输入：' + LIFT_NAME[k] + ' 10RM = <b>' + W + unit + '</b>，递增至 <b>' +
    (W + s.measureStep) + unit + '</b> 完成 <b>' + reps + ' 次</b>　→　断层 = 10 − ' + reps +
    ' = <b>' + (10 - reps) + '</b>';
}

/* 输入框下方的判定结果 */
function renderLiveFor(k, prog, unit){
  const el = $('live-' + k);
  if (!el) return;
  const d = prog.decided, mt = MODE_TEXT[d.mode];
  el.innerHTML =
    '断层 = 10 − ' + d.repsAfterStep + ' = <b>' + d.gap + '</b>　判定：' +
    '<span class="badge ' + mt.cls + '">' + mt.label + '</span><br>' +
    '开把重量 <b>' + d.open + unit + '</b> · 跨度 <b>' + d.step + unit + '</b>' +
    '<span class="whylite"><br>' + mt.why + '</span>';
}

function renderAll(){
  const { cfg } = readCfg();
  ALL_LIFTS.forEach(k => {
    const unit = cfg[k].unit;
    const prog = buildLiftPlan(k, cfg[k], unit);
    const A = applyLog(prog.cycles, workoutLog[k] || [], LIFT_SPECS[k].regressDrop, cfg[k].failThreshold, prog.perWeek);
    renderGapExampleFor(k, cfg[k], unit);
    renderLiveFor(k, prog, unit);
    renderRefFor(k, unit, cfg[k], prog);
    renderCyclesFor(k, unit, prog);
    renderScheduleFor(k, unit, prog, A);
    renderLogFor(k, unit, prog, A);
    renderRoundFor(k, unit, prog, A);
    const rt = $('rules-' + k);
    if (rt) rt.innerHTML = buildRulesFor(k, cfg[k]).map(r => '<li>' + r + '</li>').join('');
    const ct = $('cadenceTag-' + k);
    if (ct) ct.textContent = (A.perWeek > 0 ? '每周 ' + A.perWeek + ' 练' : '已暂停');
  });
  renderHero();
  renderHistory();
  renderBackupInfo();
  syncLiftVisibility();
  return cfg;
}

/* ==========================================================================
   主题切换
   ========================================================================== */
const THEME_KEY = 'tp-theme';
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
let themeMode = 'auto';

function currentTheme(){
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}
function applyTheme(t){
  themeMode = ['auto', 'light', 'dark'].includes(t) ? t : 'auto';
  const resolved = themeMode === 'auto' ? (systemTheme.matches ? 'dark' : 'light') : themeMode;
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
  $('themeColor').setAttribute('content', resolved === 'dark' ? '#111a18' : '#f5f6f2');
  $('btnTheme').value = themeMode;
}
(function initTheme(){
  let saved = 'auto';
  try { saved = localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) {}
  applyTheme(saved);
  $('btnTheme').addEventListener('change', () => {
    const next = $('btnTheme').value;
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  });
  const followSystem = () => { if (themeMode === 'auto') applyTheme('auto'); };
  if (systemTheme.addEventListener) systemTheme.addEventListener('change', followSystem);
  else systemTheme.addListener(followSystem);
})();

/* ==========================================================================
   导出
   ========================================================================== */
const EXPORT_DARK_VARS = {
  '--bg':'#0f1115','--panel':'#171a21','--panel2':'#1e222b','--line':'#2a2f3a',
  '--text':'#e8eaf0','--muted':'#98a0b3','--accent':'#4f8cff','--accent2':'#33d69f',
  '--warn':'#ffb454','--danger':'#ff6b6b','--violet':'#8a7cff',
  '--cyc1':'#4f8cff','--cyc2':'#33d69f','--cyc3':'#8a7cff','--cyc4':'#ffb454',
  '--chip1':'#9dc0ff','--chip2':'#a8e6c9','--chip3':'#cfc7ff','--chip4':'#ffd0a3',
  '--b-base-fg':'#9dc0ff','--b-base-bd':'rgba(79,140,255,.5)','--b-base-bg':'rgba(79,140,255,.12)',
  '--b-reg-fg':'#ffd0a3','--b-reg-bd':'rgba(255,180,84,.5)','--b-reg-bg':'rgba(255,180,84,.12)',
  '--b-adv-fg':'#a8e6c9','--b-adv-bd':'rgba(51,214,159,.5)','--b-adv-bg':'rgba(51,214,159,.12)',
  '--shadow':'0 1px 2px rgba(0,0,0,.35), 0 10px 28px rgba(0,0,0,.22)'
};
const EXPORT_LIGHT_VARS = {
  '--bg':'#ffffff','--panel':'#ffffff','--panel2':'#f5f6f8','--line':'#d5d8de',
  '--text':'#111827','--muted':'#5a6473','--accent':'#1b62d6','--accent2':'#0a7a52',
  '--warn':'#a05a00','--danger':'#c0392b','--violet':'#5b4bc4',
  '--cyc1':'#1b62d6','--cyc2':'#0a7a52','--cyc3':'#5b4bc4','--cyc4':'#a05a00',
  '--chip1':'#1b62d6','--chip2':'#0a7a52','--chip3':'#5b4bc4','--chip4':'#a05a00',
  '--b-base-fg':'#1b62d6','--b-base-bd':'rgba(27,98,214,.45)','--b-base-bg':'rgba(27,98,214,.10)',
  '--b-reg-fg':'#a05a00','--b-reg-bd':'rgba(160,90,0,.45)','--b-reg-bg':'rgba(160,90,0,.10)',
  '--b-adv-fg':'#0a7a52','--b-adv-bd':'rgba(10,122,82,.45)','--b-adv-bg':'rgba(10,122,82,.10)',
  '--shadow':'0 1px 2px rgba(16,24,40,.06), 0 10px 28px rgba(16,24,40,.07)'
};
const EXPORT_VAR_NAMES = ['--bg','--panel','--panel2','--line','--text','--muted','--accent',
  '--accent2','--warn','--danger','--violet','--cyc1','--cyc2','--cyc3','--cyc4','--radius',
  '--chip1','--chip2','--chip3','--chip4',
  '--b-base-fg','--b-base-bd','--b-base-bg','--b-reg-fg','--b-reg-bd','--b-reg-bg',
  '--b-adv-fg','--b-adv-bd','--b-adv-bg','--shadow'];

function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
}
function setMsg(text, kind){
  const el = $('exportMsg');
  el.className = 'expmsg' + (kind ? ' ' + kind : '');
  el.textContent = text;
}
function selectedModules(){
  return [].slice.call(document.querySelectorAll('#exportModules input[type=checkbox]'))
    .filter(c => c.checked && !c.disabled)
    .map(c => document.getElementById(c.getAttribute('data-mod')))
    .filter(Boolean);
}
function exportFileName(){
  return '阶梯递进力量计划_' + ALL_LIFTS.map(k => LIFT_SPECS[k].name).join('+');
}
function readLiveVars(){
  const cs = getComputedStyle(document.documentElement), out = {};
  EXPORT_VAR_NAMES.forEach(n => { const v = cs.getPropertyValue(n).trim(); if (v) out[n] = v; });
  return out;
}
/* auto 跟随页面主题；dark / light 固定，不受页面主题影响 */
function exportVars(mode){
  if (mode === 'light') return EXPORT_LIGHT_VARS;
  if (mode === 'dark') return EXPORT_DARK_VARS;
  return readLiveVars();
}

/* 将输入框当前值写回 HTML 属性，否则序列化结果仍为初始值 */
function syncFormValues(){
  document.querySelectorAll('#mod-setup input, #mod-setup select, #mod-gap input, #mod-gap select').forEach(el => {
    if (el.tagName === 'SELECT'){
      [].forEach.call(el.options, o => o.removeAttribute('selected'));
      if (el.options[el.selectedIndex]) el.options[el.selectedIndex].setAttribute('selected', '');
    } else if (el.type === 'number' || el.type === 'text'){
      el.setAttribute('value', el.value);
    }
  });
}

function buildExportRoot(mods, vars){
  const root = document.createElement('div');
  root.className = 'export-root';
  root.style.width = '1160px';
  Object.keys(vars).forEach(k => root.style.setProperty(k, vars[k]));

  const head = document.createElement('div');
  head.className = 'export-head';
  head.innerHTML = '<b>' + escapeHtml($('pngTitle').value || '训练计划') + '</b>' +
                   '<span>' + new Date().toLocaleDateString('zh-CN') + '</span>';
  root.appendChild(head);

  mods.forEach(m => {
    const sec = document.createElement('section');
    sec.className = 'card';
    sec.innerHTML = m.innerHTML;
    sec.querySelectorAll('details').forEach(detail => { detail.open = true; });
    /* 导出为固定宽度的桌面文档，去掉仅手机端显示的副本 */
    [].slice.call(sec.querySelectorAll('.only-mobile, .no-export')).forEach(n => n.parentNode.removeChild(n));
    root.appendChild(sec);
  });
  return root;
}

/* 以 SVG foreignObject 将 DOM 光栅化到 canvas：不依赖任何外部库，离线可用。
   buildRoot(vars) 返回待光栅化的根节点，单轮归档图片也走这条路径。 */
function renderCanvasFrom(buildRoot, scale, bgMode){
  return new Promise((resolve, reject) => {
    syncFormValues();
    const vars = exportVars(bgMode);

    /* 先捕获页面 CSS（必须在插入导出节点之前，否则会捕获到导出节点自身的样式） */
    const css = Array.from(document.styleSheets).map(sheet =>
      Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n')
    ).join('\n');

    const root = buildRoot(vars);
    /* 由外层 holder 负责移出可视区域；root 自身样式必须保持干净，
       否则 position:fixed;left:-20000px 会被一并序列化进 SVG，导出结果为空图 */
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-20000px;top:0;';
    holder.appendChild(root);
    document.body.appendChild(holder);

    /* 样式必须随 DOM 进入 SVG，否则导出结果为无样式的裸 HTML */
    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    root.insertBefore(styleEl, root.firstChild);

    const rect = root.getBoundingClientRect();
    const w = Math.ceil(rect.width), h = Math.ceil(rect.height);

    /* 必须使用 XMLSerializer：outerHTML 中 <input> <br> 等非自闭合标签会使 SVG 解析失败 */
    const inner = new XMLSerializer().serializeToString(root);
    document.body.removeChild(holder);

    if (!w || !h) { reject(new Error('内容尺寸为 0')); return; }

    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
        '<foreignObject x="0" y="0" width="' + w + '" height="' + h + '">' +
          inner +
        '</foreignObject>' +
      '</svg>';

    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = vars['--bg'] || '#0f1115';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas);
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('浏览器拒绝了图片渲染'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

/* 计划模块的图片导出 */
function renderExportCanvas(mods, scale, bgMode){
  return renderCanvasFrom(vars => buildExportRoot(mods, vars), scale, bgMode);
}

function downloadBlob(blob, filename){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function exportPng(){
  const mods = selectedModules();
  if (!mods.length){ setMsg('请至少勾选一个模块后再执行导出。', 'err'); return; }
  setMsg('正在生成图片，请稍候…');
  try {
    const scale = Number($('pngScale').value) || 2;
    const canvas = await renderExportCanvas(mods, scale, $('pngBg').value);
    await new Promise((resolve) => {
      canvas.toBlob(blob => {
        if (!blob){ setMsg('图片生成失败，可改用「打印 / 导出 PDF」。', 'err'); resolve(); return; }
        downloadBlob(blob, exportFileName() + '.png');
        setMsg('已导出 ' + mods.length + ' 个模块，图片尺寸 ' + canvas.width + ' × ' + canvas.height + ' 像素。', 'ok');
        resolve();
      }, 'image/png');
    });
  } catch (e) {
    setMsg('图片导出失败（' + e.message + '）。可改用「打印 / 导出 PDF」，输出内容一致。', 'err');
  }
}

function exportPrint(){
  const mods = selectedModules();
  document.querySelectorAll('.mod').forEach(m => m.classList.toggle('hide-print', mods.indexOf(m) < 0));
  window.print();
}
window.addEventListener('afterprint', () => {
  document.querySelectorAll('.mod').forEach(m => m.classList.remove('hide-print'));
});

function exportCsv(){
  const mods = selectedModules();
  const { cfg } = readCfg();
  const picked = id => mods.some(m => m.id === id);
  const any = ALL_LIFTS.some(k => picked('mod-cycles-' + k) || picked('mod-schedule-' + k) || picked('mod-log-' + k));
  if (!any){
    setMsg('CSV 数据取自各动作的「小循环编排」「周训练日程」「训练记录」，请至少勾选一项。', 'err');
    return;
  }
  const stText = { done:'已达标', failed:'未达标', next:'下一次', planned:'计划中' };
  const rows = [];

  ALL_LIFTS.forEach(k => {
    const unit = cfg[k].unit;
    const prog = buildLiftPlan(k, cfg[k], unit);
    const A = applyLog(prog.cycles, workoutLog[k] || [], LIFT_SPECS[k].regressDrop, cfg[k].failThreshold, prog.perWeek);

    if (picked('mod-schedule-' + k) && A.perWeek > 0){
      if (rows.length) rows.push([]);
      rows.push([prog.decided.name + ' · 周训练日程（每周 ' + A.perWeek + ' 次）']);
      rows.push(['周次','第几次训练','重量(' + unit + ')','组数','次数','小循环','状态']);
      for (let i = 0; i < A.totalWeeks; i++){
        const wk = A.weeks[i];
        if (!wk) continue;
        wk.slots.forEach((sl, slot) => {
          if (!sl) return;
          rows.push(['第' + (i + 1) + '周', i * A.perWeek + slot + 1, sl.weight, sl.sets, sl.reps,
                     '小循环' + sl.cycle, stText[sl.state] || '']);
        });
      }
    }
    if (picked('mod-cycles-' + k)){
      if (rows.length) rows.push([]);
      rows.push([prog.decided.name + ' · 小循环组次编排']);
      rows.push(['小循环','重量(' + unit + ')','组数','次数','模式']);
      prog.cycles.forEach(cy => cy.tiers.forEach(t => {
        rows.push(['小循环' + cy.index, t.weight, t.sets, t.reps, MODE_TEXT[prog.decided.mode].label]);
      }));
    }
    if (picked('mod-log-' + k)){
      if (rows.length) rows.push([]);
      rows.push([prog.decided.name + ' · 训练记录']);
      rows.push(['时间','小循环','重量(' + unit + ')','组数','要求次数','实际次数','结果']);
      (workoutLog[k] || []).forEach(r => rows.push([r.at, '小循环' + r.cycle, r.weight, r.sets, r.reps,
        (r.actual === null || r.actual === undefined) ? '' : r.actual, r.completed ? '达标' : '未达标']));
    }
  });

  const csv = '\ufeff' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  downloadBlob(new Blob([csv], { type:'text/csv;charset=utf-8' }), exportFileName() + '.csv');
  setMsg('已导出 CSV，共 ' + rows.length + ' 行。', 'ok');
}

/* ---------- 事件绑定 ---------- */
SETTING_IDS.forEach(id => {
  const save = e => {
    if (!$(id).checkValidity() || $(id).value === ''){
      if (e.type === 'change') $(id).reportValidity();
      return;
    }
    saveSettings(); renderAll();
  };
  $(id).addEventListener('input', save);
  $(id).addEventListener('change', save);
});
$('btnPng').addEventListener('click', exportPng);
$('btnPrint').addEventListener('click', exportPrint);
$('btnCsv').addEventListener('click', exportCsv);
$('btnToggle').addEventListener('click', () => {
  const boxes = [].slice.call(document.querySelectorAll('#exportModules input[type=checkbox]:not(:disabled)'));
  const allOn = boxes.every(b => b.checked);
  boxes.forEach(b => { b.checked = !allOn; });
  setMsg(allOn ? '已取消全部勾选。' : '已全选 ' + boxes.length + ' 个模块。');
});
$('exportModules').addEventListener('change', () => {
  setMsg('已选择 ' + selectedModules().length + ' 个模块。');
});

/* 动作相关的操作统一走文档级委托，工作区重绘不会丢事件 */
document.addEventListener('click', e => {
  const t = (e.target && e.target.closest) ? e.target.closest(
    '[data-log],[data-undo],[data-clear],[data-save-round],[data-new-round],[data-goto]') : null;
  if (!t) return;
  if (t.hasAttribute('data-log')) recordSession(t.getAttribute('data-log'));
  else if (t.hasAttribute('data-undo')) undoLast(t.getAttribute('data-undo'));
  else if (t.hasAttribute('data-clear')) clearLiftLog(t.getAttribute('data-clear'));
  else if (t.hasAttribute('data-save-round')) saveRound(t.getAttribute('data-save-round'));
  else if (t.hasAttribute('data-new-round')) startNewRound(t.getAttribute('data-new-round'));
  else if (t.hasAttribute('data-goto')) switchTab(t.getAttribute('data-goto'));
});

/* 历史轮次：展开 / 勾选 / 重命名 / 导出 / 删除（全部事件委托，容器不随重绘消失） */
const ARC_BTN_SEL = 'button[data-arc-toggle],button[data-arc-rename],button[data-arc-renamesave],' +
  'button[data-arc-png],button[data-arc-csv],button[data-arc-json],button[data-arc-del],' +
  'button[data-arc-delgo],button[data-arc-delcancel],button[data-arc-pickall],' +
  'button[data-arc-bcsv],button[data-arc-bjson],button[data-arc-bdel],button[data-arc-bdelgo],button[data-arc-bdelcancel]';

$('historyBox').addEventListener('click', e => {
  const t = (e.target && e.target.closest) ? e.target.closest(ARC_BTN_SEL) : null;
  if (!t) return;
  const g = n => t.getAttribute(n);
  if (t.hasAttribute('data-arc-toggle'))        toggleArc(g('data-arc-toggle'));
  else if (t.hasAttribute('data-arc-rename'))   { renamingId = g('data-arc-rename'); renderAll(); }
  else if (t.hasAttribute('data-arc-renamesave')) commitRename(g('data-arc-renamesave'));
  else if (t.hasAttribute('data-arc-png'))      exportArchivePng(g('data-arc-png'));
  else if (t.hasAttribute('data-arc-csv'))      archiveCsv(g('data-arc-csv'));
  else if (t.hasAttribute('data-arc-json'))     archiveJson(g('data-arc-json'));
  else if (t.hasAttribute('data-arc-del'))      { pendingDel[g('data-arc-del')] = true; renderAll(); }
  else if (t.hasAttribute('data-arc-delgo'))    doDelete(g('data-arc-delgo'));
  else if (t.hasAttribute('data-arc-delcancel')){ delete pendingDel[g('data-arc-delcancel')]; renderAll(); }
  else if (t.hasAttribute('data-arc-pickall'))  pickAll();
  else if (t.hasAttribute('data-arc-bcsv'))     batchCsv();
  else if (t.hasAttribute('data-arc-bjson'))    batchJson();
  else if (t.hasAttribute('data-arc-bdel'))     { batchDeletePending = true; renderAll(); }
  else if (t.hasAttribute('data-arc-bdelgo'))   doBatchDelete();
  else if (t.hasAttribute('data-arc-bdelcancel')){ batchDeletePending = false; renderAll(); }
});

$('historyBox').addEventListener('change', e => {
  const c = e.target;
  if (c && c.hasAttribute && c.hasAttribute('data-arc-pick')) togglePick(c.getAttribute('data-arc-pick'));
});

$('historyBox').addEventListener('keydown', e => {
  const t = e.target;
  if (t && t.classList && t.classList.contains('arc-rename')){
    if (e.key === 'Enter'){ e.preventDefault(); commitRename(t.id.replace('rename-', '')); }
    else if (e.key === 'Escape'){ e.preventDefault(); renamingId = null; renderAll(); }
  }
});

$('historyBox').addEventListener('blur', e => {
  const t = e.target;
  if (t && t.classList && t.classList.contains('arc-rename') && renamingId){
    commitRename(t.id.replace('rename-', ''));
  }
}, true);

/* 数据备份与转移 */
$('btnBackup').addEventListener('click', exportBackup);
$('importFile').addEventListener('change', e => {
  const input = e.target;
  const f = input.files && input.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onerror = () => setMsg('读取文件失败。', 'err');
  reader.onload = () => {
    let data;
    try {
      data = validateBackup(JSON.parse(String(reader.result)));
    } catch (err) {
      pendingBackup = null;
      $('importPreview').innerHTML = '';
      input.value = '';
      setMsg('导入失败：' + err.message, 'err');
      return;
    }
    pendingBackup = data;
    const n = ALL_LIFTS.reduce((a, k) =>
      a + ((data.logs && Array.isArray(data.logs[k])) ? data.logs[k].length : 0), 0);
    const m = Array.isArray(data.archives) ? data.archives.length : 0;
    $('importPreview').innerHTML =
      '<div class="nextbox" style="margin-top:14px">' +
        '<div>' +
          '<div class="nextmeta">备份文件内容</div>' +
          '<div>训练记录 <b>' + n + '</b> 条 · 历史轮次 <b>' + m + '</b> 个' +
            (data.exportedAt ? ' · 导出于 ' + escapeHtml(String(data.exportedAt)) : '') + '</div>' +
        '</div>' +
        '<div class="logrow">' +
          '<button class="primary" id="btnImportGo">确认导入</button>' +
          '<button id="btnImportCancel">取消</button>' +
        '</div>' +
      '</div>';
    $('btnImportGo').addEventListener('click', () => {
      const mode = $('importMode').value;
      applyBackup(pendingBackup, mode);
      pendingBackup = null;
      $('importPreview').innerHTML = '';
      input.value = '';
      const st = backupSummary();
      setMsg('导入完成（' + (mode === 'replace' ? '覆盖' : '合并') + '）：训练记录 ' + st.logs +
             ' 条，历史轮次 ' + st.archives + ' 个。', 'ok');
    });
    $('btnImportCancel').addEventListener('click', () => {
      pendingBackup = null;
      $('importPreview').innerHTML = '';
      input.value = '';
      setMsg('已取消导入。');
    });
    setMsg('已读取备份文件，确认后才会写入本机数据。');
  };
  reader.readAsText(f, 'utf-8');
});

[].slice.call(document.querySelectorAll('.tab')).forEach(b => {
  b.addEventListener('click', () => switchTab(b.getAttribute('data-tab')));
});

function renderExportModules(){
  $('exportModules').innerHTML = ALL_LIFTS.map(k => {
    const n = LIFT_NAME[k];
    return '<div class="expgroup" data-group="' + k + '">' +
      '<div class="expgroup-head"><span class="expdot ' + k + '"></span><span>' + n + '</span>' +
        '<button class="tinybtn" data-modall="' + k + '">本组全选</button></div>' +
      '<div class="mods">' +
        '<label class="check"><input type="checkbox" data-mod="mod-setup-' + k + '" checked><span>基准与断层</span></label>' +
        '<label class="check"><input type="checkbox" data-mod="mod-cycles-' + k + '" checked><span>小循环编排</span></label>' +
        '<label class="check"><input type="checkbox" data-mod="mod-schedule-' + k + '" checked><span>周训练日程</span></label>' +
        '<label class="check"><input type="checkbox" data-mod="mod-log-' + k + '" checked><span>训练记录</span></label>' +
      '</div>' +
    '</div>';
  }).join('');
}

/* 每组「全选 / 全不选」 */
document.addEventListener('click', e => {
  const b = (e.target && e.target.closest) ? e.target.closest('[data-modall]') : null;
  if (!b) return;
  const k = b.getAttribute('data-modall');
  const boxes = [].slice.call(document.querySelectorAll('#exportModules input[data-mod$="-' + k + '"]'));
  const allOn = boxes.length > 0 && boxes.every(x => x.checked);
  boxes.forEach(x => { x.checked = !allOn; });
  setMsg((allOn ? '已取消 ' : '已全选 ') + LIFT_NAME[k] + ' 的 ' + boxes.length + ' 个模块。');
});

loadArchives();
loadLog();
loadSettings();
renderExportModules();
renderAll();
