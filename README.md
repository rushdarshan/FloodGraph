# NeerNet – FloodGraph

> **Offline Flood Connectivity Mapper for Disaster Response**
> React + TypeScript · MapLibre GL JS · PMTiles · Pyodide (NetworkX in-browser) · Tailwind CSS + shadcn/ui

Copyright © 2026 Darshan K. · [MIT License](./LICENSE)

---

## Overview

**NeerNet** is a progressive web app that runs entirely in the browser — no backend required.
It renders a vector basemap using **MapLibre GL JS** + **PMTiles**, lets you draw an **AOI polygon**, and executes **Python graph algorithms** client-side inside a **Web Worker via Pyodide/WebAssembly**.

Current capabilities:

- Fetches **1,68,060+ Kerala waterways** from OpenStreetMap via Overpass API
- Runs **NetworkX connected_components**, **BFS flood simulation**, **watershed stats**, **critical path detection**, and **risk scoring** entirely in the browser
- Animated flood BFS with step-by-step visualization
- Click-to-set flood source on the map
- Export results as GeoJSON

Two offline modes are included:

| Mode | How it works |
|------|-------------|
| **Cache-as-you-pan** | The Service Worker intercepts every tile/style/glyph fetch and stores it in Cache Storage. When you go offline, previously viewed areas load without errors. |
| **Download Region Pack** | Explicitly download a self-contained pack (one `.pmtiles` file + style + sprites) via the sidebar. Works without any prior panning. |

---

## FOSS Hack 2026

This project was built for FOSS Hack 2026. It uses two Partner Projects:
- **Pyodide** — Python/NetworkX runs entirely in the browser via WebAssembly
- **MapLibre GL JS** — Vector tile rendering with OpenStreetMap data

Related contribution: [PR #6133](https://github.com/pyodide/pyodide/pull/6133) — fixing console-v2 multiline paste and autocomplete bugs in Pyodide (approved by core maintainer).

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

### Offline demo mode (safe for hack demo)

NeerNet currently demos offline behavior using **cache-as-you-pan** only.

1. Ensure download-pack mode is disabled:

```bash
# .env.local
VITE_ENABLE_OFFLINE_PACKS=false
```

2. Start the app and keep DevTools open.
3. While online, pan and zoom the map in your target demo area for 30-60 seconds.
4. In DevTools -> Network, enable **Offline**.
5. Reload the page.
6. Verify previously visited areas still render from Service Worker cache.

When `VITE_ENABLE_OFFLINE_PACKS=false`, the UI shows an **Offline Demo Mode** panel instead of any download/apply pack controls.

Download-pack mode should only be re-enabled after a real PMTiles/style/glyph dataset is hosted and validated.

---

## Pyodide Graph Algorithms

Python runs in a **Web Worker** (`src/py/worker.ts`) so it never blocks the UI thread.

### Jobs

- `connectivity(edges)` — NetworkX `connected_components`
- `toy_flood(edges, source_nodes, steps)` — BFS flood simulation
- `animated_flood(edges, source, steps)` — returns per-step frames for animation
- `risk_score(edges, source_nodes)` — betweenness centrality + flood distance
- `watershed_stats(edges)` — outlets, headwaters, density, confluence
- `critical_path(edges)` — bridges and articulation points

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

### Extending flood / waterbody connectivity

Use the existing OSM ingestion pipeline as the base for deeper flood physics:

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
├── src/
│   ├── App.tsx                   # Central state management
│   ├── main.tsx                  # React entry point
│   ├── map.ts                    # MapLibre + PMTiles
│   ├── aoi.ts                    # AOI polygon draw
│   ├── waterways.ts              # Overpass API + graph building
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── MapView.tsx
│   │   ├── Sidebar.tsx
│   │   ├── MobileDrawer.tsx
│   │   └── sidebar/
│   │       ├── PyodideStatus.tsx
│   │       ├── AOISection.tsx
│   │       ├── WaterwaysSection.tsx
│   │       ├── ComputeSection.tsx
│   │       ├── ResultsSection.tsx
│   │       └── OfflinePackSection.tsx
│   ├── styles/
│   └── py/
│       ├── worker.ts             # Pyodide Web Worker
│       └── client.ts             # Worker client
```

---

## Live Demo
https://rushdarshan.github.io/FloodGraph/

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

- [x] Real OSM graph ingestion via Overpass API
- [x] Animated flood BFS visualization
- [x] Click-to-set flood source
- [x] Export results as GeoJSON
- [x] NetworkX graph algorithms in browser via Pyodide
- [ ] D8 / flow-accumulation physics-based flood simulation
- [ ] Multi-region pack management
- [ ] Offline Pyodide (bundle wheel files in the pack)

---

Data: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, via Overpass API.
Tiles: [OpenFreeMap](https://openfreemap.org) (no API key required).
Python runtime: [Pyodide](https://pyodide.org) / [NetworkX](https://networkx.org).
