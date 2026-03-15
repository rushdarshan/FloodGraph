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
  /** Waterway GeoJSON already coloured by connected component */
  coloredGeojson: GeoJSON.FeatureCollection;
  /** Raw component arrays from the connectivity worker */
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
    setStatusMsg('Fetching waterways from Overpass…');

    const worker = getPyWorker();

    // Forward Pyodide loading messages
    const pyStatus = ({ status: s, message }: { status: string; message: string }) => {
      if (s === 'loading') setStatusMsg(message);
      else if (s === 'ready') setStatusMsg('Python runtime ready – running connectivity…');
    };
    worker.onStatus(pyStatus);

    try {
      // 1. Fetch from Overpass
      const data = await fetchKeralaWaterways((msg: string) => setStatusMsg(msg));
      setStatusMsg(`${data.nodes.length.toLocaleString()} features – rendering…`);

      // 2. Render raw waterways
      setWaterwaysLayer(map, data.geojson);
      map.fitBounds([74.85, 8.18, 77.84, 12.84], { padding: 20, duration: 1000 });

      // 3. Build proximity graph
      setStatusMsg('Building proximity graph (100 m threshold)…');
      const edges = buildProximityEdges(data.nodes, 100);
      setStatusMsg(`Graph: ${data.nodes.length.toLocaleString()} nodes · ${edges.length.toLocaleString()} edges – running connectivity…`);

      // 4. Connectivity analysis via Pyodide
      const result = await worker.connectivity(edges);

      // 5. Colour components
      const coloredGeoJSON = colorComponentsGeoJSON(data.geojson, result.components);
      setWaterwaysLayer(map, coloredGeoJSON);

      // 6. Update UI
      setWaterwaysCount(data.nodes.length);
      setComponentsCount(result.num_components);

      // Build node position map for downstream consumers (ComputeSection)
      const nodeMap: Record<string, [number, number]> = {};
      for (const node of data.nodes) {
        nodeMap[node.id] = node.centroid;
      }
      onResult(data.nodes.length, result.num_components, {
        edges,
        nodeMap,
        coloredGeojson: coloredGeoJSON,
        components: result.components,
      });

      const topSize = result.component_sizes[0] ?? 0;
      setStatusMsg(
        `${data.nodes.length.toLocaleString()} waterways · ` +
        `${result.num_components} component(s) · ` +
        `largest: ${topSize} node(s)`,
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
            Kerala Waterways
          </CardTitle>
          <CardDescription className="text-xs">
            Fetch OSM data and build proximity graph
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {status === 'idle' && (
            <Button
              onClick={handleFetch}
              className="w-full"
              disabled={!map}
              aria-label="Fetch Kerala waterways data"
            >
              <Download className="h-4 w-4 mr-2" />
              Fetch Kerala Waterways
            </Button>
          )}

          {status === 'loading' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-muted-foreground text-xs">{statusMsg}</span>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-2">
              <div className="bg-destructive/10 text-destructive rounded-md p-3 text-xs">
                {statusMsg}
              </div>
              <Button onClick={handleFetch} variant="outline" className="w-full">
                Retry
              </Button>
            </div>
          )}

          {status === 'done' && (
            <div className="space-y-2">
              <div className="bg-green-500/10 text-green-400 rounded-md p-3 text-sm flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">Data Loaded</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">
                      {waterwaysCount.toLocaleString()} waterways
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {componentsCount} components
                    </Badge>
                  </div>
                </div>
              </div>
              <Button onClick={handleFetch} variant="outline" className="w-full" size="sm">
                Re-fetch Waterways
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
