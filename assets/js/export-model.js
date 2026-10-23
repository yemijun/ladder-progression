/* Export data is captured once. Renderers never read a live form or workspace. */
const EXPORT_ROW_LIMIT = 12;
const EXPORT_PAGE_LIMIT = 80;
const EXPORT_PURPOSES = { training:'训练卡', plan:'周期计划', report:'训练报告', custom:'自定义内容' };

function captureExportSnapshot(cfg, logs, keys, stamp){
  return {
    at:stamp,
    lifts:keys.map(key => {
      const settings = JSON.parse(JSON.stringify(cfg[key]));
      const log = JSON.parse(JSON.stringify(logs[key] || []));
      const program = buildLiftPlan(key, settings, settings.unit);
      const adjusted = applyLog(program.cycles, log, LIFT_SPECS[key].regressDrop, settings.failThreshold, program.perWeek);
      return {key, name:LIFT_SPECS[key].name, unit:settings.unit, settings, log, program, adjusted};
    })
  };
}
function exportCycleMatches(cycle, scope, lift){
  if (!scope || scope === 'all') return true;
  const wanted = scope === 'current' ? (lift.adjusted.next ? lift.adjusted.next.cycle : 4) : Number(scope);
  return cycle === wanted;
}
function exportStatus(state){
  return {done:'达标',failed:'未达标',next:'下一次',planned:'待训练'}[state] || state;
}
function buildExportPages(snapshot, options){
  const pages = [];
  const add = (lift, label, columns, rows, notes, metrics, cycle) => {
    const count = Math.max(1, Math.ceil(rows.length / EXPORT_ROW_LIMIT));
    for (let i = 0; i < count; i++){
      pages.push({
        title:options.title || '阶梯递进力量计划',
        heading:lift.name + ' · ' + label,
        subtitle:'单位 ' + lift.unit + ' · ' + snapshot.at + (options.purpose === 'training' ? '' :
          ' · ' + (!options.scope || options.scope === 'all' ? '全部小循环' : '小循环 ' +
            (options.scope === 'current' ? (lift.adjusted.next ? lift.adjusted.next.cycle : 4) : options.scope))),
        lift:lift.key, cycle:cycle || 0, kind:label,
        columns, rows:rows.slice(i * EXPORT_ROW_LIMIT, (i + 1) * EXPORT_ROW_LIMIT),
        notes:notes || [], metrics:metrics || [], part:i + 1, parts:count
      });
    }
  };
  snapshot.lifts.forEach(lift => {
    const a = lift.adjusted, p = lift.program, s = lift.settings;
    const notes = ['10RM ' + s.tenRM + lift.unit + ' · 开把 ' + p.decided.open + lift.unit + ' · 每档递增 ' + p.decided.step + lift.unit];
    const selected = options.modules && options.modules[lift.key] || [];
    if (options.purpose === 'training'){
      const next = a.next;
      const state = !s.perWeek ? '已暂停排期' : next ? '下一次训练' : '本轮已完成';
      add(lift, '训练卡', [], [], notes.concat([
        '每档完成 5 组，组间休息 3 分钟。',
        '以最难一组完成次数记录：达标进入下一档，未达标重试。'
      ]), [
        ['当前状态',state],
        ['训练重量',next && s.perWeek ? next.weight + lift.unit : '—'],
        ['目标组次',next && s.perWeek ? next.sets + '组 × ' + next.reps + '次' : '—'],
        ['本轮进度',a.logged + ' / ' + a.timeline.length + ' 次'],
        ['所在循环',next ? '小循环 ' + next.cycle : '已完成'],
        ['训练节奏',s.perWeek ? '每周 ' + s.perWeek + ' 次' : '暂停']
      ]);
    }
    if (options.purpose === 'custom' && selected.includes('setup')){
      add(lift, '计划参数', ['参数','当前值'], [
        ['10RM',s.tenRM + lift.unit],['递增后完成次数',s.repsAfterStep + ' 次'],
        ['断层',p.decided.gap + ' 次'],['开把重量',p.decided.open + lift.unit],
        ['重量跨度',p.decided.step + lift.unit],['每周训练次数',s.perWeek || '暂停'],
        ['连续未达标下调阈值',s.failThreshold + ' 次']
      ], ['参数来自本次导出快照，不包含输入框或操作按钮。']);
    }
    if (options.purpose === 'custom' && selected.includes('cycles')){
      p.cycles.filter(cy => exportCycleMatches(cy.index, options.scope, lift)).forEach(cy => {
        add(lift, '小循环 ' + cy.index + ' · 基准编排', ['重量','组数','目标次数'],
          cy.tiers.map(t => [t.weight + lift.unit,t.sets,t.reps]),
          notes.concat(['这是基准模板；实际重试与退阶见训练日程。']), [], cy.index);
      });
    }
    if (options.purpose === 'plan' || (options.purpose === 'custom' && selected.includes('schedule'))){
      for (let cycle = 1; cycle <= 4; cycle++){
        if (!exportCycleMatches(cycle, options.scope, lift)) continue;
        const rows = a.timeline.map((t,i) => ({...t,session:i + 1})).filter(t => t.cycle === cycle).map(t => [
          s.perWeek ? Math.floor((t.session - 1) / s.perWeek) + 1 : '—',
          t.session, t.weight + lift.unit, t.sets + '组 × ' + t.reps + '次', exportStatus(t.state)
        ]);
        if (!rows.length) continue;
        add(lift, '小循环 ' + cycle + ' · 训练日程', ['周次','次序','重量','组次','状态'], rows,
          notes.concat([s.perWeek ? '每周 ' + s.perWeek + ' 次 · 含已记录训练及后续安排' : '当前已暂停，以下仅为未排期的递进顺序',
            '待训练部分按全部达标推演；实际记录后可能调整。']), [], cycle);
      }
    }
    if (options.purpose === 'report' || (options.purpose === 'custom' && selected.includes('log'))){
      const log = lift.log.filter(r => exportCycleMatches(r.cycle, options.scope, lift));
      const done = log.filter(r => r.completed).length;
      add(lift, '本轮训练报告', ['时间','重量','目标组次','实际次数','结果'],
        log.map(r => [r.at,r.weight + lift.unit,r.sets + '×' + r.reps,r.actual == null ? '—' : r.actual,r.completed ? '达标' : '未达标']),
        [log.length ? '仅包含实际录入的数据，不包含未来推演。' : '所选范围尚无训练记录。', '重量与次数保留录入时的实际记录。'],
        [['已记录',log.length + ' 次'],['达标',done + ' 次'],['未达标',log.length - done + ' 次']]);
    }
  });
  if (!pages.length) throw new Error('所选范围没有可导出的内容。');
  if (pages.length > EXPORT_PAGE_LIMIT) throw new Error('本次将生成 ' + pages.length + ' 张图片，请按动作或小循环缩小范围。');
  return pages;
}
function captureArchiveSnapshot(archive){
  const a = JSON.parse(JSON.stringify(archive));
  return {at:a.savedAt,lifts:a.lifts.map(l => ({
    key:l.key,name:l.name,unit:a.unit,log:l.log || [],
    settings:{tenRM:l.tenRM,perWeek:0},
    program:{decided:{open:l.open,step:l.step}},
    adjusted:{next:null}
  }))};
}
function exportCsvRows(snapshot, type, scope){
  if (type === 'logs'){
    const rows = [['动作','单位','时间','小循环','重量','组数','目标次数','实际次数','结果']];
    snapshot.lifts.forEach(l => l.log.filter(r => exportCycleMatches(r.cycle,scope,l)).forEach(r => {
      rows.push([l.name,l.unit,r.at,r.cycle,r.weight,r.sets,r.reps,r.actual == null ? '' : r.actual,r.completed ? '达标' : '未达标']);
    }));
    return rows;
  }
  const rows = [['动作','单位','周次','训练序号','小循环','重量','组数','目标次数','状态']];
  snapshot.lifts.forEach(l => l.adjusted.timeline.forEach((t,i) => {
    if (!exportCycleMatches(t.cycle,scope,l)) return;
    const pw = l.settings.perWeek;
    rows.push([l.name,l.unit,pw ? Math.floor(i / pw) + 1 : '',i + 1,t.cycle,t.weight,t.sets,t.reps,
      pw ? exportStatus(t.state) : '暂停排期']);
  }));
  return rows;
}
function serializeExportCsv(rows){
  return '\ufeff' + rows.map(row => row.map(value => {
    let text = value == null ? '' : String(value);
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g,'""') + '"';
  }).join(',')).join('\r\n');
}
function safeExportName(value){
  return String(value).replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').trim().slice(0,80) || '阶梯递进';
}
function exportPageName(page, at, index){
  return safeExportName(page.heading + '_' + page.title).slice(0,45) + '_' + safeExportName(at.replace(/[: ]/g,'-')) + '_' + String(index + 1).padStart(2,'0') + '.png';
}
function boundedExportScale(requested, width, height){
  const scale = Math.min(Number(requested) || 1,4096 / width,4096 / height,Math.sqrt(8000000 / (width * height)));
  return Math.floor(scale * 1000) / 1000;
}
function archiveOnlyBackup(data){
  return data.kind === 'archive' || (!data.settings && Array.isArray(data.archives) && data.archives.length > 0 &&
    !ALL_LIFTS.some(k => data.logs && Array.isArray(data.logs[k])));
}

