/**
 * aoi.ts – Click-to-draw AOI polygon on a MapLibre map.
 *
 * Usage:
 *   const aoi = new AoiDraw(map);
 *   aoi.start();                       // enable drawing mode
 *   aoi.stop();                        // disable (keeps current polygon)
 *   aoi.clear();                       // remove polygon + reset
 *   aoi.getPolygon();                  // GeoJSON Feature | null
 *   aoi.on('change', handler);        // fires when polygon changes
 */

import {
  type Map as MLMap,
  type MapMouseEvent,
  type GeoJSONSource,
} from 'maplibre-gl';

// ─── Source / layer ids ───────────────────────────────────────────────────────

const AOI_SOURCE       = 'aoi-source';
const AOI_FILL_LAYER   = 'aoi-fill';
const AOI_LINE_LAYER   = 'aoi-line';
const AOI_VERTEX_LAYER = 'aoi-vertices';
const AOI_PREVIEW_SOURCE = 'aoi-preview-source';
const AOI_PREVIEW_LAYER  = 'aoi-preview-line';

// ─── Types ────────────────────────────────────────────────────────────────────

type AoiEvent = 'change' | 'start' | 'stop';
type AoiHandler = (polygon: GeoJSON.Feature<GeoJSON.Polygon> | null) => void;

// ─── AoiDraw class ────────────────────────────────────────────────────────────

export class AoiDraw {
  private map: MLMap;
  private vertices: [number, number][] = [];
  private drawing = false;
  private polygon: GeoJSON.Feature<GeoJSON.Polygon> | null = null;
  private listeners: Map<AoiEvent, AoiHandler[]> = new Map();

  // Bound handler refs for cleanup
  private _onClick: (e: MapMouseEvent) => void;
  private _onDblClick: (e: MapMouseEvent) => void;
  private _onMouseMove: (e: MapMouseEvent) => void;

  constructor(map: MLMap) {
    this.map = map;

    this._onClick    = this._handleClick.bind(this);
    this._onDblClick = this._handleDblClick.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Enter drawing mode */
  start(): void {
    if (this.drawing) return;
    this.drawing  = true;
    this.vertices = [];
    this.polygon  = null;
    this.map.getCanvas().style.cursor = 'crosshair';
    this._ensureLayers();
    this._updateSources();
    this.map.on('click',     this._onClick);
    this.map.on('dblclick',  this._onDblClick);
    this.map.on('mousemove', this._onMouseMove);
    this._emit('start', null);
  }

  /** Exit drawing mode (without clearing the drawn polygon) */
  stop(): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.map.getCanvas().style.cursor = '';
    this.map.off('click',     this._onClick);
    this.map.off('dblclick',  this._onDblClick);
    this.map.off('mousemove', this._onMouseMove);
    // Hide preview line
    this._setPreview(null);
    this._emit('stop', this.polygon);
  }

  /** Remove the polygon and reset state */
  clear(): void {
    this.stop();
    this.vertices = [];
    this.polygon  = null;
    this._updateSources();
    this._emit('change', null);
  }

  /** Returns the current closed polygon, or null */
  getPolygon(): GeoJSON.Feature<GeoJSON.Polygon> | null {
    return this.polygon;
  }

