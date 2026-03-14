import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { AppState } from '../App';
import { Badge } from './ui/badge';
import { MousePointer2, Hand } from 'lucide-react';

interface MapViewProps {
  appState: AppState;
  setAppState: (state: AppState | ((prev: AppState) => AppState)) => void;
}

export function MapView({ appState, setAppState }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current) return;

    // Initialize map
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm-tiles',
            minzoom: 0,
            maxzoom: 19
          }
        ]
      },
      center: [76.2711, 10.8505], // Kerala, India
      zoom: 7,
      attributionControl: true
    });

    // Add navigation controls
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.current.addControl(new maplibregl.ScaleControl(), 'bottom-left');

    map.current.on('load', () => {
      setMapLoaded(true);
      
      // Simulate Pyodide loading
      let progress = 0;
      const interval = setInterval(() => {
        progress += 20;
        setAppState(prev => ({ ...prev, pyodideProgress: progress }));
        if (progress >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setAppState(prev => ({ ...prev, pyodideStatus: 'ready' }));
          }, 500);
        }
      }, 400);
    });

    return () => {
      map.current?.remove();
    };
  }, []);

  // Handle drawing mode
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    
    if (appState.aoiStatus === 'drawing') {
      map.current.getCanvas().style.cursor = 'crosshair';
      
      // Simulate drawing - in real app, implement polygon drawing
      const handleClick = () => {
        setAppState(prev => ({ 
          ...prev, 
          aoiVertices: prev.aoiVertices + 1 
        }));
      };
      
      const handleDblClick = () => {
        if (appState.aoiVertices >= 3) {
          setAppState(prev => ({ ...prev, aoiStatus: 'complete' }));
          map.current!.getCanvas().style.cursor = '';
        }
      };
      
      map.current.on('click', handleClick);
      map.current.on('dblclick', handleDblClick);
      
      return () => {
        map.current?.off('click', handleClick);
        map.current?.off('dblclick', handleDblClick);
        if (map.current) {
          map.current.getCanvas().style.cursor = '';
        }
      };
    } else {
      map.current.getCanvas().style.cursor = '';
    }
  }, [appState.aoiStatus, appState.aoiVertices, mapLoaded]);

  return (
    <div className="flex-1 relative" role="main" aria-label="Map view">
      <div ref={mapContainer} className="w-full h-full" />
      
      {/* Drawing Status Indicator */}
      {appState.aoiStatus === 'drawing' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <Badge className="gap-2 text-sm px-4 py-2 shadow-lg">
            <MousePointer2 className="h-4 w-4 animate-pulse" />
            Click to add vertices • Double-click to finish
            {appState.aoiVertices > 0 && ` (${appState.aoiVertices} vertices)`}
          </Badge>
        </div>
      )}
      
      {/* Map Ready Indicator */}
      {!mapLoaded && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-20">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Loading map...</p>
          </div>
        </div>
      )}
      
      {/* Interaction Hint */}
      {mapLoaded && appState.aoiStatus === 'idle' && (
        <div className="absolute bottom-20 left-4 z-10">
          <Badge variant="secondary" className="gap-2 text-xs px-3 py-1.5">
            <Hand className="h-3 w-3" />
            Pan & zoom the map
          </Badge>
        </div>
      )}
    </div>
  );
}
