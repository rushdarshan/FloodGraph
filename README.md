# NeerNet – FloodGraph

> **Serverless Geospatial Disaster Simulator**
> Offline-capable PWA · MapLibre GL JS · PMTiles · Pyodide (NetworkX in-browser) · Vanilla TypeScript

Copyright © 2026 Darshan K. · [MIT License](./LICENSE)

---

## Overview

**NeerNet** is a progressive web app that runs entirely in the browser — no backend required.
It renders a vector basemap using **MapLibre GL JS** + **PMTiles**, lets you draw an **AOI polygon**, and executes **Python graph algorithms** (NetworkX, NumPy) client-side inside a **Web Worker via Pyodide**.

Two offline modes are included:

| Mode | How it works |
|------|-------------|
| **Cache-as-you-pan** | The Service Worker intercepts every tile/style/glyph fetch and stores it in Cache Storage. When you go offline, previously viewed areas load without errors. |
| **Download Region Pack** | Explicitly download a self-contained pack (one `.pmtiles` file + style + sprites) via the sidebar. Works without any prior panning. |

---

## Quick Start

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9 (or pnpm / bun)

### Install & run

```bash
# 1. Clone / unzip the project
cd FloodGraph

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Open <http://localhost:5173>

> **Note**: The dev server sets `Cross-Origin-Opener-Policy: same-origin` and
> `Cross-Origin-Embedder-Policy: require-corp` headers, which are required for
> Pyodide's `SharedArrayBuffer` support.

### Build for production

```bash
npm run build        # outputs to dist/
npm run preview      # serve the prod build locally
```

---

## Basemap (OpenFreeMap)

By default NeerNet uses **[OpenFreeMap](https://openfreemap.org)** — a fully free, open-source tile service with no API key required.

```
Style URL: https://tiles.openfreemap.org/styles/liberty
```

You can swap this in `src/map.ts` → `BASEMAP_STYLE_URL`.

### Bringing your own PMTiles basemap

1. Download (or generate) a `.pmtiles` file for your region.
   Good sources: [Protomaps planet extract](https://maps.protomaps.com/builds/), [Geofabrik](https://download.geofabrik.de/).
2. Place the file in `public/` (e.g. `public/myregion.pmtiles`).
3. Edit `BASEMAP_STYLE_URL` in `src/map.ts` to point to a style that references `pmtiles:///myregion.pmtiles`.
4. The `pmtiles://` protocol prefix is handled automatically by the `pmtiles` npm package's `Protocol` registered in `map.ts`.

---

## Offline Caching

### How cache-as-you-pan works

```
Browser                   Service Worker           Network
  │ fetch tile/style/glyph │                          │
  │────────────────────────▶│                          │
  │                         │── cache hit? ─────────── │
  │                         │   yes → return cached   │
  │                         │   no  → fetch network ──▶│
  │                         │          store in cache ◀│
  │◀────────────────────────│                          │
```

PMTiles files are fetched as **HTTP Range requests** (status 206).
The Service Worker (`public/sw.js`) stores each range response under a URL key
that includes the range fragment (`url#bytes_start-end`), so different byte ranges
of the same file never overwrite each other.

Cached assets:

| Cache name | Content |
|-----------|---------|
| `neernet-shell-v1` | HTML, JS/CSS chunks, manifest |
| `neernet-tiles-v1` | PMTiles range responses (cache-as-you-pan) |
| `neernet-styles-v1` | Style JSON, sprites, glyph PBFs |
| `neernet-offline-packs-v1` | Explicitly downloaded region packs |

### Download Region Pack

Region packs are defined in `public/offline-packs.json`:

```json
{
  "version": "1",
  "packs": [
    {
      "id": "kerala-india",
      "name": "Kerala, India",
      "pmtiles_url": "https://yourhost.com/kerala.pmtiles",
      "style_url":   "https://yourhost.com/kerala-style.json",
      "sprite_urls": ["https://yourhost.com/sprites/v4@2x.png", "…"],
      "glyph_url_prefix": "https://yourhost.com/fonts",
      "size_mb_approx": 85,
      "bbox": [74.85, 8.18, 77.64, 12.78]
    }
  ]
}
```

#### Pack index fields

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `name` | Display name shown in UI |
| `pmtiles_url` | Absolute URL to the `.pmtiles` file |
| `style_url` | MapLibre style JSON (must reference the `pmtiles_url`) |
| `sprite_urls` | List of sprite image + JSON URLs |
| `glyph_url_prefix` | Base URL for font glyphs (leave empty if style uses embedded fonts) |
| `size_mb_approx` | Approximate download size in MB (shown in UI) |
| `bbox` | `[minLng, minLat, maxLng, maxLat]` of the region |

The download client (`src/main.ts → downloadPack`) fetches each URL with streaming
progress and stores the full response in the `neernet-offline-packs-v1` cache.
When MapLibre requests tiles from the same URL offline, the Service Worker serves
the cached full file and synthesises a 206 Partial Content response from the
requested byte range.

---

## Pyodide Graph Algorithms

Python runs in a **Web Worker** (`src/py/worker.ts`) so it never blocks the UI thread.

