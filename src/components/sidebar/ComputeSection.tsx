import { useState } from 'react';
import type { Map as MLMap } from 'maplibre-gl';
import { Cpu, Play, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import type { WaterwayGraphData } from './WaterwaysSection';
import { getPyWorker } from '../../py/client.js';
import type { WatershedStatsResult } from '../../py/client.js';
import { colorComponentsGeoJSON, riskScoreGeoJSON } from '../../waterways.js';
import { setFloodNodesLayer, setWaterwaysLayer, setCriticalPathLayer, clearOverlayLayers } from '../../map.js';

interface ComputeSectionProps {
  map: MLMap | null;
  pyodideReady: boolean;
  waterwayGraph: WaterwayGraphData | null;
  onResult: (data: { nodesCount: number; edgesCount: number; componentsCount: number }) => void;
}

export function ComputeSection({
  map,
  pyodideReady,
  waterwayGraph,
  onResult,
}: ComputeSectionProps) {
  const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [watershedStats, setWatershedStats] = useState<WatershedStatsResult | null>(null);

  const hasWaterways = waterwayGraph !== null;
  const canRun = pyodideReady && map !== null && hasWaterways;

  const handleConnectivity = async () => {
    if (!canRun) return;

    setStatus('running');
    setStatusMsg('Running nx.connected_components via Pyodide…');
    setWatershedStats(null);
    clearOverlayLayers(map!);

    try {
      const worker = getPyWorker();
      const result = await worker.connectivity(waterwayGraph.edges);

      const recolored = colorComponentsGeoJSON(waterwayGraph.geojson, result.components);
      setWaterwaysLayer(map!, recolored);

      const nodeCount = Object.keys(waterwayGraph.nodeMap).length;
      setStatusMsg(`${result.num_components} component(s) · ${nodeCount.toLocaleString()} nodes`);
      setStatus('complete');
      onResult({
        nodesCount: nodeCount,
        edgesCount: waterwayGraph.edges.length,
        componentsCount: result.num_components,
      });
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const handleFloodBFS = async () => {
    if (!canRun) return;

    const nodeIds = Object.keys(waterwayGraph.nodeMap);
    setStatus('running');
    setStatusMsg(`Running nx BFS toy_flood on ${nodeIds.length.toLocaleString()} nodes…`);
    setWatershedStats(null);
    clearOverlayLayers(map!);

    try {
      const sourceNodes = nodeIds.slice(0, 3);
      const worker = getPyWorker();
      const result = await worker.toyFlood(waterwayGraph.edges, sourceNodes, 4);

      const floodCoords = result.flooded_nodes
        .map((id) => waterwayGraph.nodeMap[id])
        .filter(Boolean) as [number, number][];

      setFloodNodesLayer(map!, floodCoords);

      setStatusMsg(`${result.flooded_nodes.length} nodes flooded in ${result.steps_taken} step(s)`);
      setStatus('complete');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const handleRiskScore = async () => {
    if (!canRun) return;

    const nodeIds = Object.keys(waterwayGraph.nodeMap);
    setStatus('running');
    setStatusMsg('Running nx.betweenness_centrality + flood proximity via Pyodide…');
    setWatershedStats(null);
    clearOverlayLayers(map!);

    try {
      const sourceNodes = nodeIds.slice(0, 5);
      const worker = getPyWorker();
      const result = await worker.riskScore(waterwayGraph.edges, sourceNodes);

      const colored = riskScoreGeoJSON(waterwayGraph.geojson, result.scores, result.max_score);
      setWaterwaysLayer(map!, colored);

      const highRiskCount = Object.values(result.scores).filter((s) => s > result.max_score * 0.75).length;
      setStatusMsg(
        `Risk scored ${Object.keys(result.scores).length.toLocaleString()} nodes · ${highRiskCount.toLocaleString()} high-risk`
      );
      setStatus('complete');
      onResult({
        nodesCount: nodeIds.length,
        edgesCount: waterwayGraph.edges.length,
        componentsCount: 0,
      });
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const handleWatershedStats = async () => {
    if (!canRun) return;

    setStatus('running');
    setStatusMsg('Running nx.DiGraph degree analysis via Pyodide…');
    setWatershedStats(null);

    try {
      const worker = getPyWorker();
      const result = await worker.watershedStats(waterwayGraph.edges);

      setWatershedStats(result);
      setStatusMsg(
        `${result.node_count.toLocaleString()} nodes · ${result.component_count} components · density ${result.density}`
      );
      setStatus('complete');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const handleCriticalPath = async () => {
    if (!canRun) return;

    setStatus('running');
    setStatusMsg('Running nx.articulation_points + nx.bridges via Pyodide…');
    setWatershedStats(null);
    clearOverlayLayers(map!);

    try {
      const worker = getPyWorker();
      const result = await worker.criticalPath(waterwayGraph.edges);

      setCriticalPathLayer(map!, waterwayGraph.nodeMap, result.articulation_points, result.bridges);

      setStatusMsg(
        `${result.ap_count.toLocaleString()} critical nodes · ${result.bridge_count.toLocaleString()} bridges`
      );
      setStatus('complete');
      onResult({
        nodesCount: Object.keys(waterwayGraph.nodeMap).length,
        edgesCount: waterwayGraph.edges.length,
        componentsCount: result.ap_count,
      });
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

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
            <div className="bg-muted rounded-md p-3 text-sm flex items-start gap-2 text-muted-foreground">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p className="text-xs">
                {!hasWaterways
                  ? 'Fetch Kerala waterways first'
                  : 'Waiting for Pyodide to load…'}
              </p>
            </div>
          )}

          {status === 'running' && (
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-muted-foreground text-xs">{statusMsg}</span>
            </div>
          )}

          {canRun && status !== 'running' && (
            <div className="space-y-2">
              <Button
                onClick={handleConnectivity}
                className="w-full"
                aria-label="Run connectivity analysis"
              >
                <Play className="h-4 w-4 mr-2" />
                Run Connectivity
              </Button>
              <Button
                onClick={handleFloodBFS}
                variant="outline"
                className="w-full"
                aria-label="Run flood BFS simulation"
              >
                <Play className="h-4 w-4 mr-2" />
                Run Flood BFS
              </Button>
              <Button
                onClick={handleRiskScore}
                variant="outline"
                className="w-full"
                aria-label="Run flood risk scoring"
              >
                <Play className="h-4 w-4 mr-2" />
                Run Risk Score
              </Button>
              <Button
                onClick={handleWatershedStats}
                variant="outline"
                className="w-full"
                aria-label="Compute watershed statistics"
              >
                <Play className="h-4 w-4 mr-2" />
                Watershed Stats
              </Button>
              <Button
                onClick={handleCriticalPath}
                variant="outline"
                className="w-full"
                aria-label="Find critical path nodes and bridges"
              >
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
                <span className="text-muted-foreground">Largest comp.</span>
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
        </CardContent>
      </Card>
    </section>
  );
}
