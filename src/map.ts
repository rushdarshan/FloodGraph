/**
 * map.ts – MapLibre GL JS initialisation + PMTiles protocol registration.
 *
 * Tile source: OpenFreeMap (https://openfreemap.org) – completely free,
 * no API key required.  The `pmtiles://` URL prefix is handled by the
 * pmtiles npm package which intercepts MapLibre's tile requests.
 */

import maplibregl, {
  type Map as MLMap,
  type StyleSpecification,
  type GeoJSONSource,
  type VectorTileSource,
} from 'maplibre-gl';
import { Protocol } from 'pmtiles';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default centre: Kerala, India */
export const DEFAULT_CENTER: [number, number] = [76.27, 10.85];
export const DEFAULT_ZOOM = 7;

/**
 * OpenFreeMap vector basemap (liberty style).
 * Uses PMTiles under the hood – once cached the map works fully offline.
 */
export const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// ─── Protocol registration ───────────────────────────────────────────────────

let _protocolRegistered = false;

/**
 * Register the pmtiles:// protocol with MapLibre once.
 * Must be called before any map that uses pmtiles sources is created.
 */
export function registerPMTilesProtocol(): void {
  if (_protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol));
  _protocolRegistered = true;
}

// ─── Map factory ─────────────────────────────────────────────────────────────

export interface MapInitOptions {
  container: string | HTMLElement;
  /** Override the default style URL (e.g. local offline pack style) */
  styleUrl?: string;
  onLoaded?: (map: MLMap) => void;
  onError?: (err: Event | Error) => void;
}

export function createMap(opts: MapInitOptions): MLMap {
  registerPMTilesProtocol();

  const map = new maplibregl.Map({
    container: opts.container,
    style: opts.styleUrl ?? BASEMAP_STYLE_URL,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    maxPitch: 0,
    attributionControl: false,
  });

  // Compact attribution
  map.addControl(
    new maplibregl.AttributionControl({ compact: true }),
    'bottom-right',
  );

  // Navigation
  map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

  // Scale
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

  map.once('load', () => opts.onLoaded?.(map));
  map.on('error', (e) => opts.onError?.(e.error));

  return map;
}

// ─── Overlay layers ───────────────────────────────────────────────────────────

const FLOOD_NODES_SOURCE = 'flood-nodes';
const FLOOD_NODES_LAYER  = 'flood-nodes-circles';

const CONNECTIVITY_SOURCE = 'connectivity-components';
const CONNECTIVITY_LAYER  = 'connectivity-fill';

const CRITICAL_PATH_SOURCE = 'critical-path';
const CRITICAL_NODES_LAYER = 'critical-nodes';
const CRITICAL_EDGES_LAYER = 'critical-edges';

const FLOOD_SOURCE_SOURCE     = 'flood-source';
const FLOOD_SOURCE_RING_LAYER = 'flood-source-ring';
const FLOOD_SOURCE_DOT_LAYER  = 'flood-source-dot';

const ANIM_FLOOD_SOURCE    = 'anim-flood';
const ANIM_FLOOD_BGD_LAYER = 'anim-flood-flooded';
const ANIM_FLOOD_FGD_LAYER = 'anim-flood-frontier';

/**
 * Add (or update) a GeoJSON layer showing flooded nodes.
 * @param map     MapLibre map instance
 * @param points  Array of [lon, lat] coordinates
 */
export function setFloodNodesLayer(
  map: MLMap,
  points: [number, number][],
): void {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: points.map(([lon, lat]) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {},
    })),
  };

  if (map.getSource(FLOOD_NODES_SOURCE)) {
    (map.getSource(FLOOD_NODES_SOURCE) as GeoJSONSource).setData(geojson);
    return;
  }

  map.addSource(FLOOD_NODES_SOURCE, { type: 'geojson', data: geojson });

  map.addLayer({
    id: FLOOD_NODES_LAYER,
    type: 'circle',
    source: FLOOD_NODES_SOURCE,
    paint: {
      'circle-radius': 8,
      'circle-color': '#ef4444',
      'circle-opacity': 0.8,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#fff',
    },
  });
}

/**
 * Add (or update) a GeoJSON layer showing connectivity components
 * as small coloured circles.
 * @param map        MapLibre map instance
 * @param nodeMap    Record<nodeId, [lon,lat]> position lookup
 * @param components Array of component arrays (each is a list of node ids)
 */
