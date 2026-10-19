const CACHE_NAME = 'constructflow-shell-v2'
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/pwa-icon.svg', '/pwa-192.png', '/pwa-512.png']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) {
        // Clone before returning the response to the browser. Once the page
        // starts consuming its body, Response.clone() throws.
        const cacheCopy = response.clone()
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put('/index.html', cacheCopy)).catch(() => {}))
      }
      return response
    }).catch(async () => (await caches.match(request)) || (await caches.match('/index.html')) || Response.error()))
    return
  }
  event.respondWith(fetch(request).then(response => {
    if (response.ok && canCache(request, response)) {
      // Keep the copy operation inside the response chain so the body has not
      // been consumed by the page yet.
      const cacheCopy = response.clone()
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, cacheCopy)).catch(() => {}))
    }
    return response
  }).catch(async () => (await caches.match(request)) || Response.error()))
})

function canCache(request, response) {
  if (response.type === 'opaque') return false

  // A module script served with an octet-stream or HTML content type is not
  // executable. Do not persist that response and make the failure survive a
  // later reload while the server is being corrected.
  if (request.destination === 'script') {
    const contentType = response.headers.get('content-type') || ''
    return /^(text|application)\/(javascript|ecmascript)(?:\s*;|$)/i.test(contentType)
  }

  return true
}