  /** Register an event handler */
  on(event: AoiEvent, handler: AoiHandler): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(handler);
  }

  /** Remove an event handler */
  off(event: AoiEvent, handler: AoiHandler): void {
    const arr = this.listeners.get(event);
    if (!arr) return;
    const idx = arr.indexOf(handler);
    if (idx !== -1) arr.splice(idx, 1);
  }

  // ─── Event handlers ──────────────────────────────────────────────────────────

  private _handleClick(e: MapMouseEvent): void {
    if (!this.drawing) return;
    // Ignore the click that accompanies a dblclick (fired first)
    // We rely on dblclick to close, so stop propagation via the dblclick guard
    this.vertices.push([e.lngLat.lng, e.lngLat.lat]);
    this._updateSources();
  }

  private _handleDblClick(e: MapMouseEvent): void {
    if (!this.drawing) return;
    e.preventDefault(); // prevent map zoom on double-click

    // Need at least 3 unique vertices to form a polygon
    if (this.vertices.length < 3) return;

    // Remove the duplicate click vertex added by the final click before dblclick
    this.vertices.pop();

    this._closePolygon();
    this.stop();
  }

  private _handleMouseMove(e: MapMouseEvent): void {
    if (!this.drawing || this.vertices.length === 0) return;
    const cursor: [number, number] = [e.lngLat.lng, e.lngLat.lat];
    this._setPreview([...this.vertices, cursor]);
  }

  // ─── Polygon finalisation ────────────────────────────────────────────────────

  private _closePolygon(): void {
    const ring: [number, number][] = [...this.vertices, this.vertices[0]];
    this.polygon = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: {},
    };
    this._updateSources();
    this._emit('change', this.polygon);
  }

  // ─── Layer management ────────────────────────────────────────────────────────

  private _ensureLayers(): void {
    const map = this.map;
    if (!map.isStyleLoaded()) return;

    // Main AOI source
    if (!map.getSource(AOI_SOURCE)) {
      map.addSource(AOI_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }

    // Fill
    if (!map.getLayer(AOI_FILL_LAYER)) {
      map.addLayer({
        id: AOI_FILL_LAYER,
        type: 'fill',
        source: AOI_SOURCE,
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': 0.15,
        },
      });
    }

    // Outline
    if (!map.getLayer(AOI_LINE_LAYER)) {
      map.addLayer({
        id: AOI_LINE_LAYER,
        type: 'line',
        source: AOI_SOURCE,
        paint: {
          'line-color': '#3b82f6',
          'line-width': 2,
          'line-dasharray': [2, 2],
        },
      });
    }

    // Vertices
    if (!map.getLayer(AOI_VERTEX_LAYER)) {
      map.addLayer({
        id: AOI_VERTEX_LAYER,
        type: 'circle',
        source: AOI_SOURCE,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 5,
          'circle-color': '#3b82f6',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });
    }

    // Preview line source
    if (!map.getSource(AOI_PREVIEW_SOURCE)) {
      map.addSource(AOI_PREVIEW_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }

    if (!map.getLayer(AOI_PREVIEW_LAYER)) {
      map.addLayer({
        id: AOI_PREVIEW_LAYER,
        type: 'line',
        source: AOI_PREVIEW_SOURCE,
        paint: {
          'line-color': '#3b82f6',
          'line-width': 1.5,
          'line-dasharray': [3, 3],
          'line-opacity': 0.6,
        },
      });
    }
  }

  private _updateSources(): void {
    if (!this.map.isStyleLoaded()) return;
    this._ensureLayers();

    const features: GeoJSON.Feature[] = [];

    // Closed polygon (if done drawing)
    if (this.polygon) {
      features.push(this.polygon);
    }

    // Vertex dots (while drawing or when finished)
    for (const v of this.vertices) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: v },
        properties: {},
      });
    }

    const src = this.map.getSource(AOI_SOURCE) as GeoJSONSource | undefined;
    src?.setData({ type: 'FeatureCollection', features });
  }

  /** Show a preview rubber-band line from the last vertex to the cursor */
  private _setPreview(coords: [number, number][] | null): void {
    if (!this.map.isStyleLoaded()) return;
    const src = this.map.getSource(AOI_PREVIEW_SOURCE) as GeoJSONSource | undefined;
    if (!src) return;

    if (!coords || coords.length < 2) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    src.setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      }],
    });
  }

  // ─── Event emitter ───────────────────────────────────────────────────────────

  private _emit(event: AoiEvent, polygon: GeoJSON.Feature<GeoJSON.Polygon> | null): void {
    for (const h of this.listeners.get(event) ?? []) {
      h(polygon);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert an AOI polygon's bounding box to a 5-point ring
 * (useful for quick rectangle queries).
 */
export function polygonBbox(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
): [number, number, number, number] {
  const coords = polygon.geometry.coordinates[0];
  let minLng =  Infinity, minLat =  Infinity;
  let maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Generate a synthetic grid of points inside the AOI bounding box.
 * Used as stand-in graph nodes when no real network data is loaded.
 */
export function syntheticNodes(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  gridSize = 5,
): { nodes: string[]; positions: Record<string, [number, number]> } {
  const [minLng, minLat, maxLng, maxLat] = polygonBbox(polygon);
  const stepLng = (maxLng - minLng) / (gridSize + 1);
  const stepLat = (maxLat - minLat) / (gridSize + 1);

  const nodes: string[] = [];
  const positions: Record<string, [number, number]> = {};

  for (let i = 1; i <= gridSize; i++) {
    for (let j = 1; j <= gridSize; j++) {
      const id = `n_${i}_${j}`;
      nodes.push(id);
      positions[id] = [minLng + stepLng * i, minLat + stepLat * j];
    }
  }

  return { nodes, positions };
}

/**
 * Generate a synthetic edge list connecting the grid nodes in a lattice.
 */
export function syntheticEdges(gridSize = 5): [string, string][] {
  const edges: [string, string][] = [];
  for (let i = 1; i <= gridSize; i++) {
    for (let j = 1; j <= gridSize; j++) {
      if (i < gridSize) edges.push([`n_${i}_${j}`, `n_${i + 1}_${j}`]);
      if (j < gridSize) edges.push([`n_${i}_${j}`, `n_${i}_${j + 1}`]);
    }
  }
  return edges;
}