export function setConnectivityLayer(
  map: MLMap,
  nodeMap: Record<string, [number, number]>,
  components: string[][],
): void {
  // Colour palette for components
  const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6'];

  const features: GeoJSON.Feature[] = [];

  components.forEach((comp, idx) => {
    const color = PALETTE[idx % PALETTE.length];
    comp.forEach((nodeId) => {
      const pos = nodeMap[nodeId];
      if (!pos) return;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: pos },
        properties: { component: idx, color },
      });
    });
  });

  const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };

  if (map.getSource(CONNECTIVITY_SOURCE)) {
    (map.getSource(CONNECTIVITY_SOURCE) as GeoJSONSource).setData(geojson);
    return;
  }

  map.addSource(CONNECTIVITY_SOURCE, { type: 'geojson', data: geojson });
  map.addLayer({
    id: CONNECTIVITY_LAYER,
    type: 'circle',
    source: CONNECTIVITY_SOURCE,
    paint: {
      'circle-radius': 7,
      'circle-color': ['get', 'color'],
      'circle-opacity': 0.9,
      'circle-stroke-width': 1,
      'circle-stroke-color': '#fff',
    },
  });
}

/**
 * Add (or update) a layer showing critical waterway infrastructure:
 * - Articulation points (orange circles — removal disconnects the graph)
 * - Bridges in the graph sense (orange lines — removal splits a component)
 *
 * @param map                MapLibre map instance
 * @param nodeMap            Record<nodeId, [lon,lat]> position lookup
 * @param articulationPoints Array of critical node ids
 * @param bridges            Array of [nodeA, nodeB] bridge edge pairs
 */
export function setCriticalPathLayer(
  map: MLMap,
  nodeMap: Record<string, [number, number]>,
  articulationPoints: string[],
  bridges: Array<[string, string]>,
): void {
  const nodeFeatures: GeoJSON.Feature[] = articulationPoints
    .map((id) => nodeMap[id])
    .filter(Boolean)
    .map((coords) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: coords },
      properties: { kind: 'ap' },
    }));

  const edgeFeatures: GeoJSON.Feature[] = bridges.flatMap(([a, b]) => {
    const posA = nodeMap[a];
    const posB = nodeMap[b];
    if (!posA || !posB) return [] as GeoJSON.Feature[];
    return [{
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: [posA, posB] },
      properties: { kind: 'bridge' },
    }] as GeoJSON.Feature[];
  });

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [...edgeFeatures, ...nodeFeatures],
  };

  if (map.getSource(CRITICAL_PATH_SOURCE)) {
    (map.getSource(CRITICAL_PATH_SOURCE) as GeoJSONSource).setData(geojson);
    return;
  }

  map.addSource(CRITICAL_PATH_SOURCE, { type: 'geojson', data: geojson });

  map.addLayer({
    id:     CRITICAL_EDGES_LAYER,
    type:   'line',
    source: CRITICAL_PATH_SOURCE,
    filter: ['==', ['get', 'kind'], 'bridge'],
    paint:  {
      'line-color':   '#f97316',
      'line-width':   3,
      'line-opacity': 0.9,
    },
  });

  map.addLayer({
    id:     CRITICAL_NODES_LAYER,
    type:   'circle',
    source: CRITICAL_PATH_SOURCE,
    filter: ['==', ['get', 'kind'], 'ap'],
    paint:  {
      'circle-radius':       7,
      'circle-color':        '#f97316',
      'circle-opacity':      0.9,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff',
    },
  });
}

/**
 * Remove all NeerNet overlay layers from the map.
 */
export function clearOverlayLayers(map: MLMap): void {
  for (const [layer, source] of [
    [FLOOD_NODES_LAYER, FLOOD_NODES_SOURCE],
    [CONNECTIVITY_LAYER, CONNECTIVITY_SOURCE],
  ] as const) {
    if (map.getLayer(layer))  map.removeLayer(layer);
    if (map.getSource(source)) map.removeSource(source);
  }
  // Critical path has two layers sharing one source
  if (map.getLayer(CRITICAL_NODES_LAYER)) map.removeLayer(CRITICAL_NODES_LAYER);
  if (map.getLayer(CRITICAL_EDGES_LAYER)) map.removeLayer(CRITICAL_EDGES_LAYER);
  if (map.getSource(CRITICAL_PATH_SOURCE)) map.removeSource(CRITICAL_PATH_SOURCE);
  // Animated flood layers
  if (map.getLayer(ANIM_FLOOD_FGD_LAYER)) map.removeLayer(ANIM_FLOOD_FGD_LAYER);
  if (map.getLayer(ANIM_FLOOD_BGD_LAYER)) map.removeLayer(ANIM_FLOOD_BGD_LAYER);
  if (map.getSource(ANIM_FLOOD_SOURCE))   map.removeSource(ANIM_FLOOD_SOURCE);
}

