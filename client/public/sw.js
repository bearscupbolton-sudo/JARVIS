var CACHE_VERSION = 4;
var CACHE_NAME = 'jarvis-v' + CACHE_VERSION;
var MEDIA_CACHE_NAME = 'jarvis-media-v1';
var MEDIA_CACHE_LIMIT = 200;

var PRECACHE_URLS = [
  '/manifest.json',
  '/favicon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

function isMediaRequest(url) {
  if (url.pathname.startsWith('/uploads/')) return true;
  if (url.hostname.includes('object.storage') || url.hostname.includes('replit')) {
    var ext = url.pathname.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'].indexOf(ext) !== -1) return true;
  }
  return false;
}

function isThumbnail(url) {
  return url.pathname.indexOf('thumb') !== -1 || url.pathname.indexOf('thumbnail') !== -1;
}

function trimMediaCache() {
  return caches.open(MEDIA_CACHE_NAME).then(function(cache) {
    return cache.keys().then(function(keys) {
      if (keys.length <= MEDIA_CACHE_LIMIT) return;
      var toDelete = keys.length - MEDIA_CACHE_LIMIT;
      var deletions = [];
      for (var i = 0; i < toDelete; i++) {
        deletions.push(cache.delete(keys[i]));
      }
      return Promise.all(deletions);
    });
  });
}

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) { return cache.addAll(PRECACHE_URLS); })
  );
  self.skipWaiting();
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CHECK_VERSION') {
    self.registration.update();
  }
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) {
          return k !== CACHE_NAME && k !== MEDIA_CACHE_NAME;
        }).map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (isMediaRequest(url)) {
    event.respondWith(
      caches.open(MEDIA_CACHE_NAME).then(function(cache) {
        return cache.match(request).then(function(cached) {
          var fetchPromise = fetch(request).then(function(response) {
            if (response && response.ok) {
              var clone = response.clone();
              cache.put(request, clone).then(function() {
                if (!isThumbnail(url)) {
                  trimMediaCache();
                }
              });
            }
            return response;
          }).catch(function() {
            return cached;
          });

          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(function() { return caches.match(request); })
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(function() {
        return new Response(
          '<!DOCTYPE html><html><body><h2 style="text-align:center;margin-top:40vh;font-family:sans-serif">You are offline. Please reconnect to use Jarvis.</h2></body></html>',
          { headers: { 'Content-Type': 'text/html' } }
        );
      })
    );
    return;
  }

  var isAppCode =
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css');

  if (isAppCode) {
    event.respondWith(
      fetch(request)
        .then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(request, clone); });
          return response;
        })
        .catch(function() { return caches.match(request); })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function(cached) {
      var fetchPromise = fetch(request)
        .then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(request, clone); });
          return response;
        })
        .catch(function() { return cached; });

      return cached || fetchPromise;
    })
  );
});

self.addEventListener('push', function(event) {
  var data = { title: 'Jarvis', body: 'New notification', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: {} };
  if (event.data) {
    try {
      data = Object.assign(data, event.data.json());
    } catch (e) {
      data.body = event.data.text();
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag || undefined,
      data: data.data || {},
      vibrate: [200, 100, 200],
    }).then(function() {
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    }).then(function(windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        windowClients[i].postMessage({ type: 'PUSH_RECEIVED', payload: data.data || {} });
      }
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
