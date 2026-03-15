import { useState, useRef, useEffect, useCallback } from 'react';
import type { Map as MLMap } from 'maplibre-gl';
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

  const waterwayGraphRef = useRef<WaterwayGraphData | null>(null);
  const aoiStatusRef     = useRef<'idle' | 'drawing' | 'complete'>('idle');
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

    m.on('click', (e) => {
      if (aoiStatusRef.current === 'drawing') return;
      const graph = waterwayGraphRef.current;
      if (!graph || Object.keys(graph.nodeMap).length === 0) return;
      const nearestId = findNearestNode(graph.nodeMap, e.lngLat.lng, e.lngLat.lat);
      if (nearestId) { setSelectedFloodSource(nearestId); setFloodSourceLayer(m, graph.nodeMap[nearestId]!); }
    });
  }, []);

  const handleStartDrawing = useCallback(() => {
    if (aoiRef.current) {
      aoiRef.current.start(); setAoiStatus('drawing'); setAoiVertices(0);
      const trackVertices = () => {
        const poly = aoiRef.current?.getPolygon();
        if (poly?.geometry.coordinates[0]) setAoiVertices(Math.max(0, poly.geometry.coordinates[0].length - 1));
      };
      aoiRef.current.on('change', trackVertices);
    }
  }, []);

  const handleClearAoi = useCallback(() => {
    if (aoiRef.current) aoiRef.current.clear();
    if (map) { clearOverlayLayers(map); clearFloodSourceLayer(map); }
    setAoiStatus('idle'); setAoiVertices(0); setComputeResult(null);
    setSelectedFloodSource(null); setActiveLegend(null);
  }, [map]);

  const sharedProps = {
    map, pyodideStatus, pyodideProgress, pyodideMessage,
    aoiStatus, aoiVertices, computeResult, waterwayGraph, selectedFloodSource,
    onStartDrawing: handleStartDrawing, onClearAoi: handleClearAoi,
    onComputeResult: setComputeResult,
    onWaterwaysResult: (_waterways: number, _components: number, graphData: WaterwayGraphData) => {
      setWaterwayGraph(graphData);
    },
    onLegendChange: setActiveLegend,
  };

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <Header
        onToggleSidebar={() => {
          if (isMobile) setIsMobileDrawerOpen((p) => !p);
          else setSidebarOpen((p) => !p);
        }}
        sidebarOpen={sidebarOpen}
      />
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
