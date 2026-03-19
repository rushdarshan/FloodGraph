import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { Map as MLMap, MapMouseEvent } from 'maplibre-gl';
import { MapView } from './components/MapView';
import { Sidebar } from './components/Sidebar';
import { MobileDrawer } from './components/MobileDrawer';
import { Header } from './components/Header';
import { Toaster } from './components/ui/sonner';
import { useIsMobile } from './components/ui/use-mobile';
import { AoiDraw } from './aoi.js';
import { clearOverlayLayers, setFloodSourceLayer, clearFloodSourceLayer } from './map.js';
import { getPyWorker } from './py/client.js';
import type { WaterwayGraphData } from './components/sidebar/WaterwaysSection';
import type { LegendType } from './components/sidebar/ComputeSection';
import {
  ENABLE_OFFLINE_PACK_DOWNLOADS,
  OFFLINE_PACK_SELECTED_KEY,
  applyOfflinePack,
  checkPackReadiness,
  loadOfflinePackIndex,
} from './offlinePacks.js';

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .then((reg) => console.log('[SW] registered, scope:', reg.scope))
    .catch((err) => console.warn('[SW] registration failed:', err));
}

function findNearestNode(nodeMap: Record<string, [number, number]>, lon: number, lat: number): string | null {
  let bestId: string | null = null;
  let bestDistSq = Infinity;
  for (const [id, [nLon, nLat]] of Object.entries(nodeMap)) {
    const dSq = (lon - nLon) ** 2 + (lat - nLat) ** 2;
    if (dSq < bestDistSq) { bestDistSq = dSq; bestId = id; }
  }
  return bestId;
}

