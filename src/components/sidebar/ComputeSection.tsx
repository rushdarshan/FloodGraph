import { useState, useRef, useEffect, useMemo } from 'react';
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
  const numberFormatter = useMemo(() => new Intl.NumberFormat(), []);

  const animIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => { if (animIntervalRef.current !== null) window.clearInterval(animIntervalRef.current); };
  }, []);

  const hasWaterways = waterwayGraph !== null;
  const canRun       = pyodideReady && map !== null && hasWaterways;
  const isRunning    = status === 'running';

  function formatCount(value: number): string {
    return numberFormatter.format(value);
  }

  const formattedWatershedStats = useMemo(() => {
    if (!watershedStats) return [] as [string, string][];

    return [
      ['Waterway sections', formatCount(watershedStats.node_count)],
      ['Connections', formatCount(watershedStats.edge_count)],
      ['Separate networks', formatCount(watershedStats.component_count)],
      ['Largest network', formatCount(watershedStats.largest_component)],
      ['River outlets', formatCount(watershedStats.outlet_count)],
      ['Headwater sources', formatCount(watershedStats.headwater_count)],
      ['Confluences', formatCount(watershedStats.confluence_count)],
      ['Avg connections/node', String(watershedStats.avg_degree)],
      ['Network density', String(watershedStats.density)],
    ];
  }, [watershedStats, numberFormatter]);

  function getUserFacingError(err: unknown): string {
    if (err instanceof Error && err.message.trim()) {
      const rawMessage = err.message.trim();
      const lowerMessage = rawMessage.toLowerCase();

      if (lowerMessage.includes('network') || lowerMessage.includes('fetch')) {
        return 'Could not reach the analysis engine. Check your connection and try again.';
      }

      if (lowerMessage.includes('timeout')) {
        return 'The analysis took too long to complete. Try again, or run a smaller area first.';
      }

      return `Analysis failed: ${rawMessage}`;
    }
    return 'Analysis failed. Try again. If it keeps failing, reload waterway data first.';
  }

  function resolveSourceNodes(fallbackCount: number): string[] {
    if (!waterwayGraph) return [];
    const allNodeIds = Object.keys(waterwayGraph.nodeMap);
    if (allNodeIds.length === 0) return [];

    if (selectedFloodSource && waterwayGraph.nodeMap[selectedFloodSource]) {
      return [selectedFloodSource];
    }
    return allNodeIds.slice(0, fallbackCount);
  }

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
    const sourceNodes = resolveSourceNodes(3);
    if (sourceNodes.length === 0) {
      setStatus('error');
      setStatusMsg('No waterways are available to simulate. Reload waterway data and try again.');
      return;
    }

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
          ? `Flood would reach ${formatCount(result.flooded_nodes.length)} waterway sections in ${formatCount(result.steps_taken)} step(s)`
          : 'No waterways are reachable from this source point. Tap another map location and retry.'
      );
      setStatus('complete');
    } catch (err) {
      setStatusMsg(getUserFacingError(err));
      setStatus('error');
    }
  };

  const handleAnimatedFlood = async () => {
    if (!canRun) return;
    stopAnimation();
    const sourceNodes = resolveSourceNodes(3);
    if (sourceNodes.length === 0) {
      setStatus('error');
      setStatusMsg('No waterways are available to animate. Reload waterway data and try again.');
      return;
    }

    setStatus('running');
    setStatusMsg('Preparing flood spread animation…');
    setWatershedStats(null); setLastResultGeoJSON(null);
    clearOverlayLayers(map!);

    try {
      const result = await getPyWorker().animatedFlood(waterwayGraph.edges, sourceNodes, 10);
      const frames  = result.frames;
      let step = 0;
      setStatus('complete');
      setStatusMsg(`Running animation step 1 of ${frames.length}…`);
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
          setStatusMsg(`Flood reached ${formatCount(lastFrame.length)} sections in ${formatCount(frames.length - 1)} step(s)`);
          return;
        }
        const allFlooded = frames[step];
        const prevSet    = step > 0 ? new Set(frames[step - 1]) : new Set<string>();
        const frontier   = allFlooded.filter((id) => !prevSet.has(id));
        setAnimatedFloodLayer(map!, waterwayGraph.nodeMap, allFlooded, frontier);
        setStatusMsg(`Step ${formatCount(step + 1)} of ${formatCount(frames.length)} — ${formatCount(allFlooded.length)} sections flooded`);
        step++;
      }, 600);
    } catch (err) {
      setStatusMsg(getUserFacingError(err));
      setStatus('error');
    }
  };

  // ─── Risk & Safety ──────────────────────────────────────────────────────────

  const handleRiskScore = async () => {
    if (!canRun) return;
    stopAnimation();
    const nodeIds = Object.keys(waterwayGraph.nodeMap);
    const sourceNodes = resolveSourceNodes(5);
    if (nodeIds.length === 0 || sourceNodes.length === 0) {
      setStatus('error');
      setStatusMsg('No waterways are available to score. Reload waterway data and try again.');
      return;
    }

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
        `${formatCount(highRisk)} high-risk sections out of ${formatCount(nodeIds.length)} total — sections marked critical are most vulnerable`
      );
      setStatus('complete');
      onResult({ nodesCount: nodeIds.length, edgesCount: waterwayGraph.edges.length, componentsCount: 0 });
    } catch (err) {
      setStatusMsg(getUserFacingError(err));
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
          : `Found ${formatCount(result.ap_count)} vulnerable junction${result.ap_count !== 1 ? 's' : ''} and ${formatCount(result.bridge_count)} critical channel${result.bridge_count !== 1 ? 's' : ''} — highlighted on the map as critical`
      );
      setStatus('complete');
      onResult({ nodesCount: Object.keys(waterwayGraph.nodeMap).length, edgesCount: waterwayGraph.edges.length, componentsCount: result.ap_count });
    } catch (err) {
      setStatusMsg(getUserFacingError(err));
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
        `Found ${formatCount(result.num_components)} connected waterway network${result.num_components !== 1 ? 's' : ''} — largest has ${formatCount(topSize)} sections`
      );
      setStatus('complete');
      onResult({ nodesCount: nodeCount, edgesCount: waterwayGraph.edges.length, componentsCount: result.num_components });
    } catch (err) {
      setStatusMsg(getUserFacingError(err));
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
      setStatusMsg(`Watershed has ${formatCount(result.outlet_count)} outlet${result.outlet_count !== 1 ? 's' : ''} and ${formatCount(result.headwater_count)} headwater source${result.headwater_count !== 1 ? 's' : ''}`);
      setStatus('complete');
    } catch (err) {
      setStatusMsg(getUserFacingError(err));
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
      <div className="min-w-0">
        <Button
          onClick={onClick}
          variant="outline"
          className="w-full min-w-0 justify-start"
          disabled={!canRun || isRunning}
          aria-label={label}
          title={label}
        >
          <Play className={`h-4 w-4 mr-2 flex-shrink-0 ${color ?? 'text-muted-foreground'}`} />
          <span className="font-medium truncate">{label}</span>
        </Button>
        <p className="text-xs text-muted-foreground mt-0.5 pl-[38px] leading-relaxed break-words">{desc}</p>
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
              <p className="text-xs break-words">
                {!hasWaterways
                  ? 'Load waterway data first using the button above'
                  : 'Analysis engine is still loading — please wait a moment'}
              </p>
            </div>
          )}

          {isRunning && (
            <div className="flex items-start gap-2 min-w-0" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground text-xs break-words">{statusMsg}</span>
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
              color="text-info"
            />
            <ActionBtn
              onClick={handleAnimatedFlood}
              label="Animate Flood Spread"
              desc="Watch the flood advance step by step with live animation"
              color="text-info"
            />
            {hasWaterways && (
              <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground pl-1 min-w-0">
                <MapPin className={`h-3 w-3 mt-0.5 flex-shrink-0 ${selectedFloodSource ? 'text-risk-high' : ''}`} />
                {selectedFloodSource
                  ? <span className="text-risk-high break-words">Flood source set. Tap the map to change it.</span>
                  : <span className="break-words">Tap the map to choose a flood source.</span>
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
              desc="Label waterways by flood vulnerability from low to critical risk"
              color="text-risk-critical"
            />
            <ActionBtn
              onClick={handleCriticalPath}
              label="Find Vulnerable Infrastructure"
              desc="Highlight junctions and channels that could disrupt water flow if blocked"
              color="text-risk-high"
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
              desc="Color each distinct drainage network. Matching colors mean connected waterways."
              color="text-connectivity-3"
            />
            <ActionBtn
              onClick={handleWatershedStats}
              label="Watershed Summary"
              desc="Show watershed structure, including outlets, headwaters, and confluences"
              color="text-connectivity-3"
            />
          </div>

          {/* ── Status / Results ─────────────────────────────────────────── */}
          {status === 'complete' && !isRunning && (
            <p className="text-xs text-success break-words" aria-live="polite">{statusMsg}</p>
          )}
          {status === 'error' && (
            <div className="bg-destructive/10 text-destructive rounded-md p-3 text-xs break-words" role="alert">{statusMsg}</div>
          )}

          {/* Watershed stats table */}
          {watershedStats && status === 'complete' && (
            <div className="rounded-md border border-border p-3 space-y-1.5 text-xs">
              <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Watershed Summary</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {formattedWatershedStats.map(([label, val]) => (
                  <div key={label} className="contents">
                    <span key={label + '-l'} className="text-muted-foreground break-words">{label}</span>
                    <span key={label + '-v'} className="text-right font-mono break-all">{val}</span>
                  </div>
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
