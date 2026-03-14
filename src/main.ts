/**
 * main.ts – NeerNet application entry point.
 *
 * Wires up:
 *  • MapLibre map (src/map.ts)
 *  • AOI drawing (src/aoi.ts)
 *  • Pyodide worker client (src/py/client.ts)
 *  • Offline pack download UI
 *  • Service Worker registration
 */

import type { Map as MLMap }  from 'maplibre-gl';
import { createMap, setFloodNodesLayer, setConnectivityLayer, clearOverlayLayers, setWaterwaysLayer } from './map.js';
import { AoiDraw, syntheticNodes, syntheticEdges } from './aoi.js';
import { getPyWorker, type ConnectivityEdge } from './py/client.js';
import { fetchKeralaWaterways, buildProximityEdges, colorComponentsGeoJSON } from './waterways.js';

// ─── Service Worker ───────────────────────────────────────────────────────────

async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('[SW] registered, scope:', reg.scope);
  } catch (err) {
    console.warn('[SW] registration failed:', err);
  }
}

// ─── Online / Offline status indicator ───────────────────────────────────────

function initNetworkStatus(): void {
  const dot  = document.getElementById('status-dot')!;
  const text = document.getElementById('status-text')!;

  function update(): void {
    const online = navigator.onLine;
    dot.className  = online ? '' : 'offline';
    text.textContent = online ? 'Online – panning will cache tiles' : 'Offline – using cached tiles';
  }

  window.addEventListener('online',  update);
  window.addEventListener('offline', update);
  update();
}

// ─── Offline Pack types & helpers ─────────────────────────────────────────────

interface OfflinePack {
  id: string;
  name: string;
  description: string;
  pmtiles_url: string;
  style_url: string;
  sprite_urls: string[];
  glyph_url_prefix: string;
  size_mb_approx: number;
  bbox: [number, number, number, number];
}

interface PackIndex {
  version: string;
  packs: OfflinePack[];
}

const PACK_CACHE_NAME = 'neernet-offline-packs-v1';

async function fetchPackIndex(): Promise<PackIndex> {
  const resp = await fetch('/offline-packs.json');
  if (!resp.ok) throw new Error(`Failed to fetch pack index: ${resp.status}`);
  return resp.json() as Promise<PackIndex>;
}

/**
 * Download a single resource (with progress tracking) into Cache Storage.
 * Reports progress as bytes received / total if Content-Length is available.
 */
async function downloadIntoCache(
  url: string,
  cacheName: string,
  onProgress: (received: number, total: number) => void,
): Promise<void> {
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) throw new Error(`HTTP ${response.status} – ${url}`);

  const total   = parseInt(response.headers.get('Content-Length') ?? '0', 10);
  const reader  = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(received, total || received);
  }

  const blob      = new Blob(chunks as unknown as BlobPart[]);
  const cachedRes = new Response(blob, {
    status:  200,
    headers: {
      'Content-Type':   response.headers.get('Content-Type') ?? 'application/octet-stream',
      'Content-Length': String(blob.size),
    },
  });

  const cache = await caches.open(cacheName);
  await cache.put(url, cachedRes);
}

async function downloadPack(
  pack: OfflinePack,
  onProgress: (pct: number, message: string) => void,
): Promise<void> {
  const urls = [
    pack.style_url,
    pack.pmtiles_url,
    ...pack.sprite_urls,
  ];

  // Pre-flight: estimate total (skipped for simplicity; we report per-file progress)
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    onProgress(
      Math.round((i / urls.length) * 100),
      `Downloading ${url.split('/').pop() ?? url} (${i + 1}/${urls.length})…`,
    );

    await downloadIntoCache(url, PACK_CACHE_NAME, (recv, total) => {
      // per-file incremental progress within the overall range
      const fileStart  = (i     / urls.length) * 100;
      const fileEnd    = ((i+1) / urls.length) * 100;
      const filePct    = total > 0 ? recv / total : 0;
      const overallPct = fileStart + filePct * (fileEnd - fileStart);
      onProgress(Math.round(overallPct), `Downloading ${url.split('/').pop()}… ${formatBytes(recv)}/${formatBytes(total)}`);
    });
  }
  onProgress(100, 'Pack saved to device!');
}