export default function App() {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const [map, setMap] = useState<MLMap | null>(null);
  const aoiRef = useRef<AoiDraw | null>(null);

  const [pyodideStatus, setPyodideStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pyodideProgress, setPyodideProgress] = useState(0);
  const [pyodideMessage, setPyodideMessage] = useState('Initializing…');

  const [aoiStatus, setAoiStatus] = useState<'idle' | 'drawing' | 'complete'>('idle');
  const [aoiVertices, setAoiVertices] = useState(0);

  const [computeResult, setComputeResult] = useState<{ nodesCount: number; edgesCount: number; componentsCount: number } | null>(null);
  const [waterwayGraph, setWaterwayGraph] = useState<WaterwayGraphData | null>(null);
  const [selectedFloodSource, setSelectedFloodSource] = useState<string | null>(null);
  const [activeLegend, setActiveLegend] = useState<LegendType>(null);
  const [offlinePackNotice, setOfflinePackNotice] = useState<string | null>(null);

  const waterwayGraphRef = useRef<WaterwayGraphData | null>(null);
  const aoiStatusRef     = useRef<'idle' | 'drawing' | 'complete'>('idle');
  const mapClickHandlerRef = useRef<((e: MapMouseEvent) => void) | null>(null);
  const trackVerticesHandlerRef = useRef<(() => void) | null>(null);
  useEffect(() => { waterwayGraphRef.current = waterwayGraph; }, [waterwayGraph]);
  useEffect(() => { aoiStatusRef.current = aoiStatus; }, [aoiStatus]);

  useEffect(() => { registerServiceWorker(); }, []);

  useEffect(() => {
    const worker = getPyWorker();
    const handler = ({ status, message }: { status: string; message: string }) => {
      if (status === 'loading') {
        setPyodideStatus('loading'); setPyodideMessage(message);
        setPyodideProgress((prev) => Math.min(prev + 20, 90));
      } else if (status === 'ready') {
        setPyodideStatus('ready'); setPyodideProgress(100);
        setPyodideMessage('Python runtime loaded successfully');
      } else if (status === 'error') {
        setPyodideStatus('error');
        setPyodideMessage(message || 'Failed to load Python runtime');
      }
    };
    worker.onStatus(handler);
    const timeout = setTimeout(() => {
      setPyodideStatus((prev) => {
        if (prev !== 'ready') { setPyodideMessage('Analysis engine timed out — please refresh the page'); return 'error'; }
        return prev;
      });
    }, 120_000);
    return () => { worker.offStatus(handler); clearTimeout(timeout); };
  }, []);

  const handleMapReady = useCallback((m: MLMap) => {
    setMap(m);
    const aoiDraw = new AoiDraw(m);
    aoiRef.current = aoiDraw;
    aoiDraw.on('change', (polygon) => { if (polygon) setAoiStatus('complete'); });
    aoiDraw.on('stop', () => { setAoiStatus((prev) => (prev === 'drawing' ? 'complete' : prev)); });

    mapClickHandlerRef.current = (e) => {
      if (aoiStatusRef.current === 'drawing') return;
      const graph = waterwayGraphRef.current;
      if (!graph || Object.keys(graph.nodeMap).length === 0) return;
      const nearestId = findNearestNode(graph.nodeMap, e.lngLat.lng, e.lngLat.lat);
      if (nearestId) { setSelectedFloodSource(nearestId); setFloodSourceLayer(m, graph.nodeMap[nearestId]!); }
    };

    m.on('click', mapClickHandlerRef.current);
  }, []);

  const handleStartDrawing = useCallback(() => {
    if (aoiRef.current) {
      if (trackVerticesHandlerRef.current) {
        aoiRef.current.off('change', trackVerticesHandlerRef.current);
      }

      aoiRef.current.start(); setAoiStatus('drawing'); setAoiVertices(0);
      const trackVertices = () => {
        const poly = aoiRef.current?.getPolygon();
        if (poly?.geometry.coordinates[0]) setAoiVertices(Math.max(0, poly.geometry.coordinates[0].length - 1));
      };
      trackVerticesHandlerRef.current = trackVertices;
      aoiRef.current.on('change', trackVertices);
    }
  }, []);

  const handleClearAoi = useCallback(() => {
    if (aoiRef.current) aoiRef.current.clear();
    if (map) { clearOverlayLayers(map); clearFloodSourceLayer(map); }
    setAoiStatus('idle'); setAoiVertices(0); setComputeResult(null);
    setSelectedFloodSource(null); setActiveLegend(null);
  }, [map]);

  useEffect(() => {
    return () => {
      const currentMap = map;
      if (currentMap && mapClickHandlerRef.current) {
        currentMap.off('click', mapClickHandlerRef.current);
      }

      if (aoiRef.current && trackVerticesHandlerRef.current) {
        aoiRef.current.off('change', trackVerticesHandlerRef.current);
      }
    };
  }, [map]);

  const handleWaterwaysResult = useCallback((_waterways: number, _components: number, graphData: WaterwayGraphData) => {
    setWaterwayGraph(graphData);
  }, []);

  const handleOfflinePackNotice = useCallback((message: string) => {
    setOfflinePackNotice(message);
  }, []);

  useEffect(() => {
    if (!map) return;
    if (!ENABLE_OFFLINE_PACK_DOWNLOADS) {
      setOfflinePackNotice(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const selectedPackId = localStorage.getItem(OFFLINE_PACK_SELECTED_KEY);
      if (!selectedPackId) return;

      try {
        const packs = await loadOfflinePackIndex();
        const selectedPack = packs.find((pack) => pack.id === selectedPackId);
        if (!selectedPack) {
          if (!cancelled) {
            setOfflinePackNotice('Saved offline pack is no longer present in the pack index.');
          }
          return;
        }

        const readiness = await checkPackReadiness(selectedPack);
        if (!readiness.ready) {
          if (!cancelled) {
            setOfflinePackNotice(
              `Saved offline pack "${selectedPack.name}" is degraded. Missing ${readiness.missingUrls.length} required assets. Open Offline Packs and run Repair Download.`,
            );
          }
          return;
        }

        await applyOfflinePack(map, selectedPack);
        if (!cancelled) {
          setOfflinePackNotice(`Applied saved offline pack: ${selectedPack.name}`);
        }
      } catch (err) {
        if (!cancelled) {
          setOfflinePackNotice(
            `Saved offline pack could not be applied: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [map]);

  const sharedProps = useMemo(() => ({
    map, pyodideStatus, pyodideProgress, pyodideMessage,
    aoiStatus, aoiVertices, computeResult, waterwayGraph, selectedFloodSource,
    onStartDrawing: handleStartDrawing, onClearAoi: handleClearAoi,
    onComputeResult: setComputeResult,
    onWaterwaysResult: handleWaterwaysResult,
    onLegendChange: setActiveLegend,
    onOfflinePackNotice: handleOfflinePackNotice,
  }), [
    map,
    pyodideStatus,
    pyodideProgress,
    pyodideMessage,
    aoiStatus,
    aoiVertices,
    computeResult,
    waterwayGraph,
    selectedFloodSource,
    handleStartDrawing,
    handleClearAoi,
    handleWaterwaysResult,
    handleOfflinePackNotice,
  ]);

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <Header
        onToggleSidebar={() => {
          if (isMobile) setIsMobileDrawerOpen((p) => !p);
          else setSidebarOpen((p) => !p);
        }}
        sidebarOpen={sidebarOpen}
      />
      {offlinePackNotice && (
        <div className="border-b border-border bg-warning/10 px-4 py-2 text-sm text-warning">
          {offlinePackNotice}
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        {!isMobile && sidebarOpen && <Sidebar {...sharedProps} />}
        <MapView aoiStatus={aoiStatus} aoiVertices={aoiVertices} onMapReady={handleMapReady} activeLegend={activeLegend} />
      </div>
      {isMobile && (
        <MobileDrawer open={isMobileDrawerOpen} onOpenChange={setIsMobileDrawerOpen} {...sharedProps} />
      )}
      <Toaster />
    </div>
  );
}
