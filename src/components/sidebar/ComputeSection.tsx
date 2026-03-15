import { useState, useRef, useEffect } from 'react';
import type { Map as MLMap } from 'maplibre-gl';
import { Activity, Play, Loader2, AlertCircle, Download, MapPin } from 'lucide-react';
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

export type LegendType = 'connectivity' | 'risk' | 'critical' | 'flood' | 'animated' | null;

interface ComputeSectionProps {
  map: MLMap | null;
  pyodideReady: boolean;
  waterwayGraph: WaterwayGraphData | null;
  selectedFloodSource: string | null;
  onResult: (data: { nodesCount: number; edgesCount: number; componentsCount: number }) => void;
  onLegendChange: (type: LegendType) => void;
}

export function ComputeSection({
  map,
  pyodideReady,
  waterwayGraph,
  selectedFloodSource,
  onResult,
  onLegendChange,
}: ComputeSectionProps) {
  const [status, setStatus]     = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [watershedStats, setWatershedStats] = useState<WatershedStatsResult | null>(null);
  const [lastResultGeoJSON, setLastResultGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);

  const animIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => { if (animIntervalRef.current !== null) window.clearInterval(animIntervalRef.current); };
  }, []);

  const hasWaterways = waterwayGraph !== null;
  const canRun       = pyodideReady && map !== null && hasWaterways;
  const isRunning    = status === 'running';

  function stopAnimation() {
    if (animIntervalRef.current !== null) {
      window.clearInterval(animIntervalRef.current);
      animIntervalRef.current = null;
    }
  }

  // ─── Flood Simulation ───────────────────────────────────────────────────────

  const handleFloodBFS = async () => {
    if (!canRun) return;
    stopAnimation();
    const sourceNodes = selectedFloodSource
      ? [selectedFloodSource]
      : Object.keys(waterwayGraph.nodeMap).slice(0, 3);

    setStatus('running');
    setStatusMsg('Simulating flood spread from the selected point…');
    setWatershedStats(null); setLastResultGeoJSON(null);
    clearOverlayLayers(map!);

    try {
      const result = await getPyWorker().toyFlood(waterwayGraph.edges, sourceNodes, 4);
      const floodCoords = result.flooded_nodes
        .map((id) => waterwayGraph.nodeMap[id]).filter(Boolean) as [number,number][];

      setFloodNodesLayer(map!, floodCoords);
      const ptGeoJSON: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: floodCoords.map((coords) => ({
          type: 'Feature', geometry: { type: 'Point', coordinates: coords }, properties: { _kind: 'flooded' },
        })),
      };
      setLastResultGeoJSON(ptGeoJSON);
      onLegendChange('flood');

      setStatusMsg(
        result.flooded_nodes.length > 0
          ? `Flood would reach ${result.flooded_nodes.length.toLocaleString()} waterway sections in ${result.steps_taken} step(s)`
          : 'No waterways reachable from selected point — try tapping a different location on the map'
      );
      setStatus('complete');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const handleAnimatedFlood = async () => {
    if (!canRun) return;
    stopAnimation();
    const sourceNodes = selectedFloodSource
      ? [selectedFloodSource]
      : Object.keys(waterwayGraph.nodeMap).slice(0, 3);

    setStatus('running');
    setStatusMsg('Computing flood spread animation via Pyodide…');
    setWatershedStats(null); setLastResultGeoJSON(null);
    clearOverlayLayers(map!);

    try {
      const result = await getPyWorker().animatedFlood(waterwayGraph.edges, sourceNodes, 10);
      const frames  = result.frames;
      let step = 0;
      setStatus('complete');
      setStatusMsg(`Animating step 1 of ${frames.length}…`);
      onLegendChange('animated');

      animIntervalRef.current = window.setInterval(() => {
        if (step >= frames.length) {
          window.clearInterval(animIntervalRef.current!);
          animIntervalRef.current = null;
          const lastFrame = frames[frames.length - 1];
          const ptGeoJSON: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: lastFrame.map((id) => waterwayGraph.nodeMap[id]).filter(Boolean).map((coords) => ({
              type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: coords }, properties: {},
            })),
          };
          setLastResultGeoJSON(ptGeoJSON);
          setStatusMsg(`Flood reached ${lastFrame.length.toLocaleString()} sections in ${frames.length - 1} step(s)`);
          return;
        }
        const allFlooded = frames[step];
        const prevSet    = step > 0 ? new Set(frames[step - 1]) : new Set<string>();
        const frontier   = allFlooded.filter((id) => !prevSet.has(id));
        setAnimatedFloodLayer(map!, waterwayGraph.nodeMap, allFlooded, frontier);
        setStatusMsg(`Step ${step + 1} of ${frames.length} — ${allFlooded.length.toLocaleString()} sections flooded`);
        step++;
      }, 600);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  // ─── Risk & Safety ──────────────────────────────────────────────────────────

  const handleRiskScore = async () => {
    if (!canRun) return;
    stopAnimation();
    const nodeIds = Object.keys(waterwayGraph.nodeMap);
    const sourceNodes = selectedFloodSource ? [selectedFloodSource] : nodeIds.slice(0, 5);

    setStatus('running');
    setStatusMsg('Calculating flood risk for every waterway section…');
    setWatershedStats(null); setLastResultGeoJSON(null);
    clearOverlayLayers(map!);

    try {
      const result  = await getPyWorker().riskScore(waterwayGraph.edges, sourceNodes);
      const colored = riskScoreGeoJSON(waterwayGraph.geojson, result.scores, result.max_score);
      setWaterwaysLayer(map!, colored);
      setLastResultGeoJSON(colored);
      onLegendChange('risk');

      const highRisk = Object.values(result.scores).filter((s) => s > result.max_score * 0.75).length;
      setStatusMsg(
        `${highRisk.toLocaleString()} high-risk sections out of ${nodeIds.length.toLocaleString()} total — red waterways are most vulnerable`
      );
      setStatus('complete');
      onResult({ nodesCount: nodeIds.length, edgesCount: waterwayGraph.edges.length, componentsCount: 0 });
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const handleCriticalPath = async () => {
    if (!canRun) return;
    stopAnimation();
    setStatus('running');
    setStatusMsg('Identifying vulnerable junctions and critical channels…');
    setWatershedStats(null); setLastResultGeoJSON(null);
    clearOverlayLayers(map!);

    try {
      const result = await getPyWorker().criticalPath(waterwayGraph.edges);
      setCriticalPathLayer(map!, waterwayGraph.nodeMap, result.articulation_points, result.bridges);
      onLegendChange('critical');

      const features: GeoJSON.Feature[] = [
        ...result.articulation_points.map((id) => waterwayGraph.nodeMap[id]).filter(Boolean).map((coords) => ({
          type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: coords }, properties: { _kind: 'ap' },
        })),
        ...result.bridges.flatMap(([a, b]) => {
          const posA = waterwayGraph.nodeMap[a]; const posB = waterwayGraph.nodeMap[b];
          if (!posA || !posB) return [] as GeoJSON.Feature[];
          return [{ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: [posA, posB] }, properties: { _kind: 'bridge' } }] as GeoJSON.Feature[];
        }),
      ];
      setLastResultGeoJSON({ type: 'FeatureCollection', features });

      setStatusMsg(
        result.ap_count === 0 && result.bridge_count === 0
          ? 'No critical infrastructure found — the waterway network is well connected'
          : `Found ${result.ap_count.toLocaleString()} vulnerable junction${result.ap_count !== 1 ? 's' : ''} and ${result.bridge_count.toLocaleString()} critical channel${result.bridge_count !== 1 ? 's' : ''} — highlighted orange on the map`
      );
      setStatus('complete');
      onResult({ nodesCount: Object.keys(waterwayGraph.nodeMap).length, edgesCount: waterwayGraph.edges.length, componentsCount: result.ap_count });
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  // ─── Network Overview ───────────────────────────────────────────────────────

  const handleConnectivity = async () => {
    if (!canRun) return;
    stopAnimation();
    setStatus('running');
    setStatusMsg('Mapping connected waterway networks…');
    setWatershedStats(null); setLastResultGeoJSON(null);
    clearOverlayLayers(map!);

    try {
      const result    = await getPyWorker().connectivity(waterwayGraph.edges);
      const recolored = colorComponentsGeoJSON(waterwayGraph.geojson, result.components);
      setWaterwaysLayer(map!, recolored);
      setLastResultGeoJSON(recolored);
      onLegendChange('connectivity');

      const nodeCount = Object.keys(waterwayGraph.nodeMap).length;
      const topSize   = result.component_sizes[0] ?? 0;
      setStatusMsg(
        `Found ${result.num_components} connected waterway network${result.num_components !== 1 ? 's' : ''} — largest has ${topSize.toLocaleString()} sections`
      );
      setStatus('complete');
      onResult({ nodesCount: nodeCount, edgesCount: waterwayGraph.edges.length, componentsCount: result.num_components });
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const handleWatershedStats = async () => {
    if (!canRun) return;
    stopAnimation();
    setStatus('running');
    setStatusMsg('Analysing watershed structure…');
    setWatershedStats(null);

    try {
      const result = await getPyWorker().watershedStats(waterwayGraph.edges);
      setWatershedStats(result);
      setStatusMsg(`Watershed has ${result.outlet_count} outlet${result.outlet_count !== 1 ? 's' : ''} and ${result.headwater_count} headwater source${result.headwater_count !== 1 ? 's' : ''}`);
      setStatus('complete');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  // ─── Export ─────────────────────────────────────────────────────────────────

  const handleExport = () => {
    if (!lastResultGeoJSON) return;
    const blob = new Blob([JSON.stringify(lastResultGeoJSON, null, 2)], { type: 'application/geo+json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `neernet-results-${Date.now()}.geojson`; a.click();
    URL.revokeObjectURL(url);
    toast.success('GeoJSON exported — open in QGIS or ArcGIS');
  };

  // ─── Button group helper ─────────────────────────────────────────────────────

  function ActionBtn({ onClick, label, desc, color }: { onClick: () => void; label: string; desc: string; color?: string }) {
    return (
      <div>
        <Button
          onClick={onClick}
          variant="outline"
          className="w-full justify-start"
          disabled={!canRun || isRunning}
          aria-label={label}
        >
          <Play className={`h-4 w-4 mr-2 flex-shrink-0 ${color ?? 'text-muted-foreground'}`} />
          <span className="font-medium">{label}</span>
        </Button>
        <p className="text-[10px] text-muted-foreground mt-0.5 pl-[38px] leading-relaxed">{desc}</p>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <section aria-labelledby="compute-title">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle id="compute-title" className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Flood Analysis
          </CardTitle>
          <CardDescription className="text-xs">
            {hasWaterways
              ? 'Run analysis on the loaded waterway data'
              : 'Load waterways above to enable analysis'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {!canRun && (
            <div className="bg-muted rounded-md p-3 flex items-start gap-2 text-muted-foreground">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p className="text-xs">
                {!hasWaterways
                  ? 'Load waterway data first using the button above'
                  : 'Analysis engine is still loading — please wait a moment'}
              </p>
            </div>
          )}

          {isRunning && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground text-xs">{statusMsg}</span>
            </div>
          )}

          {/* ── Group 1: Flood Simulation ─────────────────────────────────── */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Flood Simulation
            </p>
            <ActionBtn
              onClick={handleFloodBFS}
              label="Simulate Flood Spread"
              desc="See which waterway sections would flood from your selected starting point"
              color="text-blue-400"
            />
            <ActionBtn
              onClick={handleAnimatedFlood}
              label="Animate Flood Spread"
              desc="Watch the flood advance step by step with live animation"
              color="text-blue-400"
            />
            {hasWaterways && (
              <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground pl-1">
                <MapPin className={`h-3 w-3 mt-0.5 flex-shrink-0 ${selectedFloodSource ? 'text-orange-400' : ''}`} />
                {selectedFloodSource
                  ? <span className="text-orange-400">Flood source set — tap map to change</span>
                  : <span>Tap any point on the map to set the flood starting location</span>
                }
              </div>
            )}
          </div>

          {/* ── Group 2: Risk & Safety ────────────────────────────────────── */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Risk &amp; Safety
            </p>
            <ActionBtn
              onClick={handleRiskScore}
              label="Map Flood Risk"
              desc="Colour waterways by flood vulnerability — red = high risk, green = safe"
              color="text-red-400"
            />
            <ActionBtn
              onClick={handleCriticalPath}
              label="Find Vulnerable Infrastructure"
              desc="Highlight junctions and channels whose blockage would disconnect water flow"
              color="text-orange-400"
            />
          </div>

          {/* ── Group 3: Network Overview ─────────────────────────────────── */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Network Overview
            </p>
            <ActionBtn
              onClick={handleConnectivity}
              label="Show Connected Networks"
              desc="Colour each distinct drainage network — waterways sharing a colour are connected"
              color="text-green-400"
            />
            <ActionBtn
              onClick={handleWatershedStats}
              label="Watershed Summary"
              desc="Statistics about outlets, stream confluences, and drainage structure"
              color="text-green-400"
            />
          </div>

          {/* ── Status / Results ─────────────────────────────────────────── */}
          {status === 'complete' && !isRunning && (
            <p className="text-xs text-green-400">{statusMsg}</p>
          )}
          {status === 'error' && (
            <div className="bg-destructive/10 text-destructive rounded-md p-3 text-xs">{statusMsg}</div>
          )}

          {/* Watershed stats table */}
          {watershedStats && status === 'complete' && (
            <div className="rounded-md border border-border p-3 space-y-1.5 text-xs">
              <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Watershed Statistics</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {([
                  ['Waterway sections', watershedStats.node_count.toLocaleString()],
                  ['Connections', watershedStats.edge_count.toLocaleString()],
                  ['Separate networks', String(watershedStats.component_count)],
                  ['Largest network', watershedStats.largest_component.toLocaleString()],
                  ['River outlets', watershedStats.outlet_count.toLocaleString()],
                  ['Headwater sources', watershedStats.headwater_count.toLocaleString()],
                  ['Confluences', watershedStats.confluence_count.toLocaleString()],
                  ['Avg connections/node', String(watershedStats.avg_degree)],
                  ['Network density', String(watershedStats.density)],
                ] as [string, string][]).map(([label, val]) => (
                  <>
                    <span key={label + '-l'} className="text-muted-foreground">{label}</span>
                    <span key={label + '-v'} className="text-right font-mono">{val}</span>
                  </>
                ))}
              </div>
            </div>
          )}

          {/* Export button */}
          {lastResultGeoJSON && status === 'complete' && (
            <Button onClick={handleExport} variant="outline" size="sm" className="w-full text-xs" aria-label="Download results as GeoJSON file">
              <Download className="h-3.5 w-3.5 mr-2" />
              Download Results as GeoJSON
            </Button>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