### Jobs

#### `connectivity(edges)`

Input:
```json
{ "edges": [{ "source": "A", "target": "B" }, …] }
```

Output:
```json
{
  "num_components": 3,
  "component_sizes": [10, 4, 1],
  "components": [["A", "B", …], […], […]]
}
```

Uses `networkx.connected_components` on an undirected graph.

#### `toy_flood(edges, source_nodes, steps)`

Input:
```json
{
  "edges": [{ "source": "A", "target": "B" }, …],
  "source_nodes": ["A", "C"],
  "steps": 5
}
```

Output:
```json
{
  "flooded_nodes": ["A", "B", "C", "D", …],
  "steps_taken": 4
}
```

Simple BFS flood propagation from source nodes.

### Message protocol

All messages follow:

```typescript
// main → worker
{ id: string; type: 'connectivity' | 'toy_flood' | 'ping'; payload: unknown }

// worker → main
{ id: string; ok: true;  result: unknown }
{ id: string; ok: false; error: string  }

// special: status broadcasts
{ id: '__status__'; ok: true; result: { status: 'loading'|'ready'; message: string } }
```

### Extending with real flood / waterbody connectivity

Replace the synthetic grid in `src/main.ts` with real graph data:

1. **Fetch OSM road/river network** using Overpass API or a pre-built GeoJSON.
2. Convert features to `{ source: string; target: string }[]` edge list.
3. Pass edge list + real source nodes to `worker.toyFlood(…)`.
4. For physics-based simulation, add **SciPy** (lazy-loaded):
   ```typescript
   // In worker.ts, inside initPyodide():
   await pyodide.loadPackage(['scipy']);
   ```
5. Implement real flood algorithms (e.g. D8 flow direction, LISFLOOD-FP simplified) in Python inside `worker.ts` using `runPythonAsync`.

---

## Project Structure

```
FloodGraph/
├── LICENSE
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html                    # App shell
├── public/
│   ├── sw.js                     # Service worker
│   ├── manifest.json             # PWA manifest
│   ├── offline-packs.json        # Pack index
│   ├── icon-192.png              # PWA icon (provide your own)
│   └── icon-512.png              # PWA icon (provide your own)
└── src/
    ├── main.ts                   # App entry + UI wiring
    ├── map.ts                    # MapLibre init + PMTiles protocol + overlay layers
    ├── aoi.ts                    # AOI polygon draw tool
    └── py/
        ├── worker.ts             # Pyodide Web Worker (Python algorithms)
        └── client.ts             # Typed Promise-based worker client
```

---

## PWA Icons

The manifest references `icon-192.png` and `icon-512.png` in `public/`.
Generate them from any 512×512 source image:

```bash
# macOS / Linux with ImageMagick:
convert icon-source.png -resize 192x192 public/icon-192.png
convert icon-source.png -resize 512x512 public/icon-512.png
```

A quick SVG placeholder:

```bash
# Create a minimal blue square icon
echo '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" fill="#1a2744"/><text x="96" y="120" font-size="80" text-anchor="middle" fill="#3b82f6">🌊</text></svg>' > public/icon.svg
```

---

## COOP / COEP for Production

Pyodide needs `SharedArrayBuffer` which requires:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### Vite dev server
Already configured in `vite.config.ts`.

### Nginx
```nginx
add_header Cross-Origin-Opener-Policy  "same-origin";
add_header Cross-Origin-Embedder-Policy "require-corp";
```

### Apache
```apache
Header set Cross-Origin-Opener-Policy  "same-origin"
Header set Cross-Origin-Embedder-Policy "require-corp"
```

### GitHub Pages / Netlify / Vercel
Use the `coi-serviceworker` trick — add `public/coi-serviceworker.js` from
<https://github.com/gzuidhof/coi-serviceworker> and load it as the first script
in `index.html`.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Map shows blank / style 404 | Check browser console; OpenFreeMap may have CORS issues in some setups. Try a local style file. |
| Pyodide times out | First load downloads ~30 MB from CDN. Ensure network access; subsequent loads use the browser cache. |
| 206 responses not cached | Some browsers limit Cache Storage for range responses. Use the "Download Pack" flow for reliable offline. |
| SW not updating | Open DevTools → Application → Service Workers → "Update on reload" during development. |
| `SharedArrayBuffer` not available | Add COOP/COEP headers (see above). Without them Pyodide still works but is slower. |

---

## Roadmap

- [ ] Real OSM graph ingestion via Overpass API
- [ ] D8 / flow-accumulation flood simulation in Python
- [ ] Export flooded-area GeoJSON / CSV
- [ ] Multi-region pack management (delete, update)
- [ ] Offline Pyodide (bundle wheel files in the pack)

---

## Acknowledgements

Built with assistance from [Claude](https://claude.ai) (Anthropic) for code generation and architecture guidance. All code has been reviewed and understood by the author.

Data: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, via Overpass API.
Tiles: [OpenFreeMap](https://openfreemap.org) (no API key required).
Python runtime: [Pyodide](https://pyodide.org) / [NetworkX](https://networkx.org).
