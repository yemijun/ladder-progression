/* Draw a data document, not a screenshot. No SVG foreignObject or page CSS. */
const EXPORT_PALETTES = {
  light:{bg:'#f6f7f3',panel:'#ffffff',text:'#25372b',muted:'#657266',line:'#daddd6',accent:'#306345',stripe:'#eeefeb'},
  dark:{bg:'#121212',panel:'#1c1c1c',text:'#f0f2ef',muted:'#abb3ac',line:'#363936',accent:'#a3cfad',stripe:'#242424'}
};
function exportFont(ctx, size, weight){
  ctx.font = (weight || 400) + ' ' + size + 'px system-ui,"Microsoft YaHei","PingFang SC",sans-serif';
}
function wrapExportText(ctx, value, width, limit){
  const lines = [];let line='';
  for (const char of String(value == null ? '' : value)){
    if (char === '\n' || ctx.measureText(line + char).width > width){
      lines.push(line);line=char === '\n' ? '' : char;
    } else line += char;
  }
  if (line || !lines.length) lines.push(line);
  if (lines.length > limit){
    lines.length=limit;
    let last=lines[limit - 1];
    while (last && ctx.measureText(last + '…').width > width) last=last.slice(0,-1);
    lines[limit - 1]=last + '…';
  }
  return lines;
}
function exportTableWidths(count, columns){
  const ratios = {2:[.45,.55],3:[.4,.3,.3],4:[.14,.23,.34,.29],5:[.29,.19,.22,.14,.16]};
  if (columns && columns[0] === '周次') ratios[5]=[.12,.12,.25,.27,.24];
  return (ratios[count] || Array(count).fill(1 / count)).map(r => r * 640);
}
async function renderExportPage(page, mode, requestedScale, number, total){
  const palette=EXPORT_PALETTES[mode] || EXPORT_PALETTES.light;
  const canvas=document.createElement('canvas');canvas.width=720;canvas.height=1;
  const measure=canvas.getContext('2d');
  if (!measure) throw new Error('此浏览器无法创建图片画布，请使用打印或 CSV。');
  exportFont(measure,27,700);
  const title=wrapExportText(measure,page.title,640,3);
  exportFont(measure,24,600);
  const heading=wrapExportText(measure,page.heading,640,2);
  exportFont(measure,16);
  const subtitle=wrapExportText(measure,page.subtitle,640,2);
  const notes=page.notes.flatMap(note => wrapExportText(measure,note,640,3));
  const widths=exportTableWidths(page.columns.length,page.columns);
  const rows=page.rows.map(row => {
    const cells=row.map((value,i) => wrapExportText(measure,value,widths[i] - 20,3));
    return {cells,height:Math.max(52,...cells.map(lines => lines.length * 22 + 20))};
  });
  const metricsHeight=Math.ceil(page.metrics.length / 3) * 100;
  const headerHeight=40 + title.length * 36 + 20 + heading.length * 32 + subtitle.length * 24 + 22;
  const tableHeight=page.columns.length ? 44 + rows.reduce((sum,row) => sum + row.height,0) : 0;
  const height=headerHeight + metricsHeight + notes.length * 24 + (notes.length ? 22 : 0) + tableHeight + 78;
  const scale=boundedExportScale(requestedScale,720,height);
  if (!(scale > 0)) throw new Error('图片尺寸无效，请缩小导出范围。');
  canvas.width=Math.floor(720 * scale);canvas.height=Math.floor(height * scale);
  const ctx=canvas.getContext('2d');
  ctx.scale(scale,scale);ctx.textBaseline='top';
  ctx.fillStyle=palette.bg;ctx.fillRect(0,0,720,height);
  const drawLines=(lines,x,y,size,color,weight) => {
    exportFont(ctx,size,weight);ctx.fillStyle=color;
    lines.forEach((line,i) => ctx.fillText(line,x,y + i * (size === 27 ? 36 : size === 24 ? 32 : 24)));
  };
  let y=40;
  drawLines(title,40,y,27,palette.text,700);y+=title.length * 36 + 20;
  drawLines(heading,40,y,24,palette.accent,600);y+=heading.length * 32;
  drawLines(subtitle,40,y,16,palette.muted);y+=subtitle.length * 24 + 22;
  page.metrics.forEach(([label,value],i) => {
    const x=40 + (i % 3) * (640 / 3), top=y + Math.floor(i / 3) * 100;
    ctx.fillStyle=palette.panel;ctx.fillRect(x,top,640 / 3 - 8,88);
    exportFont(ctx,14);ctx.fillStyle=palette.muted;ctx.fillText(label,x + 12,top + 12);
    exportFont(ctx,20,600);ctx.fillStyle=palette.accent;
    const lines=wrapExportText(ctx,value,640 / 3 - 32,2);
    lines.forEach((line,n) => ctx.fillText(line,x + 12,top + 36 + n * 23));
  });
  y+=metricsHeight;
  drawLines(notes,40,y,16,palette.muted);y+=notes.length * 24 + (notes.length ? 22 : 0);
  if (page.columns.length){
    ctx.fillStyle=palette.accent;ctx.fillRect(40,y,640,44);
    let x=40;
    page.columns.forEach((label,i) => {
      exportFont(ctx,15,600);ctx.fillStyle=palette.bg;ctx.fillText(label,x + 10,y + 13);x+=widths[i];
    });
    y+=44;
    rows.forEach((row,index) => {
      ctx.fillStyle=index % 2 ? palette.stripe : palette.panel;ctx.fillRect(40,y,640,row.height);
      let x=40;
      row.cells.forEach((lines,i) => {
        exportFont(ctx,16);ctx.fillStyle=palette.text;
        lines.forEach((line,n) => ctx.fillText(line,x + 10,y + 10 + n * 22));x+=widths[i];
      });
      y+=row.height;
    });
  }
  ctx.strokeStyle=palette.line;ctx.beginPath();ctx.moveTo(40,height - 54);ctx.lineTo(680,height - 54);ctx.stroke();
  exportFont(ctx,13);ctx.fillStyle=palette.muted;
  ctx.fillText('阶梯递进 · 本机数据快照',40,height - 36);
  ctx.textAlign='right';ctx.fillText((number + 1) + ' / ' + total,680,height - 36);
  try {
    const blob=await new Promise((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('图片编码失败，请降低清晰度后重试。')),'image/png'));
    return {blob,width:canvas.width,height:canvas.height,scale};
  } finally {
    canvas.width=1;canvas.height=1;
  }
}
