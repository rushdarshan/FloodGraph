import { useState } from 'react';
import type { Map as MLMap } from 'maplibre-gl';
import { Cpu, Play, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { AoiDraw, syntheticNodes, syntheticEdges } from '../../aoi.js';
import { getPyWorker, type ConnectivityEdge } from '../../py/client.js';
import { setConnectivityLayer, setFloodNodesLayer, clearOverlayLayers } from '../../map.js';

interface ComputeSectionProps {
  map: MLMap | null;
  aoi: AoiDraw | null;
  pyodideReady: boolean;
  aoiComplete: boolean;
  onResult: (data: { nodesCount: number; edgesCount: number; componentsCount: number }) => void;
}

export function ComputeSection({
  map,
  aoi,
  pyodideReady,
  aoiComplete,
  onResult,
}: ComputeSectionProps) {
  const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const canRun = pyodideReady && aoiComplete && map !== null && aoi !== null;

  const handleConnectivity = async () => {
    if (!canRun) return;
    const polygon = aoi!.getPolygon();
    if (!polygon) return;

    setStatus('running');
    setStatusMsg('Running connectivity analysis…');
    clearOverlayLayers(map!);

    try {
      const { positions } = syntheticNodes(polygon);
      const edgePairs = syntheticEdges();
      const edges: ConnectivityEdge[] = edgePairs.map(([s, t]) => ({ source: s, target: t }));
      // Simulate a "broken" network by removing ~20% of edges
      const brokenEdges = edges.filter((_, i) => i % 5 !== 0);

      const worker = getPyWorker();
      const result = await worker.connectivity(brokenEdges);

      setConnectivityLayer(map!, positions, result.components);

      setStatusMsg(`${result.num_components} component(s) found`);
      setStatus('complete');
      onResult({
        nodesCount: Object.keys(positions).length,
        edgesCount: brokenEdges.length,
        componentsCount: result.num_components,
      });
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const handleFloodBFS = async () => {
    if (!canRun) return;
    const polygon = aoi!.getPolygon();
    if (!polygon) return;

    setStatus('running');
    setStatusMsg('Running flood simulation…');
    clearOverlayLayers(map!);

    try {
      const { nodes, positions } = syntheticNodes(polygon);
      const edgePairs = syntheticEdges();
      const edges: ConnectivityEdge[] = edgePairs.map(([s, t]) => ({ source: s, target: t }));
      const sourceNodes = nodes.slice(0, 3);

      const worker = getPyWorker();
      const result = await worker.toyFlood(edges, sourceNodes, 4);

      const floodCoords = result.flooded_nodes
        .map((id) => positions[id])
        .filter(Boolean) as [number, number][];

      setFloodNodesLayer(map!, floodCoords);

      setStatusMsg(`${result.flooded_nodes.length} nodes flooded in ${result.steps_taken} step(s)`);
      setStatus('complete');
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
            Run graph algorithms in-browser
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!canRun && (
            <div className="bg-muted rounded-md p-3 text-sm flex items-start gap-2 text-muted-foreground">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="text-xs">
                {!pyodideReady && <p>Waiting for Pyodide to load...</p>}
                {pyodideReady && !aoiComplete && <p>Draw an AOI polygon first</p>}
              </div>
            </div>
          )}

          {status === 'running' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-muted-foreground text-xs">{statusMsg}</span>
              </div>
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
            </div>
          )}

          {status === 'complete' && (
            <p className="text-xs text-green-400 text-center">
              {statusMsg}
            </p>
          )}

          {status === 'error' && (
            <div className="bg-destructive/10 text-destructive rounded-md p-3 text-xs">
              {statusMsg}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