function formatBytes(b: number): string {
  if (b === 0) return '?';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

async function isPackCached(pack: OfflinePack): Promise<boolean> {
  const cache = await caches.open(PACK_CACHE_NAME);
  const resp  = await cache.match(pack.pmtiles_url);
  return resp !== undefined;
}

// ─── Render pack cards ─────────────────────────────────────────────────────────

async function renderPackList(packs: OfflinePack[]): Promise<void> {
  const container = document.getElementById('packs-list')!;
  container.innerHTML = '';

  for (const pack of packs) {
    const cached  = await isPackCached(pack);
    const card    = document.createElement('div');
    card.className = 'pack-card';
    card.dataset.packId = pack.id;
    card.innerHTML = `
      <div class="pack-card-header">
        <span class="pack-name">${escHtml(pack.name)}</span>
        <span class="pack-size">~${pack.size_mb_approx} MB</span>
      </div>
      <p class="pack-desc">${escHtml(pack.description)}</p>
      <div class="pack-progress"><div class="pack-progress-bar"></div></div>
      <p class="pack-status ${cached ? 'ok' : ''}">${cached ? '✓ Cached on device' : ''}</p>
      <button class="btn btn-outline btn-block btn-download" ${cached ? 'disabled' : ''}>
        ${cached ? '✓ Downloaded' : '⬇ Download Offline Pack'}
      </button>
    `;

    const btn      = card.querySelector<HTMLButtonElement>('.btn-download')!;
    const progressEl = card.querySelector<HTMLDivElement>('.pack-progress')!;
    const barEl      = card.querySelector<HTMLDivElement>('.pack-progress-bar')!;
    const statusEl   = card.querySelector<HTMLParagraphElement>('.pack-status')!;

    if (!cached) {
      btn.addEventListener('click', async () => {
        btn.disabled          = true;
        progressEl.style.display = 'block';

        try {
          await downloadPack(pack, (pct, msg) => {
            barEl.style.width = `${pct}%`;
            statusEl.textContent  = msg;
            statusEl.className    = 'pack-status';
          });

          statusEl.textContent = '✓ Cached on device';
          statusEl.className   = 'pack-status ok';
          btn.textContent      = '✓ Downloaded';
          progressEl.style.display = 'none';
        } catch (err) {
          statusEl.textContent = `⚠ Error: ${err instanceof Error ? err.message : String(err)}`;
          statusEl.className   = 'pack-status err';
          btn.disabled         = false;
          progressEl.style.display = 'none';
        }
      });
    }

    container.appendChild(card);
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Pyodide / compute section ────────────────────────────────────────────────

function initComputeSection(map: MLMap, aoi: AoiDraw): void {
  const btnConn   = document.getElementById('btn-run-connectivity') as HTMLButtonElement;
  const btnFlood  = document.getElementById('btn-run-flood')        as HTMLButtonElement;
  const statusEl  = document.getElementById('compute-status')!;
  const resultsEl = document.getElementById('compute-results') as HTMLDivElement;

  // Helper to render JSON in a collapsible details block
  const showResult = (label: string, data: unknown) => {
    const json = JSON.stringify(data, null, 2)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    resultsEl.innerHTML = `<details><summary>${label}</summary><pre>${json}</pre></details>`;
    resultsEl.style.display = 'block';
  };

  const worker = getPyWorker();

  // Forward worker status to UI
  worker.onStatus(({ status, message }) => {
    if (status === 'loading') {
      statusEl.textContent = `⏳ ${message}`;
    } else if (status === 'ready') {
      statusEl.textContent = '✓ Pyodide ready';
    }
  });

  // Enable buttons when AOI exists
  aoi.on('change', (polygon) => {
    const has = polygon !== null;
    btnConn.disabled  = !has;
    btnFlood.disabled = !has;
    if (!has) {
      statusEl.textContent     = 'Draw an AOI polygon to enable compute.';
      resultsEl.style.display  = 'none';
      resultsEl.innerHTML      = '';
      clearOverlayLayers(map);
    } else {
      statusEl.textContent = 'AOI ready. Click a compute button.';
    }
  });

  // Connectivity
  btnConn.addEventListener('click', async () => {
    const polygon = aoi.getPolygon();
    if (!polygon) return;

    btnConn.disabled = true;
    statusEl.textContent = '⏳ Running connectivity analysis…';
    clearOverlayLayers(map);

    try {
      const { positions } = syntheticNodes(polygon);
      const edgePairs = syntheticEdges();
      const edges: ConnectivityEdge[] = edgePairs.map(([s, t]) => ({ source: s, target: t }));
      // Simulate a "broken" network by removing ~20 % of edges
      const brokenEdges = edges.filter((_, i) => i % 5 !== 0);

      const result = await worker.connectivity(brokenEdges);

      setConnectivityLayer(map, positions, result.components);

      statusEl.textContent = `✓ Done – ${result.num_components} component(s)`;
      showResult(`Connectivity – ${result.num_components} component(s)`, result);
    } catch (err) {
      statusEl.textContent = `⚠ ${err instanceof Error ? err.message : err}`;
    } finally {
      btnConn.disabled = false;
    }
  });

  // Flood BFS
  btnFlood.addEventListener('click', async () => {
    const polygon = aoi.getPolygon();
    if (!polygon) return;

    btnFlood.disabled = true;
    statusEl.textContent = '⏳ Running flood simulation…';
    clearOverlayLayers(map);

    try {
      const { nodes, positions } = syntheticNodes(polygon);
      const edgePairs = syntheticEdges();
      const edges: ConnectivityEdge[] = edgePairs.map(([s, t]) => ({ source: s, target: t }));

      // Pick a few source nodes for flood origin
      const sourceNodes = nodes.slice(0, 3);

      const result = await worker.toyFlood(edges, sourceNodes, 4);

      const floodCoords = result.flooded_nodes
        .map((id) => positions[id])
        .filter(Boolean) as [number, number][];

      setFloodNodesLayer(map, floodCoords);

      statusEl.textContent = `✓ ${result.flooded_nodes.length} nodes flooded in ${result.steps_taken} step(s)`;
      showResult(`Flood BFS – ${result.flooded_nodes.length} nodes flooded`, result);
    } catch (err) {
      statusEl.textContent = `⚠ ${err instanceof Error ? err.message : err}`;
    } finally {
      btnFlood.disabled = false;
    }
  });
}

// ─── AOI button wiring ────────────────────────────────────────────────────────

function initAoiSection(aoi: AoiDraw): void {
  const btnDraw     = document.getElementById('btn-draw-aoi')   as HTMLButtonElement;
  const btnClear    = document.getElementById('btn-clear-aoi')  as HTMLButtonElement;
  const aoiInfo     = document.getElementById('aoi-info')!;
  const instructions = document.getElementById('map-instructions')!;

  btnDraw.addEventListener('click', () => {
    aoi.start();
    btnDraw.disabled         = true;
    btnClear.disabled        = false;
    instructions.style.display = 'block';
    aoiInfo.textContent      = 'Click to add vertices. Double-click to close the polygon.';
  });

  btnClear.addEventListener('click', () => {
    aoi.clear();
    btnDraw.disabled   = false;
    btnClear.disabled  = true;
    aoiInfo.textContent = 'Click "Draw AOI Polygon" to start.';
    instructions.style.display = 'none';
  });

  aoi.on('stop', () => {
    btnDraw.disabled = false;
    instructions.style.display = 'none';
    aoiInfo.textContent = 'AOI saved. Run a compute job or draw a new one.';
  });
}

// ─── Mobile sidebar toggle ────────────────────────────────────────────────────

function initMobileToggle(): void {
  const toggle  = document.getElementById('menu-toggle')   as HTMLButtonElement;
  const sidebar = document.getElementById('sidebar')       as HTMLElement;

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // Close sidebar when clicking on the map
  document.getElementById('map')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('#sidebar') === null) {
      sidebar.classList.remove('open');
    }
  });
}