/* Stored ZIP: PNGs are already compressed. No library, network or repeated downloads. */
function exportCrc32(bytes){
  let crc = 0xffffffff;
  for (const byte of bytes){
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
async function createExportZip(files){
  const parts = [], directory = [];
  let offset = 0;
  const header = size => {const bytes=new Uint8Array(size);return [bytes,new DataView(bytes.buffer)];};
  for (const file of files){
    const name = new TextEncoder().encode(file.name), bytes = new Uint8Array(await file.blob.arrayBuffer());
    const crc = exportCrc32(bytes), [local,l] = header(30), [central,c] = header(46);
    l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);
    l.setUint16(12,0x21,true);
    l.setUint32(14,crc,true);l.setUint32(18,bytes.length,true);l.setUint32(22,bytes.length,true);l.setUint16(26,name.length,true);
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);
    c.setUint16(14,0x21,true);
    c.setUint32(16,crc,true);c.setUint32(20,bytes.length,true);c.setUint32(24,bytes.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);
    parts.push(local,name,bytes);directory.push(central,name);
    offset += local.length + name.length + bytes.length;
  }
  const directorySize = directory.reduce((sum,b) => sum + b.length,0), [end,e] = header(22);
  e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);
  e.setUint32(12,directorySize,true);e.setUint32(16,offset,true);
  return new Blob([...parts,...directory,end],{type:'application/zip'});
}
