// Bangkok Trip — Service Worker
// 캐시 전략: app shell + 동적 리소스 stale-while-revalidate
// 캐시 버전 (HTML 업데이트할 때마다 숫자 올리면 사용자 폰에서 새로 받음)
const CACHE_VERSION = 'v1';
const CACHE_NAME = `bangkok-${CACHE_VERSION}`;

// 앱 핵심 리소스 (설치 시 미리 캐시)
const APP_SHELL = [
  './',
  './index.html',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js',
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..500&family=IBM+Plex+Sans+KR:wght@300;400;500;600&display=swap',
];

// Install: app shell 캐시
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // 개별 실패 허용 (CDN 일부가 실패해도 설치는 진행)
      return Promise.all(
        APP_SHELL.map(url => cache.add(url).catch(err => console.warn('cache fail:', url, err)))
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: 이전 버전 캐시 정리
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: 전략 분기
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) 외부 API (날씨, 환율) — Network first, fallback to cache
  if (url.host === 'api.open-meteo.com' || url.host === 'api.frankfurter.app') {
    event.respondWith(
      fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // 2) 지도 타일 — Cache first (오프라인에서도 본 영역은 표시)
  if (url.host.includes('basemaps.cartocdn.com')) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
          return res;
        }).catch(() => new Response('', { status: 404 }));
      })
    );
    return;
  }

  // 3) 앱 리소스 — Stale while revalidate
  event.respondWith(
    caches.match(req).then(cached => {
      const networkFetch = fetch(req).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
