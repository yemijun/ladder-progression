let exportBusy = false, exportGeneration = 0;
let exportPreview = {files:[],index:0,url:null};
let exportPrintRoot = null;

function setMsg(message, kind){
  const el = document.getElementById('exportMsg');
  el.className = 'expmsg' + (kind ? ' ' + kind : '');el.textContent = message;
  const pane = document.querySelector('[data-pane="export"]');
  if (!pane || !pane.classList.contains('active')) showNotice(message, kind === 'err');
}
function selectedModules(){
  return Array.from(document.querySelectorAll('#exportModules input[type=checkbox]'))
    .filter(input => input.checked && !input.disabled && !input.closest('[data-group]').hidden)
    .map(input => document.getElementById(input.getAttribute('data-mod'))).filter(Boolean);
}
function syncExportControls(){
  const select=document.getElementById('exportLift');
  if (!select) return;
  const previous=select.value, keys=visibleLifts();
  select.replaceChildren();
  [['enabled','全部已启用动作'],...keys.map(k => [k,LIFT_NAME[k]])].forEach(([value,label]) => {
    const option=document.createElement('option');option.value=value;option.textContent=label;select.appendChild(option);
  });
  select.value=keys.includes(previous) ? previous : 'enabled';
  document.querySelectorAll('#exportModules [data-group]').forEach(group => {
    group.hidden=!keys.includes(group.dataset.group) || (select.value!=='enabled' && group.dataset.group!==select.value);
  });
  document.getElementById('exportAdvanced').hidden=document.getElementById('exportPurpose').value !== 'custom';
  document.getElementById('exportScopeField').hidden=false;
}
function collectExportRequest(){
  const selected=document.getElementById('exportLift').value;
  const keys=visibleLifts().filter(k => selected === 'enabled' || selected === k);
  if (!keys.length) throw new Error('请先在「训练管理」中启用至少一个动作。完整 JSON 备份不受此限制。');
  const {cfg}=readCfg();
  const snapshot=captureExportSnapshot(cfg,workoutLog,keys,sessionStamp());
  const modules={};
  keys.forEach(k => {modules[k]=selectedModules().map(m => m.id).filter(id => id.endsWith('-'+k)).map(id => id.split('-')[1]);});
  const purpose=document.getElementById('exportPurpose').value;
  return {snapshot,options:{purpose,modules,scope:document.getElementById('exportScope').value,
    title:document.getElementById('pngTitle').value.trim().slice(0,60) || '阶梯递进力量计划'}};
}
function downloadBlob(blob, filename){
  const url=URL.createObjectURL(blob), anchor=document.createElement('a');
  anchor.href=url;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url),30000);
}
function setExportBusy(busy){
  exportBusy=busy;
  document.querySelectorAll('[data-export-generate], [data-arc-png]').forEach(button => {button.disabled=busy;});
  document.getElementById('btnCancelExport').hidden=!busy;
}
function clearExportPreview(){
  if (exportPreview.url) URL.revokeObjectURL(exportPreview.url);
  exportPreview={files:[],index:0,url:null};
  document.getElementById('exportPreviewImage').removeAttribute('src');
}
function displayExportPreview(){
  const p=exportPreview, file=p.files[p.index];
  if (!file) return;
  if (p.url) URL.revokeObjectURL(p.url);
  p.url=URL.createObjectURL(file.blob);
  const image=document.getElementById('exportPreviewImage');
  image.src=p.url;image.alt=file.page.heading + '，第 ' + (p.index+1) + ' 张';
  document.getElementById('previewInfo').textContent=(p.index+1)+' / '+p.files.length+' 张 · '+file.width+' × '+file.height+' px · '+Math.ceil(file.blob.size/1024)+' KB';
  document.getElementById('previewTitle').textContent=file.page.heading;
  document.getElementById('previewPrev').disabled=p.index===0;
  document.getElementById('previewNext').disabled=p.index===p.files.length-1;
  document.getElementById('previewZip').hidden=p.files.length<2;
  const shareFile=new File([file.blob],file.name,{type:'image/png'});
  let shareable=false;
  try {shareable=!!(navigator.canShare && navigator.share && navigator.canShare({files:[shareFile]}));} catch(e) {}
  document.getElementById('previewShare').hidden=!shareable;
  document.getElementById('previewMessage').textContent='图片仅包含本次快照；可下载，也可长按图片保存。';
}
async function generateExportPreview(snapshot, options){
  if (exportBusy){showNotice('图片正在生成，请等待或取消当前任务。');return;}
  const generation=++exportGeneration;
  try {
    const pages=buildExportPages(snapshot,options);
    setExportBusy(true);clearExportPreview();
    const bg=document.getElementById('pngBg').value;
    const theme=bg==='auto'?currentTheme():bg;
    const scale=Number(document.getElementById('pngScale').value)||1;
    const files=[];
    for (let i=0;i<pages.length;i++){
      if (generation!==exportGeneration) return;
      setMsg('正在生成 '+(i+1)+' / '+pages.length+' 张，请稍候…');
      await new Promise(resolve => setTimeout(resolve,0));
      const result=await renderExportPage(pages[i],theme,scale,i,pages.length);
      if (generation!==exportGeneration) return;
      files.push({...result,page:pages[i],name:exportPageName(pages[i],snapshot.at,i)});
    }
    exportPreview={files,index:0,url:null};displayExportPreview();
    const dialog=document.getElementById('exportPreview');
    if (!dialog.open) dialog.showModal();
    const reduced=files.some(f => f.scale+0.01<scale);
    setMsg('已生成 '+files.length+' 张图片，请预览后保存。'+(reduced?'部分页面已自动调整清晰度以限制内存。':''),'ok');
  } catch (e){setMsg('图片生成失败：'+e.message,'err');}
  finally {if (generation===exportGeneration) setExportBusy(false);}
}
function exportPng(){
  if (exportBusy) return;
  try {const request=collectExportRequest();return generateExportPreview(request.snapshot,request.options);}
  catch(e){setMsg(e.message,'err');}
}
function exportArchivePng(id){
  if (exportBusy){showNotice('图片正在生成，请稍候。');return;}
  const archive=archives.find(a => a.id===id);
  if (!archive) return;
  return generateExportPreview(captureArchiveSnapshot(archive),{purpose:'report',scope:'all',title:archiveTitle(archive)});
}
function exportCsv(){
  try {
    const {snapshot,options}=collectExportRequest();
    const type=document.getElementById('csvType').value;
    const rows=exportCsvRows(snapshot,type,document.getElementById('exportScope').value);
    if (rows.length<2){setMsg('所选范围尚无'+(type==='logs'?'实际训练记录':'计划数据')+'，未生成空文件。','err');return;}
    const name=safeExportName(snapshot.lifts.map(l => l.name).join('+')+'_'+(type==='logs'?'实际训练记录':'训练计划')+'_'+snapshot.at.replace(/[: ]/g,'-'))+'.csv';
    downloadBlob(new Blob([serializeExportCsv(rows)],{type:'text/csv;charset=utf-8'}),name);
    setMsg('已开始下载 CSV：'+(rows.length-1)+' 条数据，固定 '+rows[0].length+' 列。','ok');
  } catch(e){setMsg(e.message,'err');}
}

