/**
 * sw.js – NeerNet Service Worker
 *
 * Two offline strategies:
 *
 * 1) App-shell caching (install)
 *    Caches the minimal set of assets needed to bootstrap the app.
 *
 * 2) Runtime caching (fetch)
 *    a) Cache-first for anything in STATIC_CACHE or TILE_CACHE.
 *    b) Cache-first shell (/index.html) for all navigation requests (SPA).
 *    c) PMTiles range requests stored keyed by URL + range fragment.
 *    d) Style / sprite / glyph fetches cached transparently.
 *
 * Service Worker lifecycle:
 *   - New SW takes over immediately (skipWaiting + clients.claim).
 *   - Old caches cleaned up in the activate phase.
 */

'use strict';

// ─── Cache names ──────────────────────────────────────────────────────────────

const CACHE_VERSION   = 'v3';
const SHELL_CACHE     = `neernet-shell-${CACHE_VERSION}`;
const TILE_CACHE      = `neernet-tiles-${CACHE_VERSION}`;
const STYLE_CACHE     = `neernet-styles-${CACHE_VERSION}`;
const PYODIDE_CACHE   = `neernet-pyodide-v1`;            // Pyodide WASM + packages
const OFFLINE_PACKS   = `neernet-offline-packs-v1`;      // written by download code

const ALL_CACHES = [SHELL_CACHE, TILE_CACHE, STYLE_CACHE, PYODIDE_CACHE, OFFLINE_PACKS];

// Derive base URL from the SW's own location so paths work under any sub-path
// (e.g. /FloodGraph/ on GitHub Pages as well as / in local dev).
const BASE = new URL('./', self.location.href).href;  // e.g. 'https://host/FloodGraph/'

// ─── App shell assets (pre-cached at install) ─────────────────────────────────

const SHELL_ASSETS = [
  BASE,
  `${BASE}index.html`,
  `${BASE}offline-packs.json`,
  `${BASE}manifest.json`,
];

// ─── Cross-Origin Isolation ──────────────────────────────────────────────────
//
// GitHub Pages (and most static hosts) don't serve COOP/COEP headers.
// Without them the browser disables SharedArrayBuffer, making Pyodide fall
// back to a much slower code path.  We inject the headers from the SW so
// cross-origin isolation is always active.

function withCOI(response) {
  if (!response || response.type === 'opaqueredirect') return response;

  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');

  return new Response(response.body, {
    status:     response.status,
    statusText: response.statusText,
    headers,
  });
}

// ─── URL matchers ─────────────────────────────────────────────────────────────

function isPMTilesRequest(url) {
  return url.pathname.endsWith('.pmtiles') || url.searchParams.has('pmtiles');
}

function isStyleOrSprite(url) {
  return (
    url.pathname.includes('/styles/') ||
    url.pathname.includes('/sprites/') ||
    url.pathname.includes('/glyphs/')  ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('.pbf')
  );
}

function isPyodideRequest(url) {
  return url.hostname.includes('jsdelivr') && url.pathname.includes('pyodide');
}

function isFontGlyph(url) {
  return url.pathname.includes('/fonts/') || url.pathname.endsWith('.pbf');
}

function isPyodideCDN(url) {
  return url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/pyodide/');
}

function isNavigationRequest(request) {
  return request.mode === 'navigate';
}

// ─── Cache key for range requests ─────────────────────────────────────────────
//
// Cache Storage keys are URLs only — not headers. To avoid collisions between
// different byte ranges of the same PMTiles file, we encode the Range header
// value as a URL fragment so each range gets its own cache entry.