// ─── Waterways section ────────────────────────────────────────────────────────

function initWaterwaysSection(map: MLMap): void {
  const btn         = document.getElementById('btn-fetch-waterways') as HTMLButtonElement;
  const statusEl    = document.getElementById('waterways-status')!;
  const spinner     = document.getElementById('waterways-spinner')!;
  const spinnerText = document.getElementById('waterways-spinner-text')!;
  const resultsEl   = document.getElementById('waterways-results')!;
  const countEl     = document.getElementById('waterways-count')!;

  const worker = getPyWorker();

  btn.addEventListener('click', async () => {
    btn.disabled            = true;
    spinner.style.display   = 'flex';
    resultsEl.style.display = 'none';

    // Issue #2: update both status paragraph and spinner label together
    const setStatus = (msg: string) => {
      statusEl.textContent    = msg;
      spinnerText.textContent = msg;
    };

    // Issue #6: forward Pyodide loading messages into waterways status
    const pyStatus = ({ status, message }: { status: string; message: string }) => {
      if (status === 'loading') setStatus(`⏳ ${message}`);
      else if (status === 'ready') setStatus('Python runtime ready – running connectivity…');
    };
    worker.onStatus(pyStatus);

    try {
      // 1. Fetch from Overpass
      const data = await fetchKeralaWaterways(setStatus);
      setStatus(`${data.nodes.length.toLocaleString()} features – rendering…`);

      // 2. Render raw waterways (initial blue colouring)
      setWaterwaysLayer(map, data.geojson);

      // Fly to Kerala
      map.fitBounds([74.85, 8.18, 77.84, 12.84], { padding: 20, duration: 1000 });

      // 3. Build proximity graph (100 m threshold)
      setStatus(`Building proximity graph (100 m threshold)…`);
      const edges = buildProximityEdges(data.nodes, 100);
      setStatus(`Graph: ${data.nodes.length.toLocaleString()} nodes · ${edges.length.toLocaleString()} edges – running connectivity…`);

      // 4. Connectivity analysis via Pyodide
      const result = await worker.connectivity(edges);

      // 5. Colour components on the map
      const coloredGeoJSON = colorComponentsGeoJSON(data.geojson, result.components);
      setWaterwaysLayer(map, coloredGeoJSON);

      // 6. Update UI
      const topSize = result.component_sizes[0] ?? 0;
      setStatus(
        `✓ ${data.nodes.length.toLocaleString()} waterways · ` +
        `${result.num_components} component(s) · ` +
        `largest: ${topSize} node(s)`,
      );
      countEl.textContent =
        `${data.nodes.length.toLocaleString()} waterways · ` +
        `${result.num_components} connected component(s)`;
      resultsEl.style.display = 'block';
      btn.textContent = '🔄 Re-fetch Waterways';

    } catch (err) {
      setStatus(`⚠ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      worker.offStatus(pyStatus);
      btn.disabled          = false;
      spinner.style.display = 'none';
    }
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Register service worker early
  void registerServiceWorker();

  initNetworkStatus();
  initMobileToggle();

  const loader     = document.getElementById('map-loader')!;
  const loaderText = document.getElementById('map-loader-text')!;

  // Load pack index (non-blocking for map)
  fetchPackIndex()
    .then((idx) => renderPackList(idx.packs))
    .catch((err) => {
      const el = document.getElementById('packs-list')!;
      el.innerHTML = `<p style="font-size:.75rem;color:var(--danger)">Could not load pack index: ${err.message}</p>`;
    });

  // Init map
  const map = await new Promise<MLMap>((resolve) => {
    createMap({
      container: 'map',
      onLoaded: (m) => resolve(m),
      onError: (err) => {
        loaderText.textContent = `Map error: ${err instanceof Error ? err.message : String(err)}`;
        console.error('[map] error', err);
      },
    });
  });

  // Hide loader
  loader.style.display = 'none';

  // AOI
  const aoi = new AoiDraw(map);
  initAoiSection(aoi);
  initComputeSection(map, aoi);
  initWaterwaysSection(map);
}

main().catch(console.error);
