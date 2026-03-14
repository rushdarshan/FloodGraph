import { useState, useRef, useEffect, useCallback } from 'react';
import type { Map as MLMap } from 'maplibre-gl';
import { MapView } from './components/MapView';
import { Sidebar } from './components/Sidebar';
import { MobileDrawer } from './components/MobileDrawer';
import { Header } from './components/Header';
import { Toaster } from './components/ui/sonner';
import { useIsMobile } from './components/ui/use-mobile';
import { AoiDraw } from './aoi.js';
import { clearOverlayLayers } from './map.js';
import { getPyWorker } from './py/client.js';
import type { WaterwayGraphData } from './components/sidebar/WaterwaysSection';

// ─── Service Worker ───────────────────────────────────────────────────────────
function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .then((reg) => console.log('[SW] registered, scope:', reg.scope))
    .catch((err) => console.warn('[SW] registration failed:', err));
}

export default function App() {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Map + AOI refs
  const [map, setMap] = useState<MLMap | null>(null);
  const aoiRef = useRef<AoiDraw | null>(null);
  const [aoi, setAoi] = useState<AoiDraw | null>(null);

  // Pyodide state
  const [pyodideStatus, setPyodideStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pyodideProgress, setPyodideProgress] = useState(0);
  const [pyodideMessage, setPyodideMessage] = useState('Initializing…');

  // AOI state
  const [aoiStatus, setAoiStatus] = useState<'idle' | 'drawing' | 'complete'>('idle');
  const [aoiVertices, setAoiVertices] = useState(0);

  // Compute results
  const [computeResult, setComputeResult] = useState<{
    nodesCount: number;
    edgesCount: number;
    componentsCount: number;
  } | null>(null);

  // Waterway graph data (populated after WaterwaysSection fetch)
  const [waterwayGraph, setWaterwayGraph] = useState<WaterwayGraphData | null>(null);

  // Register SW on mount
  useEffect(() => {
    registerServiceWorker();
  }, []);

  // Subscribe to Pyodide worker status
  useEffect(() => {
    const worker = getPyWorker();
    const handler = ({ status, message }: { status: string; message: string }) => {
      if (status === 'loading') {
        setPyodideStatus('loading');
        setPyodideMessage(message);
        // Rough progress: count status messages
        setPyodideProgress((prev) => Math.min(prev + 20, 90));
      } else if (status === 'ready') {
        setPyodideStatus('ready');
        setPyodideProgress(100);
        setPyodideMessage('Python runtime loaded successfully');
      }
    };
    worker.onStatus(handler);
    return () => worker.offStatus(handler);
  }, []);

  // When map is ready, create AOI draw instance
  const handleMapReady = useCallback((m: MLMap) => {
    setMap(m);
    const aoiDraw = new AoiDraw(m);
    aoiRef.current = aoiDraw;
    setAoi(aoiDraw);

    // Track AOI changes
    aoiDraw.on('change', (polygon) => {
      if (polygon) {
        setAoiStatus('complete');
      }
    });

    aoiDraw.on('stop', () => {
      setAoiStatus((prev) => (prev === 'drawing' ? 'complete' : prev));
    });
  }, []);

  const handleStartDrawing = useCallback(() => {
    if (aoiRef.current) {
      aoiRef.current.start();
      setAoiStatus('drawing');
      setAoiVertices(0);

      // Track vertex count during drawing
      const trackVertices = () => {
        const poly = aoiRef.current?.getPolygon();
        if (poly && poly.geometry.coordinates[0]) {
          // -1 because GeoJSON polygons duplicate the first point
          setAoiVertices(Math.max(0, poly.geometry.coordinates[0].length - 1));
        }
      };

      aoiRef.current.on('change', trackVertices);
    }
  }, []);

  const handleClearAoi = useCallback(() => {
    if (aoiRef.current) {
      aoiRef.current.clear();
    }
    if (map) {
      clearOverlayLayers(map);
    }
    setAoiStatus('idle');
    setAoiVertices(0);
    setComputeResult(null);
  }, [map]);

  const sharedProps = {
    map,
    aoi,
    pyodideStatus,
    pyodideProgress,
    pyodideMessage,
    aoiStatus,
    aoiVertices,
    computeResult,
    waterwayGraph,
    onStartDrawing: handleStartDrawing,
    onClearAoi: handleClearAoi,
    onComputeResult: setComputeResult,
    onWaterwaysResult: (_waterways: number, _components: number, graphData: WaterwayGraphData) => {
      setWaterwayGraph(graphData);
    },
  };

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <Header
        onToggleSidebar={() => {
          if (isMobile) {
            setIsMobileDrawerOpen((p) => !p);
          } else {
            setSidebarOpen((p) => !p);
          }
        }}
        sidebarOpen={sidebarOpen}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        {!isMobile && sidebarOpen && <Sidebar {...sharedProps} />}

        {/* Map */}
        <MapView
          aoiStatus={aoiStatus}
          aoiVertices={aoiVertices}
          onMapReady={handleMapReady}
        />
      </div>

      {/* Mobile drawer */}
      {isMobile && (
        <MobileDrawer
          open={isMobileDrawerOpen}
          onOpenChange={setIsMobileDrawerOpen}
          {...sharedProps}
        />
      )}

      <Toaster />
    </div>
  );
}
