import type { Map as MLMap, StyleSpecification } from 'maplibre-gl';
import { patchStyleForOffline, patchSourceWithLocalPMTiles } from './map.js';

export const OFFLINE_PACKS_CACHE_NAME = 'neernet-offline-packs-v1';
export const OFFLINE_PACK_SELECTED_KEY = 'neernet.offline.selectedPackId';

export const ENABLE_OFFLINE_PACK_DOWNLOADS = (import.meta.env.VITE_ENABLE_OFFLINE_PACKS ?? 'false') === 'true';

export type GlyphStrategy = 'prefetch' | 'runtime-cache' | 'none';

export interface OfflinePack {
  id: string;
  name: string;
  description: string;
  pmtiles_url: string;
  style_url: string;
  sprite_urls: string[];
  glyph_url_prefix: string;
  glyph_strategy?: GlyphStrategy;
  glyph_urls?: string[];
  size_mb_approx: number;
  bbox: [number, number, number, number];
  demo_only?: boolean;
}

interface PackIndex {
  version: string;
  packs: OfflinePack[];
}

export interface PackReadiness {
  ready: boolean;
  requiredUrls: string[];
  missingUrls: string[];
}

export function normalizePackUrl(url: string): string {
  return new URL(url, window.location.origin).toString();
}

export async function loadOfflinePackIndex(): Promise<OfflinePack[]> {
  const indexUrl = `${import.meta.env.BASE_URL}offline-packs.json`;
  const response = await fetch(indexUrl);
  if (!response.ok) {
    throw new Error(`Failed to load offline pack index: HTTP ${response.status}`);
  }
  const index = (await response.json()) as PackIndex;
  return index.packs;
}

export function getPackRequiredUrls(pack: OfflinePack): string[] {
  const required = [
    normalizePackUrl(pack.style_url),
    normalizePackUrl(pack.pmtiles_url),
    ...pack.sprite_urls.map(normalizePackUrl),
  ];

  const glyphStrategy = pack.glyph_strategy ?? 'none';
  if (glyphStrategy === 'prefetch') {
    required.push(...(pack.glyph_urls ?? []).map(normalizePackUrl));
  }

  return [...new Set(required)];
}

export async function checkPackReadiness(pack: OfflinePack): Promise<PackReadiness> {
  const requiredUrls = getPackRequiredUrls(pack);
  const cache = await caches.open(OFFLINE_PACKS_CACHE_NAME);

  const missingUrls: string[] = [];
  for (const requiredUrl of requiredUrls) {
    const cached = await cache.match(requiredUrl);
    if (!cached) {
      missingUrls.push(requiredUrl);
    }
  }

  return {
    ready: missingUrls.length === 0,
    requiredUrls,
    missingUrls,
  };
}

export async function cacheResponseAtUrl(url: string, response: Response): Promise<void> {
  const cache = await caches.open(OFFLINE_PACKS_CACHE_NAME);
  await cache.put(url, response);
}

export async function fetchStyleForPack(pack: OfflinePack): Promise<StyleSpecification> {
  const styleUrl = normalizePackUrl(pack.style_url);
  const cache = await caches.open(OFFLINE_PACKS_CACHE_NAME);

  const cachedStyle = await cache.match(styleUrl);
  if (cachedStyle) {
    return (await cachedStyle.json()) as StyleSpecification;
  }

  const networkStyle = await fetch(styleUrl);
  if (!networkStyle.ok) {
    throw new Error(`Could not fetch style for pack ${pack.name}: HTTP ${networkStyle.status}`);
  }

  const cloned = networkStyle.clone();
  await cache.put(styleUrl, cloned);
  return (await networkStyle.json()) as StyleSpecification;
}

export async function applyOfflinePack(map: MLMap, pack: OfflinePack): Promise<void> {
  const style = await fetchStyleForPack(pack);
  const localPmtilesUrl = normalizePackUrl(pack.pmtiles_url);
  const patchedStyle = patchStyleForOffline(style, localPmtilesUrl);

  map.setStyle(patchedStyle);

  map.once('style.load', () => {
    for (const [sourceId, source] of Object.entries(patchedStyle.sources ?? {})) {
      if (source.type === 'vector' && 'url' in source && typeof source.url === 'string' && source.url.startsWith('pmtiles://')) {
        patchSourceWithLocalPMTiles(map, sourceId, `pmtiles://${localPmtilesUrl}`);
      }
    }
  });

  localStorage.setItem(OFFLINE_PACK_SELECTED_KEY, pack.id);
}