function rangeCacheKey(request) {
  const rangeHeader = request.headers.get('Range');
  if (!rangeHeader) return request.url;
  // e.g.  "bytes=0-16383"  →  "…/file.pmtiles#bytes_0-16383"
  const fragment = rangeHeader.replace(/=/, '_').replace(/\s/g, '');
  return `${request.url}#${fragment}`;
}

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_ASSETS).catch((err) => {
        // Non-fatal: some assets might 404 during dev
        console.warn('[SW] pre-cache partial failure:', err);
      }),
    ).then(() => self.skipWaiting()),
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !ALL_CACHES.includes(k))
          .map((k) => {
            console.log('[SW] deleting stale cache:', k);
            return caches.delete(k);
          }),
      ),
    ).then(() => self.clients.claim()),
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Never intercept non-GET or cross-origin POST
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return; // relative URLs that can't be parsed
  }

  // Chrome extension URLs etc.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  // ── PMTiles (range requests) ──────────────────────────────────────────────

  if (isPMTilesRequest(url)) {
    event.respondWith(handlePMTiles(request, url).then(withCOI));
    return;
  }

  // ── Pyodide CDN (WASM + packages, ~30-50 MB) ─────────────────────────────
  // Cache-first: these are versioned/immutable CDN assets.

  if (isPyodideCDN(url)) {
    event.respondWith(cacheFirst(request, PYODIDE_CACHE).then(withCOI));
    return;
  }

  // ── Offline packs cache (written by download code in main.ts) ─────────────

  if (url.href.includes('/packs/')) {
    event.respondWith(cacheFirst(request, OFFLINE_PACKS).then(withCOI));
    return;
  }

  // ── Style / sprites / glyphs / font PBFs ─────────────────────────────────

  if (isStyleOrSprite(url) || isFontGlyph(url)) {
    event.respondWith(staleWhileRevalidate(request, STYLE_CACHE).then(withCOI));
    return;
  }

  // ── App shell (navigation) ────────────────────────────────────────────────

  if (isNavigationRequest(request)) {
    event.respondWith(serveShell().then(withCOI));
    return;
  }

  // ── Static app assets (JS / CSS chunks) ──────────────────────────────────

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE).then(withCOI));
    return;
  }

  // ── Everything else: network only (still add COI headers) ─────────────────
  event.respondWith(fetch(request).then(withCOI).catch(() => new Response('Offline', { status: 503 })));
});

// ─── Strategy helpers ─────────────────────────────────────────────────────────

/**
 * Cache-first. Returns cached response or fetches and stores.
 * Handles 206 (partial content) for PMTiles range requests keyed by
 * URL#range fragment.
 */
async function handlePMTiles(request, url) {
  const cacheKeyUrl = rangeCacheKey(request);

  // Check tile cache under range-specific key
  const cache  = await caches.open(TILE_CACHE);
  const cached = await cache.match(cacheKeyUrl);
  if (cached) return cached;

  // Also check offline packs cache (fully downloaded PMTiles files)
  const packCache  = await caches.open(OFFLINE_PACKS);
  const packCached = await packCache.match(request.url);
  if (packCached) {
    // We have a full file cached — we need to synthesise a 206 response
    // for the range portion that was requested.
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      return await sliceResponse(packCached.clone(), rangeHeader);
    }
    return packCached.clone();
  }

  // Not cached — try network
  try {
    const response = await fetch(request.clone());

    // Cache successful or partial responses
    if (response.ok || response.status === 206) {
      const cloned = response.clone();
      // Use range-keyed URL so different byte ranges don't overwrite each other
      await cache.put(cacheKeyUrl, cloned);
    }

    return response;
  } catch {
    return new Response('Offline – PMTiles chunk not cached', { status: 503 });
  }
}

/**
 * Slice a full Response body to satisfy an HTTP Range request.
 * Returns a synthesised 206 Partial Content response.
 */
async function sliceResponse(fullResponse, rangeHeader) {
  try {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!match) return fullResponse;

    const buffer = await fullResponse.arrayBuffer();
    const start  = parseInt(match[1], 10);
    const end    = match[2] ? parseInt(match[2], 10) : buffer.byteLength - 1;
    const slice  = buffer.slice(start, end + 1);

    return new Response(slice, {
      status:  206,
      headers: {
        'Content-Type':  fullResponse.headers.get('Content-Type') || 'application/octet-stream',
        'Content-Range': `bytes ${start}-${end}/${buffer.byteLength}`,
        'Content-Length': String(slice.byteLength),
      },
    });
  } catch {
    return fullResponse;
  }
}

/**
 * Cache-first, no revalidation.
 */
async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Offline – resource not cached', { status: 503 });
  }
}

/**
 * Serve from cache immediately; refresh cache in background.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached ?? (await networkFetch) ?? new Response('Offline', { status: 503 });
}

/**
 * Network-first for /index.html navigation requests (SPA shell pattern).
 * Always try the network first so new deployments are picked up immediately.
 * Falls back to cached shell only when offline.
 */
async function serveShell() {
  const indexUrl = `${BASE}index.html`;
  const cache    = await caches.open(SHELL_CACHE);

  try {
    const response = await fetch(indexUrl);
    if (response.ok) await cache.put(indexUrl, response.clone());
    return response;
  } catch {
    // Offline — serve cached shell
    const cached = await cache.match(indexUrl);
    return cached ?? new Response('Offline', { status: 503 });
  }
}
