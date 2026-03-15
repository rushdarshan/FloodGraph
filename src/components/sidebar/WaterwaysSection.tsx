import { useState } from 'react';
import type { Map as MLMap } from 'maplibre-gl';
import { Waves, Download, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { fetchKeralaWaterways, buildProximityEdges, colorComponentsGeoJSON } from '../../waterways.js';
import { setWaterwaysLayer } from '../../map.js';
import { getPyWorker, type ConnectivityEdge } from '../../py/client.js';

export interface WaterwayGraphData {
  edges: ConnectivityEdge[];
  nodeMap: Record<string, [number, number]>;
  geojson: GeoJSON.FeatureCollection;
  coloredGeojson: GeoJSON.FeatureCollection;
  components: string[][];
}

interface WaterwaysSectionProps {
  map: MLMap | null;
  onResult: (waterways: number, components: number, graphData: WaterwayGraphData) => void;
}

export function WaterwaysSection({ map, onResult }: WaterwaysSectionProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [waterwaysCount, setWaterwaysCount] = useState(0);
  const [componentsCount, setComponentsCount] = useState(0);

  const handleFetch = async () => {
    if (!map) return;
    setStatus('loading');
    setStatusMsg('Connecting to OpenStreetMap…');
    const worker = getPyWorker();
    const pyStatus = ({ status: s, message }: { status: string; message: string }) => {
      if (s === 'loading') setStatusMsg(message);
      else if (s === 'ready') setStatusMsg('Analysis engine ready — identifying connected networks…');
    };
    worker.onStatus(pyStatus);
    try {
      const data = await fetchKeralaWaterways((msg: string) => {
        if (msg.includes('Fetching') || msg.includes('fetch')) setStatusMsg('Downloading waterway data from OpenStreetMap…');
        else if (msg.includes('nodes') || msg.includes('way') || msg.includes('Parsing')) setStatusMsg('Processing waterway features…');
        else setStatusMsg(msg);
      });
      setStatusMsg('Rendering waterways on map…');
      setWaterwaysLayer(map, data.geojson);
      map.fitBounds([74.85, 8.18, 77.84, 12.84], { padding: 20, duration: 1000 });
      setStatusMsg('Building waterway connection graph…');
      const edges = buildProximityEdges(data.nodes, 100);
      setStatusMsg('Identifying connected waterway networks…');
      const result = await worker.connectivity(edges);
      const coloredGeoJSON = colorComponentsGeoJSON(data.geojson, result.components);
      setWaterwaysLayer(map, coloredGeoJSON);
      setWaterwaysCount(data.nodes.length);
      setComponentsCount(result.num_components);
      const nodeMap: Record<string, [number, number]> = {};
      for (const node of data.nodes) nodeMap[node.id] = node.centroid;
      onResult(data.nodes.length, result.num_components, { edges, nodeMap, geojson: data.geojson, coloredGeojson: coloredGeoJSON, components: result.components });
      const topSize = result.component_sizes[0] ?? 0;
      setStatusMsg(
        data.nodes.length.toLocaleString() + ' waterway sections across ' +
        result.num_components + ' connected network' + (result.num_components !== 1 ? 's' : '') +
        ' — largest has ' + topSize.toLocaleString() + ' sections'
      );
      setStatus('done');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    } finally {
      worker.offStatus(pyStatus);
    }
  };

  return (
    <section aria-labelledby="waterways-title">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle id="waterways-title" className="text-sm flex items-center gap-2">
            <Waves className="h-4 w-4" />
            Waterway Map
          </CardTitle>
          <CardDescription className="text-xs">
            Load real waterway data for Kerala from OpenStreetMap
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {status === 'idle' && (
            <Button onClick={handleFetch} className="w-full" disabled={!map} aria-label="Load Kerala waterway data">
              <Download className="h-4 w-4 mr-2" />
              Load Kerala Waterways
            </Button>
          )}
          {status === 'loading' && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-muted-foreground text-xs">{statusMsg}</span>
            </div>
          )}
          {status === 'error' && (
            <div className="space-y-2">
              <div className="bg-destructive/10 text-destructive rounded-md p-3 text-xs">{statusMsg}</div>
              <Button onClick={handleFetch} variant="outline" className="w-full">Try Again</Button>
            </div>
          )}
          {status === 'done' && (
            <div className="space-y-2">
              <div className="bg-green-500/10 text-green-400 rounded-md p-3 text-sm flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">Waterways Loaded</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">{waterwaysCount.toLocaleString()} sections</Badge>
                    <Badge variant="secondary" className="text-xs">{componentsCount} network{componentsCount !== 1 ? 's' : ''}</Badge>
                  </div>
                </div>
              </div>
              <Button onClick={handleFetch} variant="outline" className="w-full" size="sm">Refresh Data</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
