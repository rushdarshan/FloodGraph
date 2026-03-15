import { useEffect, useRef, useState } from 'react';
import type { Map as MLMap } from 'maplibre-gl';
import { createMap } from '../map.js';
import { Badge } from './ui/badge';
import { MapLegend } from './MapLegend.js';
import { MousePointer2, Hand } from 'lucide-react';
import type { LegendType } from './sidebar/ComputeSection.js';

interface MapViewProps {
  aoiStatus: 'idle' | 'drawing' | 'complete';
  aoiVertices: number;
  onMapReady: (map: MLMap) => void;
  activeLegend?: LegendType;
}

export function MapView({ aoiStatus, aoiVertices, onMapReady, activeLegend }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    createMap({
      container: mapContainerRef.current,
      onLoaded: (map) => { setMapLoaded(true); onMapReady(map); },
      onError: (err) => { console.error('[map] error', err); },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex-1 relative" role="main" aria-label="Map view">
      <div ref={mapContainerRef} className="w-full h-full" />

      {aoiStatus === 'drawing' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <Badge className="gap-2 text-sm px-4 py-2 shadow-lg">
            <MousePointer2 className="h-4 w-4 animate-pulse" />
            Click to add corners · Double-click to finish
            {aoiVertices > 0 && ` (${aoiVertices} added)`}
          </Badge>
        </div>
      )}

      {!mapLoaded && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-20">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Loading map…</p>
          </div>
        </div>
      )}

      {mapLoaded && aoiStatus === 'idle' && (
        <div className="absolute bottom-20 left-4 z-10">
          <Badge variant="secondary" className="gap-2 text-xs px-3 py-1.5">
            <Hand className="h-3 w-3" />
            Pan &amp; zoom the map
          </Badge>
        </div>
      )}

      {activeLegend && <MapLegend legend={activeLegend} />}
    </div>
  );
}
