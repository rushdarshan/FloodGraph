/**
 * waterways.ts – Overpass API fetch + proximity graph construction.
 *
 * Fetches real waterway & waterbody data for Kerala from OpenStreetMap
 * via the Overpass API, converts it to GeoJSON, and builds a spatial
 * proximity graph for NetworkX connectivity analysis.
 */

import type { ConnectivityEdge } from './py/client.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/** Kerala state bounding box: south,west,north,east */
export const KERALA_BBOX = '8.18,74.85,12.84,77.84' as const;

/** Degrees per metre at ~10 °N (used for spatial grid cell sizing). */
const DEG_LAT_PER_M = 1 / 111_000;
const DEG_LNG_PER_M = 1 / 108_500;

const OVERPASS_QUERY = `
[out:json][timeout:60];
(
  way["natural"="water"](${KERALA_BBOX});
  way["waterway"](${KERALA_BBOX});
);
out geom;
`.trim();

// ─── Overpass response types ──────────────────────────────────────────────────

interface OverpassPoint { lat: number; lon: number; }

interface OverpassWay {
  type: 'way';
  id: number;
  tags?: Record<string, string>;
  geometry: OverpassPoint[];
}

interface OverpassResponse {
  version: number;
  elements: OverpassWay[];
}

// ─── Public types ─────────────────────────────────────────────────────────────

/** A single waterbody/waterway reduced to its node identity + centroid. */
export interface WaterwayNode {
  id: string;                 // "way/<osmId>"
  osmId: number;
  centroid: [number, number]; // [lng, lat]
  tags: Record<string, string>;
}

/** Full dataset returned after a successful fetch. */
export interface WaterwayData {
  nodes: WaterwayNode[];
  /** Lookup: node id → index into `nodes` array */
  nodeIndex: Record<string, number>;
  /** GeoJSON FeatureCollection (Lines + Polygons), each feature has _color prop */
  geojson: GeoJSON.FeatureCollection;
}

// ─── Fetch & parse ────────────────────────────────────────────────────────────

/**
 * Fetch Kerala waterways from the Overpass API and return structured data.
 * @param onStatus  Progress callback (shown in the UI)
 */
