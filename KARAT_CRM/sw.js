self.addEventListener('install', (e) => {
  console.log('Service Worker: Установлен');
});

self.addEventListener('activate', (e) => {
  console.log('Service Worker: Активирован');
});

self.addEventListener('fetch', (e) => {
  // Базовый перехват запросов (пока без кэша)
});
