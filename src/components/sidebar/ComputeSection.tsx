import { useState, useRef, useEffect } from 'react';
import type { Map as MLMap } from 'maplibre-gl';
import { Cpu, Play, Loader2, AlertCircle, Download, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import type { WaterwayGraphData } from './WaterwaysSection';
import { getPyWorker } from '../../py/client.js';
import type { WatershedStatsResult } from '../../py/client.js';
import { colorComponentsGeoJSON, riskScoreGeoJSON } from '../../waterways.js';
import {
  setFloodNodesLayer,
  setWaterwaysLayer,
  setCriticalPathLayer,
  setAnimatedFloodLayer,
  clearOverlayLayers,
} from '../../map.js';

interface ComputeSectionProps {
  map: MLMap | null;
  pyodideReady: boolean;
  waterwayGraph: WaterwayGraphData | null;
  selectedFloodSource: string | null;
  onResult: (data: { nodesCount: number; edgesCount: number; componentsCount: number }) => void;
}

export function ComputeSection({
  map,
  pyodideReady,
  waterwayGraph,
  selectedFloodSource,
  onResult,
}: ComputeSectionProps) {
  const [status, setStatus]     = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [watershedStats, setWatershedStats] = useState<WatershedStatsResult | null>(null);
  const [lastResultGeoJSON, setLastResultGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);

  const animIntervalRef = useRef<number | null>(null);

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      if (animIntervalRef.current !== null) window.clearInterval(animIntervalRef.current);
    };
  }, []);

  const hasWaterways = waterwayGraph !== null;
  const canRun       = pyodideReady && map !== null && hasWaterways;

  /** Stop any running animation before starting a new computation. */
  function stopAnimation() {
    if (animIntervalRef.current !== null) {
      window.clearInterval(animIntervalRef.current);
      animIntervalRef.current = null;
    }
  }

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleConnectivity = async () => {
    if (!canRun) return;
    stopAnimation();
    setStatus('running');
    setStatusMsg('Running nx.connected_components via Pyodide…');
    setWatershedStats(null);
    setLastResultGeoJSON(null);
    clearOverlayLayers(map!);

    try {
      const result   = await getPyWorker().connectivity(waterwayGraph.edges);
      const recolored = colorComponentsGeoJSON(waterwayGraph.geojson, result.components);
      setWaterwaysLayer(map!, recolored);
      setLastResultGeoJSON(recolored);

      const nodeCount = Object.keys(waterwayGraph.nodeMap).length;
      setStatusMsg(`${result.num_components} component(s) · ${nodeCount.toLocaleString()} nodes`);
      setStatus('complete');
      onResult({ nodesCount: nodeCount, edgesCount: waterwayGraph.edges.length, componentsCount: result.num_components });
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const handleFloodBFS = async () => {
    if (!canRun) return;
    stopAnimation();

    const nodeIds    = Object.keys(waterwayGraph.nodeMap);
    const sourceNodes = selectedFloodSource ? [selectedFloodSource] : nodeIds.slice(0, 3);

    setStatus('running');
    setStatusMsg(`Running nx BFS toy_flood from ${sourceNodes.length} source(s)…`);
    setWatershedStats(null);
    setLastResultGeoJSON(null);
    clearOverlayLayers(map!);

    try {
      const result = await getPyWorker().toyFlood(waterwayGraph.edges, sourceNodes, 4);

      const floodCoords = result.flooded_nodes
        .map((id) => waterwayGraph.nodeMap[id])
        .filter(Boolean) as [number, number][];

      setFloodNodesLayer(map!, floodCoords);

      // Build GeoJSON for export
      const ptGeoJSON: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: floodCoords.map((coords) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: coords },
          properties: { _kind: 'flooded' },
        })),
      };
      setLastResultGeoJSON(ptGeoJSON);

      setStatusMsg(`${result.flooded_nodes.length} nodes flooded in ${result.steps_taken} step(s)`);
      setStatus('complete');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const handleAnimatedFlood = async () => {
    if (!canRun) return;
    stopAnimation();

    const nodeIds     = Object.keys(waterwayGraph.nodeMap);
    const sourceNodes = selectedFloodSource ? [selectedFloodSource] : nodeIds.slice(0, 3);

    setStatus('running');
    setStatusMsg(`Running nx animated BFS via Pyodide (${sourceNodes.length} source node(s))…`);
    setWatershedStats(null);
    setLastResultGeoJSON(null);
    clearOverlayLayers(map!);

    try {
      const result = await getPyWorker().animatedFlood(waterwayGraph.edges, sourceNodes, 10);
      const frames  = result.frames;

      let step = 0;
      setStatus('complete');
      setStatusMsg(`Step 1 of ${frames.length}`);

      animIntervalRef.current = window.setInterval(() => {
        if (step >= frames.length) {
          window.clearInterval(animIntervalRef.current!);
          animIntervalRef.current = null;

          const lastFrame = frames[frames.length - 1];
          const ptGeoJSON: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: lastFrame
              .map((id) => waterwayGraph.nodeMap[id])
              .filter(Boolean)
              .map((coords) => ({
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: coords },
                properties: { _kind: 'flooded' },
              })),
          };
          setLastResultGeoJSON(ptGeoJSON);
          setStatusMsg(`Complete: ${lastFrame.length.toLocaleString()} nodes reached in ${frames.length - 1} step(s)`);
          return;
        }

        const allFlooded = frames[step];
        const prevSet    = step > 0 ? new Set(frames[step - 1]) : new Set<string>();
        const frontier   = allFlooded.filter((id) => !prevSet.has(id));

        setAnimatedFloodLayer(map!, waterwayGraph.nodeMap, allFlooded, frontier);
        setStatusMsg(`Step ${step + 1} of ${frames.length} · ${allFlooded.length.toLocaleString()} nodes flooded`);
        step++;
      }, 600);

    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const handleRiskScore = async () => {
    if (!canRun) return;
    stopAnimation();

    const nodeIds     = Object.keys(waterwayGraph.nodeMap);
    const sourceNodes = selectedFloodSource ? [selectedFloodSource] : nodeIds.slice(0, 5);

    setStatus('running');
    setStatusMsg('Running nx.betweenness_centrality + flood proximity via Pyodide…');
    setWatershedStats(null);
    setLastResultGeoJSON(null);
    clearOverlayLayers(map!);

    try {
      const result  = await getPyWorker().riskScore(waterwayGraph.edges, sourceNodes);
      const colored = riskScoreGeoJSON(waterwayGraph.geojson, result.scores, result.max_score);
      setWaterwaysLayer(map!, colored);
      setLastResultGeoJSON(colored);

      const highRisk = Object.values(result.scores).filter((s) => s > result.max_score * 0.75).length;
      setStatusMsg(`Risk scored ${Object.keys(result.scores).length.toLocaleString()} nodes · ${highRisk.toLocaleString()} high-risk`);
      setStatus('complete');
      onResult({ nodesCount: nodeIds.length, edgesCount: waterwayGraph.edges.length, componentsCount: 0 });
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const handleWatershedStats = async () => {
    if (!canRun) return;
    stopAnimation();
    setStatus('running');
    setStatusMsg('Running nx.DiGraph degree analysis via Pyodide…');
    setWatershedStats(null);

    try {
      const result = await getPyWorker().watershedStats(waterwayGraph.edges);
      setWatershedStats(result);
      setStatusMsg(`${result.node_count.toLocaleString()} nodes · ${result.component_count} components · density ${result.density}`);
      setStatus('complete');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const handleCriticalPath = async () => {
    if (!canRun) return;
    stopAnimation();
    setStatus('running');
    setStatusMsg('Running nx.articulation_points + nx.bridges via Pyodide…');
    setWatershedStats(null);
    setLastResultGeoJSON(null);
    clearOverlayLayers(map!);

    try {
      const result = await getPyWorker().criticalPath(waterwayGraph.edges);
      setCriticalPathLayer(map!, waterwayGraph.nodeMap, result.articulation_points, result.bridges);

      // Build exportable GeoJSON
      const features: GeoJSON.Feature[] = [
        ...result.articulation_points
          .map((id) => waterwayGraph.nodeMap[id])
          .filter(Boolean)
          .map((coords) => ({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: coords },
            properties: { _kind: 'articulation_point' },
          })),
        ...result.bridges.flatMap(([a, b]) => {
          const posA = waterwayGraph.nodeMap[a];
          const posB = waterwayGraph.nodeMap[b];
          if (!posA || !posB) return [] as GeoJSON.Feature[];
          return [{ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: [posA, posB] }, properties: { _kind: 'bridge' } }] as GeoJSON.Feature[];
        }),
      ];
      setLastResultGeoJSON({ type: 'FeatureCollection', features });

      setStatusMsg(`${result.ap_count.toLocaleString()} critical nodes · ${result.bridge_count.toLocaleString()} bridges`);
      setStatus('complete');
      onResult({ nodesCount: Object.keys(waterwayGraph.nodeMap).length, edgesCount: waterwayGraph.edges.length, componentsCount: result.ap_count });
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const handleExport = () => {
    if (!lastResultGeoJSON) return;
    const json = JSON.stringify(lastResultGeoJSON, null, 2);
    const blob = new Blob([json], { type: 'application/geo+json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `neernet-results-${Date.now()}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('GeoJSON exported — open in QGIS or ArcGIS');
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <section aria-labelledby="compute-title">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle id="compute-title" className="text-sm flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            Graph Compute (Pyodide)
          </CardTitle>
          <CardDescription className="text-xs">
            {hasWaterways
              ? 'Run NetworkX algorithms on real waterway graph'
              : 'Fetch waterways to enable computation'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {!canRun && (
            <div className="bg-muted rounded-md p-3 flex items-start gap-2 text-muted-foreground">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p className="text-xs">
                {!hasWaterways ? 'Fetch Kerala waterways first' : 'Waiting for Pyodide to load…'}
              </p>
            </div>
          )}

          {status === 'running' && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-muted-foreground text-xs">{statusMsg}</span>
            </div>
          )}

          {canRun && status !== 'running' && (
            <div className="space-y-2">
              <Button onClick={handleConnectivity} className="w-full" aria-label="Run connectivity analysis">
                <Play className="h-4 w-4 mr-2" />
                Run Connectivity
              </Button>

              <Button onClick={handleFloodBFS} variant="outline" className="w-full" aria-label="Run flood BFS simulation">
                <Play className="h-4 w-4 mr-2" />
                Run Flood BFS
              </Button>
              {hasWaterways && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 pl-1">
                  <MapPin className="h-3 w-3" />
                  {selectedFloodSource
                    ? `Source: ${selectedFloodSource.slice(0, 20)}…`
                    : 'Click map to set flood source'}
                </p>
              )}

              <Button onClick={handleAnimatedFlood} variant="outline" className="w-full" aria-label="Run animated flood BFS">
                <Play className="h-4 w-4 mr-2" />
                Run Animated Flood
              </Button>

              <Button onClick={handleRiskScore} variant="outline" className="w-full" aria-label="Run flood risk scoring">
                <Play className="h-4 w-4 mr-2" />
                Run Risk Score
              </Button>

              <Button onClick={handleWatershedStats} variant="outline" className="w-full" aria-label="Compute watershed statistics">
                <Play className="h-4 w-4 mr-2" />
                Watershed Stats
              </Button>

              <Button onClick={handleCriticalPath} variant="outline" className="w-full" aria-label="Find critical path nodes and bridges">
                <Play className="h-4 w-4 mr-2" />
                Find Critical Points
              </Button>
            </div>
          )}

          {status === 'complete' && (
            <p className="text-xs text-green-400 text-center">{statusMsg}</p>
          )}

          {status === 'error' && (
            <div className="bg-destructive/10 text-destructive rounded-md p-3 text-xs">
              {statusMsg}
            </div>
          )}

          {/* Watershed stats table */}
          {watershedStats && status === 'complete' && (
            <div className="rounded-md border border-border p-3 space-y-1.5 text-xs">
              <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Watershed Statistics</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <span className="text-muted-foreground">Nodes</span>
                <span className="text-right font-mono">{watershedStats.node_count.toLocaleString()}</span>
                <span className="text-muted-foreground">Edges</span>
                <span className="text-right font-mono">{watershedStats.edge_count.toLocaleString()}</span>
                <span className="text-muted-foreground">Components</span>
                <span className="text-right font-mono">{watershedStats.component_count}</span>
                <span className="text-muted-foreground">Largest</span>
                <span className="text-right font-mono">{watershedStats.largest_component.toLocaleString()}</span>
                <span className="text-muted-foreground">Outlets</span>
                <span className="text-right font-mono">{watershedStats.outlet_count.toLocaleString()}</span>
                <span className="text-muted-foreground">Headwaters</span>
                <span className="text-right font-mono">{watershedStats.headwater_count.toLocaleString()}</span>
                <span className="text-muted-foreground">Confluences</span>
                <span className="text-right font-mono">{watershedStats.confluence_count.toLocaleString()}</span>
                <span className="text-muted-foreground">Avg degree</span>
                <span className="text-right font-mono">{watershedStats.avg_degree}</span>
                <span className="text-muted-foreground">Density</span>
                <span className="text-right font-mono">{watershedStats.density}</span>
              </div>
            </div>
          )}

          {/* Export GeoJSON button */}
          {lastResultGeoJSON && status === 'complete' && (
            <Button
              onClick={handleExport}
              variant="outline"
              size="sm"
              className="w-full text-xs"
              aria-label="Download results as GeoJSON"
            >
              <Download className="h-3.5 w-3.5 mr-2" />
              Download GeoJSON
            </Button>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
