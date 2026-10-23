
/* 仅在 http(s) 下注册；file:// 打开时跳过，不影响离线单文件使用 */
(function(){
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('./sw.js').catch(function(){});
  });
})();