// ─── Flood source marker (pulsing, persists across computations) ─────────────

/**
 * WeakMap to track pulse timers per map instance.
 * Automatically cleaned up when map is garbage collected.
 * Replaces the previous global _pulseTimer to prevent resource leaks.
 */
const _pulseTimers = new WeakMap<MLMap, ReturnType<typeof setInterval>>();

function _stopPulse(map: MLMap): void {
  const timer = _pulseTimers.get(map);
  if (timer !== undefined) {
    clearInterval(timer);
    _pulseTimers.delete(map);
  }
}

function _startPulse(map: MLMap): void {
  _stopPulse(map);
  let t = 0;
  const timer = setInterval(() => {
    t += 0.12;
    const radius  = 16 + 8 * Math.abs(Math.sin(t));
    const opacity = 0.15 + 0.25 * (1 - Math.abs(Math.sin(t)));
    try {
      if (map.getLayer(FLOOD_SOURCE_RING_LAYER)) {
        map.setPaintProperty(FLOOD_SOURCE_RING_LAYER, 'circle-radius',  radius);
        map.setPaintProperty(FLOOD_SOURCE_RING_LAYER, 'circle-opacity', opacity);
      } else {
        _stopPulse(map);
      }
    } catch { _stopPulse(map); }
  }, 50);
  _pulseTimers.set(map, timer);
}

/**
 * Add (or move) the pulsing flood-source circle marking the selected node.
 */
export function setFloodSourceLayer(map: MLMap, coords: [number, number]): void {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: coords }, properties: {} }],
  };

  if (map.getSource(FLOOD_SOURCE_SOURCE)) {
    (map.getSource(FLOOD_SOURCE_SOURCE) as GeoJSONSource).setData(geojson);
    _startPulse(map);
    return;
  }

  map.addSource(FLOOD_SOURCE_SOURCE, { type: 'geojson', data: geojson });

  // Outer pulsing ring
  map.addLayer({
    id:     FLOOD_SOURCE_RING_LAYER,
    type:   'circle',
    source: FLOOD_SOURCE_SOURCE,
    paint:  { 'circle-radius': 20, 'circle-color': '#f97316', 'circle-opacity': 0.3 },
  });

  // Inner solid dot
  map.addLayer({
    id:     FLOOD_SOURCE_DOT_LAYER,
    type:   'circle',
    source: FLOOD_SOURCE_SOURCE,
    paint:  {
      'circle-radius':       9,
      'circle-color':        '#f97316',
      'circle-opacity':      1,
      'circle-stroke-width': 3,
      'circle-stroke-color': '#fff',
    },
  });

  _startPulse(map);
}

/** Remove the flood source marker and stop the pulse animation. */
export function clearFloodSourceLayer(map: MLMap): void {
  _stopPulse(map);
  if (map.getLayer(FLOOD_SOURCE_DOT_LAYER))  map.removeLayer(FLOOD_SOURCE_DOT_LAYER);
  if (map.getLayer(FLOOD_SOURCE_RING_LAYER)) map.removeLayer(FLOOD_SOURCE_RING_LAYER);
  if (map.getSource(FLOOD_SOURCE_SOURCE))    map.removeSource(FLOOD_SOURCE_SOURCE);
}

// ─── Animated flood layer ────────────────────────────────────────────────────

/**
 * Add (or update) the animated BFS flood layer.
 * - frontier nodes: bright red circles (new this step)
 * - already-flooded nodes: dark red circles
 */
export function setAnimatedFloodLayer(
  map: MLMap,
  nodeMap: Record<string, [number, number]>,
  allFloodedIds: string[],
  frontierIds: string[],
): void {
  const frontierSet = new Set(frontierIds);
  const features: GeoJSON.Feature[] = [];

  for (const id of allFloodedIds) {
    const coords = nodeMap[id];
    if (!coords) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords },
      properties: { _kind: frontierSet.has(id) ? 'frontier' : 'flooded' },
    });
  }

  const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };

  if (map.getSource(ANIM_FLOOD_SOURCE)) {
    (map.getSource(ANIM_FLOOD_SOURCE) as GeoJSONSource).setData(geojson);
    return;
  }

  map.addSource(ANIM_FLOOD_SOURCE, { type: 'geojson', data: geojson });

  map.addLayer({
    id:     ANIM_FLOOD_BGD_LAYER,
    type:   'circle',
    source: ANIM_FLOOD_SOURCE,
    filter: ['==', ['get', '_kind'], 'flooded'],
    paint:  { 'circle-radius': 5, 'circle-color': '#7f1d1d', 'circle-opacity': 0.7 },
  });

  map.addLayer({
    id:     ANIM_FLOOD_FGD_LAYER,
    type:   'circle',
    source: ANIM_FLOOD_SOURCE,
    filter: ['==', ['get', '_kind'], 'frontier'],
    paint:  {
      'circle-radius':       8,
      'circle-color':        '#ef4444',
      'circle-opacity':      0.9,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#fff',
    },
  });
}

