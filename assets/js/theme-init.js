
/* 在首次绘制前解析主题，避免深色设备出现浅色闪屏。 */
(function(){
  let mode = 'auto';
  try { mode = localStorage.getItem('tp-theme') || 'auto'; } catch (e) {}
  const dark = mode === 'dark' || (mode !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  document.getElementById('themeColor').setAttribute('content', dark ? '#111a18' : '#f5f6f2');
})();