export async function fetchKeralaWaterways(
  onStatus: (msg: string) => void,
): Promise<WaterwayData> {
  onStatus('Querying Overpass API…');

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 30_000);

  let resp: Response;
  try {
    const body = new URLSearchParams({ data: OVERPASS_QUERY });
    resp = await fetch(OVERPASS_URL, {
      method:  'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal:  controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Overpass API timeout. Check internet connection or try again in 60 seconds.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!resp.ok) {
    throw new Error(`Overpass API returned HTTP ${resp.status}: ${await resp.text().catch(() => '')}`);
  }

  onStatus('Parsing features…');
  const json = await resp.json() as OverpassResponse;

  const elements = json.elements.filter(
    (el): el is OverpassWay =>
      el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2,
  );

  onStatus(`Processing ${elements.length.toLocaleString()} waterway features…`);

  const features:  GeoJSON.Feature[] = [];
  const nodes:     WaterwayNode[]    = [];
  const nodeIndex: Record<string, number> = {};

  for (const el of elements) {
    const id   = `way/${el.id}`;
    const tags = el.tags ?? {};
    const geom = el.geometry;
    const cent = computeCentroid(geom);

    nodes.push({ id, osmId: el.id, centroid: cent, tags });
    nodeIndex[id] = nodes.length - 1;

    const coords = geom.map((p): [number, number] => [p.lon, p.lat]);

    // A way is treated as a polygon when: it is explicitly a water body,
    // has at least 4 points, and is closed (first === last node).
    const isClosed =
      geom.length >= 4 &&
      geom[0].lat === geom[geom.length - 1].lat &&
      geom[0].lon === geom[geom.length - 1].lon;

    const isWaterPoly = isClosed && tags['natural'] === 'water';

    features.push(
      isWaterPoly
        ? {
            type: 'Feature',
            id:   el.id,
            geometry: { type: 'Polygon', coordinates: [coords] },
            properties: { id, osmId: el.id, name: tags['name'] ?? '', _color: '#93c5fd', _comp: -1 },
          }
        : {
            type: 'Feature',
            id:   el.id,
            geometry: { type: 'LineString', coordinates: coords },
            properties: { id, osmId: el.id, name: tags['name'] ?? '', waterway: tags['waterway'] ?? '', _color: '#3b82f6', _comp: -1 },
          },
    );
  }

  return {
    nodes,
    nodeIndex,
    geojson: { type: 'FeatureCollection', features },
  };
}

// ─── Centroid ─────────────────────────────────────────────────────────────────

function computeCentroid(geom: OverpassPoint[]): [number, number] {
  let sumLng = 0;
  let sumLat = 0;
  for (const p of geom) { sumLng += p.lon; sumLat += p.lat; }
  return [sumLng / geom.length, sumLat / geom.length];
}

// ─── Proximity graph ──────────────────────────────────────────────────────────

/**
 * Build an undirected edge list connecting waterbody nodes whose centroids
 * are within `thresholdM` metres of each other.
 *
 * Uses a sparse spatial grid to avoid O(n²) comparisons: each node
 * is placed in a grid cell of ≈ 2× the threshold diameter; only nodes
 * in the same or adjacent cells are compared.
 *
 * @param nodes       Array of WaterwayNode (output of fetchKeralaWaterways)
 * @param thresholdM  Adjacency distance in metres (e.g. 100)
 * @returns           Edge list as { source, target } pairs
 */
export function buildProximityEdges(
  nodes: WaterwayNode[],
  thresholdM: number,
): ConnectivityEdge[] {
  if (nodes.length === 0) return [];

  // Cell size: 2× threshold so all candidate pairs share a cell boundary
  const cellDLat = thresholdM * DEG_LAT_PER_M * 2;
  const cellDLng = thresholdM * DEG_LNG_PER_M * 2;

  // Sparse grid: "row,col" → list of node indices
  const grid = new Map<string, number[]>();

  const getCell = (lng: number, lat: number) => ({
    row: Math.floor(lat / cellDLat),
    col: Math.floor(lng / cellDLng),
  });
  const key = (r: number, c: number) => `${r},${c}`;

  for (let i = 0; i < nodes.length; i++) {
    const [lng, lat] = nodes[i].centroid;
    const { row, col } = getCell(lng, lat);
    const k = key(row, col);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(i);
  }

  const edges: ConnectivityEdge[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    const [lng, lat] = nodes[i].centroid;
    const { row, col } = getCell(lng, lat);

    // Check this cell + 8 neighbours
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const bucket = grid.get(key(row + dr, col + dc));
        if (!bucket) continue;

        for (const j of bucket) {
          if (j <= i) continue;
          const pKey = `${i}_${j}`;
          if (seen.has(pKey)) continue;
          seen.add(pKey);

          if (haversineM(nodes[i].centroid, nodes[j].centroid) <= thresholdM) {
            edges.push({ source: nodes[i].id, target: nodes[j].id });
          }
        }
      }
    }
  }

  return edges;
}

// ─── Haversine ────────────────────────────────────────────────────────────────

function haversineM(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number],
): number {
  const R    = 6_371_000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const φ1   = lat1 * (Math.PI / 180);
  const φ2   = lat2 * (Math.PI / 180);
  const a    = Math.sin(dLat / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ─── Component colouring ──────────────────────────────────────────────────────

const COMPONENT_PALETTE = [
  '#10b981', // emerald   (largest component)
  '#f59e0b', // amber
  '#a855f7', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#6366f1', // indigo
  '#84cc16', // lime
  '#ef4444', // red
  '#06b6d4', // cyan
];

/** Default blue used before connectivity is computed. */
const DEFAULT_WATERWAY_COLOR = '#3b82f6';

/**
 * Return a new FeatureCollection with `_color` and `_comp` properties
 * stamped on each feature according to the connectivity result.
 *
 * Features whose node is not in any component keep the default blue.
 *
 * @param geojson     Original WaterwayData.geojson
 * @param components  Array of string[] from the connectivity worker
 */
export function colorComponentsGeoJSON(
  geojson: GeoJSON.FeatureCollection,
  components: string[][],
): GeoJSON.FeatureCollection {
  // Build id → { compIndex, color }
  const colorMap = new Map<string, { color: string; comp: number }>();
  components.forEach((comp, idx) => {
    const color = COMPONENT_PALETTE[idx % COMPONENT_PALETTE.length];
    for (const nodeId of comp) {
      colorMap.set(nodeId, { color, comp: idx });
    }
  });

  const features = geojson.features.map((f) => {
    const id   = f.properties?.['id'] as string | undefined;
    const info = id ? colorMap.get(id) : undefined;
    return {
      ...f,
      properties: {
        ...f.properties,
        _color: info?.color ?? DEFAULT_WATERWAY_COLOR,
        _comp:  info?.comp  ?? -1,
      },
    };
  });

  return { type: 'FeatureCollection', features };
}