/* EXPORT-PRINT-START: printing has its own text document; never mutate workspaces. */
function cleanupExportPrint(){
  if (exportPrintRoot) exportPrintRoot.remove();
  exportPrintRoot=null;document.body.classList.remove('export-printing');
}
function exportPrint(){
  try {
    const {snapshot,options}=collectExportRequest(), pages=buildExportPages(snapshot,options);
    cleanupExportPrint();
    const root=document.createElement('div');root.id='exportPrintRoot';
    pages.forEach((page,i) => {
      const section=document.createElement('section');section.className='export-print-page';
      const text=(tag,value) => {const el=document.createElement(tag);el.textContent=value;return el;};
      section.append(text('h1',page.title),text('h2',page.heading),text('p',page.subtitle));
      page.metrics.forEach(([label,value]) => section.append(text('p',label+'：'+value)));
      page.notes.forEach(note => section.append(text('p',note)));
      if (page.columns.length){
        const table=document.createElement('table'),head=document.createElement('thead'),body=document.createElement('tbody'),row=document.createElement('tr');
        page.columns.forEach(label => row.append(text('th',label)));head.append(row);
        page.rows.forEach(values => {const row=document.createElement('tr');values.forEach(v=>row.append(text('td',v==null?'':v)));body.append(row);});
        table.append(head,body);section.append(table);
      }
      section.append(text('footer','阶梯递进 · '+(i+1)+' / '+pages.length));root.append(section);
    });
    exportPrintRoot=root;document.body.append(root);document.body.classList.add('export-printing');
    window.print();
  } catch(e){cleanupExportPrint();setMsg('打印准备失败：'+e.message,'err');}
}
window.addEventListener('afterprint',cleanupExportPrint);
/* EXPORT-PRINT-END */

function initExportUI(){
  syncExportControls();
  document.getElementById('exportPurpose').addEventListener('change',syncExportControls);
  document.getElementById('exportLift').addEventListener('change',syncExportControls);
  document.getElementById('btnCancelExport').addEventListener('click',()=>{
    ++exportGeneration;setExportBusy(false);setMsg('已取消生成，可以缩小范围后重试。');
  });
  const dialog=document.getElementById('exportPreview');
  document.getElementById('previewClose').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',clearExportPreview);
  document.getElementById('previewPrev').addEventListener('click',()=>{if(exportPreview.index>0){exportPreview.index--;displayExportPreview();}});
  document.getElementById('previewNext').addEventListener('click',()=>{if(exportPreview.index<exportPreview.files.length-1){exportPreview.index++;displayExportPreview();}});
  document.getElementById('previewSave').addEventListener('click',()=>{
    const file=exportPreview.files[exportPreview.index];if(!file)return;
    downloadBlob(file.blob,file.name);document.getElementById('previewMessage').textContent='已开始下载当前图片；手机也可长按图片保存。';
  });
  document.getElementById('previewZip').addEventListener('click',async()=>{
    const button=document.getElementById('previewZip'), files=exportPreview.files.slice();
    if (!files.length || button.disabled) return;
    button.disabled=true;
    try {
      const blob=await createExportZip(files);
      downloadBlob(blob,safeExportName(files[0].page.title+'_图片_'+files.length+'张')+'.zip');
      document.getElementById('previewMessage').textContent='已开始下载 ZIP，解压后可查看全部 '+files.length+' 张图片。';
    } catch(e){document.getElementById('previewMessage').textContent='打包失败：'+e.message;}
    finally {button.disabled=false;}
  });
  document.getElementById('previewShare').addEventListener('click',async()=>{
    const file=exportPreview.files[exportPreview.index];if(!file)return;
    const button=document.getElementById('previewShare');button.disabled=true;
    try {await navigator.share({files:[new File([file.blob],file.name,{type:'image/png'})],title:file.page.heading});}
    catch(e){document.getElementById('previewMessage').textContent=e.name==='AbortError'?'已取消分享，图片仍可保存。':'分享不可用，请使用下载或长按保存。';}
    finally {button.disabled=false;}
  });
}