/**
 * Switch the map to a different style (e.g. an offline pack style).
 * Preserves user-added sources / layers after the style loads.
 */
export function switchStyle(map: MLMap, styleUrl: string): void {
  map.setStyle(styleUrl);
}

/**
 * Swap in a locally-stored PMTiles source so the basemap works offline.
 * Call after the map 'style.load' event.
 *
 * @param map         MapLibre map
 * @param sourceId    Source id inside the style that uses tile data
 * @param pmtilesUrl  `pmtiles://…` URL pointing to the cached file
 */
export function patchSourceWithLocalPMTiles(
  map: MLMap,
  sourceId: string,
  pmtilesUrl: string,
): void {
  const src = map.getSource(sourceId) as VectorTileSource | undefined;
  if (!src) {
    console.warn(`[map] source "${sourceId}" not found`);
    return;
  }
  // MapLibre allows hot-swapping tile URLs for vector sources
  (src as unknown as { setUrl: (url: string) => void }).setUrl(pmtilesUrl);
}

// ─── Waterways layers ─────────────────────────────────────────────────────────

const WATERWAYS_SOURCE   = 'waterways';
const WATERWAYS_FILL_LYR = 'waterways-fill';
const WATERWAYS_LINE_LYR = 'waterways-line';

/**
 * Add (or update) the waterway GeoJSON layer.
 * Renders both LineStrings (waterways) and Polygons (water bodies).
 * Each feature must have a `_color` string property for data-driven paint.
 */
export function setWaterwaysLayer(
  map: MLMap,
  geojson: GeoJSON.FeatureCollection,
): void {
  if (map.getSource(WATERWAYS_SOURCE)) {
    (map.getSource(WATERWAYS_SOURCE) as GeoJSONSource).setData(geojson);
    return;
  }

  map.addSource(WATERWAYS_SOURCE, { type: 'geojson', data: geojson });

  // Polygon fill for water bodies
  map.addLayer({
    id:     WATERWAYS_FILL_LYR,
    type:   'fill',
    source: WATERWAYS_SOURCE,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint:  {
      'fill-color':   ['coalesce', ['get', '_color'], '#93c5fd'],
      'fill-opacity': 0.45,
    },
  });

  // Lines for waterway ways + polygon outlines
  map.addLayer({
    id:     WATERWAYS_LINE_LYR,
    type:   'line',
    source: WATERWAYS_SOURCE,
    paint:  {
      'line-color':   ['coalesce', ['get', '_color'], '#3b82f6'],
      'line-width':   ['interpolate', ['linear'], ['zoom'], 6, 1, 12, 3],
      'line-opacity': 0.85,
    },
  });
}

/** Remove waterway layers + source from the map. */
export function clearWaterwaysLayer(map: MLMap): void {
  if (map.getLayer(WATERWAYS_FILL_LYR)) map.removeLayer(WATERWAYS_FILL_LYR);
  if (map.getLayer(WATERWAYS_LINE_LYR)) map.removeLayer(WATERWAYS_LINE_LYR);
  if (map.getSource(WATERWAYS_SOURCE))  map.removeSource(WATERWAYS_SOURCE);
}

// ─── Style helpers (for offline pack integration) ─────────────────────────────

/**
 * Given a style JSON object, rewrite any tile source URLs to use
 * a locally-cached PMTiles file via the pmtiles:// protocol.
 *
 * @param style      Parsed style JSON
 * @param localUrl   Local URL (e.g. cached blob URL or sw-served URL)
 * @returns          Modified style clone
 */
export function patchStyleForOffline(
  style: StyleSpecification,
  localUrl: string,
): StyleSpecification {
  const patched = structuredClone(style) as StyleSpecification;

  for (const [, source] of Object.entries(patched.sources ?? {})) {
    if (source.type === 'vector' && 'url' in source && typeof source.url === 'string') {
      if (source.url.endsWith('.pmtiles') || source.url.includes('pmtiles')) {
        (source as { url: string }).url = `pmtiles://${localUrl}`;
      }
    }
  }

  return patched;
}
