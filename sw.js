/* 阶梯递进力量计划生成器 v1.4.0 · 页面联网优先，断网回退缓存 */
const CACHE = 'ladder-progression-v1.4.0';
const ASSETS = ['./', './index.html', './manifest.webmanifest',
  './assets/css/app.css?v=1.4.0', './assets/js/theme-init.js?v=1.4.0',
  './assets/js/core.js?v=1.4.0', './assets/js/app.js?v=1.4.0', './assets/js/register-sw.js?v=1.4.0',
  './assets/icons/icon.svg?v=1.4.0', './assets/icons/icon-192.png?v=1.4.0', './assets/icons/icon-512.png?v=1.4.0',
  './assets/icons/icon-maskable-512.png?v=1.4.0', './assets/icons/apple-touch-icon.png?v=1.4.0',
  './assets/icons/apple-touch-icon-167.png?v=1.4.0', './assets/icons/apple-touch-icon-152.png?v=1.4.0'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith('ladder-progression-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  /* 只接管本站资源，避免把第三方/插件注入的请求也存进缓存 */
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  if (e.request.mode === 'navigate' || url.pathname.endsWith('/index.html')){
    e.respondWith(fetch(e.request).then(async response => {
      if (response.ok){
        const cache = await caches.open(CACHE);
        await cache.put(e.request, response.clone());
      }
      return response;
    }).catch(async () => (await caches.match(e.request)) || (await caches.match('./index.html')) || Response.error()));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(resp => {
        const copy = resp.clone();
        if (resp.ok) caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return resp;
      });
    })
  );
});
