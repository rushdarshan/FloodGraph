// scripts/rewrite-compute.cjs — writes redesigned ComputeSection + updated MapView/Sidebar/MobileDrawer/App
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
const w = (rel, content) => { fs.writeFileSync(path.join(BASE, rel), content, 'utf8'); console.log('OK:', rel); };

// ── ComputeSection.tsx ────────────────────────────────────────────────────────
w('src/components/sidebar/ComputeSection.tsx', `import { useState, useRef, useEffect } from 'react';
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
    setStatusMsg('Simulating flood spread from the selected point\u2026');
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
          ? \`Flood would reach \${result.flooded_nodes.length.toLocaleString()} waterway sections in \${result.steps_taken} step(s)\`
          : 'No waterways reachable from selected point \u2014 try tapping a different location on the map'
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
    setStatusMsg('Computing flood spread animation via Pyodide\u2026');
    setWatershedStats(null); setLastResultGeoJSON(null);
    clearOverlayLayers(map!);

    try {
      const result = await getPyWorker().animatedFlood(waterwayGraph.edges, sourceNodes, 10);
      const frames  = result.frames;
      let step = 0;
      setStatus('complete');
      setStatusMsg(\`Animating step 1 of \${frames.length}\u2026\`);
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
          setStatusMsg(\`Flood reached \${lastFrame.length.toLocaleString()} sections in \${frames.length - 1} step(s)\`);
          return;
        }
        const allFlooded = frames[step];
        const prevSet    = step > 0 ? new Set(frames[step - 1]) : new Set<string>();
        const frontier   = allFlooded.filter((id) => !prevSet.has(id));
        setAnimatedFloodLayer(map!, waterwayGraph.nodeMap, allFlooded, frontier);
        setStatusMsg(\`Step \${step + 1} of \${frames.length} \u2014 \${allFlooded.length.toLocaleString()} sections flooded\`);
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
    setStatusMsg('Calculating flood risk for every waterway section\u2026');
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
        \`\${highRisk.toLocaleString()} high-risk sections out of \${nodeIds.length.toLocaleString()} total \u2014 red waterways are most vulnerable\`
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
    setStatusMsg('Identifying vulnerable junctions and critical channels\u2026');
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
          ? 'No critical infrastructure found \u2014 the waterway network is well connected'
          : \`Found \${result.ap_count.toLocaleString()} vulnerable junction\${result.ap_count !== 1 ? 's' : ''} and \${result.bridge_count.toLocaleString()} critical channel\${result.bridge_count !== 1 ? 's' : ''} \u2014 highlighted orange on the map\`
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
    setStatusMsg('Mapping connected waterway networks\u2026');
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
        \`Found \${result.num_components} connected waterway network\${result.num_components !== 1 ? 's' : ''} \u2014 largest has \${topSize.toLocaleString()} sections\`
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
    setStatusMsg('Analysing watershed structure\u2026');
    setWatershedStats(null);

    try {
      const result = await getPyWorker().watershedStats(waterwayGraph.edges);
      setWatershedStats(result);
      setStatusMsg(\`Watershed has \${result.outlet_count} outlet\${result.outlet_count !== 1 ? 's' : ''} and \${result.headwater_count} headwater source\${result.headwater_count !== 1 ? 's' : ''}\`);
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
    a.href = url; a.download = \`neernet-results-\${Date.now()}.geojson\`; a.click();
    URL.revokeObjectURL(url);
    toast.success('GeoJSON exported \u2014 open in QGIS or ArcGIS');
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
          <Play className={\`h-4 w-4 mr-2 flex-shrink-0 \${color ?? 'text-muted-foreground'}\`} />
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
                  : 'Analysis engine is still loading \u2014 please wait a moment'}
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
                <MapPin className={\`h-3 w-3 mt-0.5 flex-shrink-0 \${selectedFloodSource ? 'text-orange-400' : ''}\`} />
                {selectedFloodSource
                  ? <span className="text-orange-400">Flood source set \u2014 tap map to change</span>
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
              desc="Colour waterways by flood vulnerability \u2014 red = high risk, green = safe"
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
              desc="Colour each distinct drainage network \u2014 waterways sharing a colour are connected"
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
`);

// ── MapView.tsx ───────────────────────────────────────────────────────────────
w('src/components/MapView.tsx', `import { useEffect, useRef, useState } from 'react';
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
            Click to add corners \u00b7 Double-click to finish
            {aoiVertices > 0 && \` (\${aoiVertices} added)\`}
          </Badge>
        </div>
      )}

      {!mapLoaded && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-20">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Loading map\u2026</p>
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
`);

// ── Sidebar.tsx ───────────────────────────────────────────────────────────────
const sidebarContent = `import type { Map as MLMap } from 'maplibre-gl';
import type { WaterwayGraphData } from './sidebar/WaterwaysSection';
import type { LegendType } from './sidebar/ComputeSection';
import { AOISection } from './sidebar/AOISection';
import { WaterwaysSection } from './sidebar/WaterwaysSection';
import { ComputeSection } from './sidebar/ComputeSection';
import { OfflinePackSection } from './sidebar/OfflinePackSection';
import { PyodideStatus } from './sidebar/PyodideStatus';
import { ResultsSection } from './sidebar/ResultsSection';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';

interface SidebarProps {
  map: MLMap | null;
  pyodideStatus: 'loading' | 'ready' | 'error';
  pyodideProgress: number;
  pyodideMessage: string;
  aoiStatus: 'idle' | 'drawing' | 'complete';
  aoiVertices: number;
  computeResult: { nodesCount: number; edgesCount: number; componentsCount: number } | null;
  waterwayGraph: WaterwayGraphData | null;
  selectedFloodSource: string | null;
  onStartDrawing: () => void;
  onClearAoi: () => void;
  onComputeResult: (data: { nodesCount: number; edgesCount: number; componentsCount: number }) => void;
  onWaterwaysResult: (waterways: number, components: number, graphData: WaterwayGraphData) => void;
  onLegendChange: (type: LegendType) => void;
}

export function Sidebar({
  map, pyodideStatus, pyodideProgress, pyodideMessage,
  aoiStatus, aoiVertices, computeResult, waterwayGraph,
  selectedFloodSource, onStartDrawing, onClearAoi,
  onComputeResult, onWaterwaysResult, onLegendChange,
}: SidebarProps) {
  return (
    <aside className="w-80 border-r border-border bg-card shadow-sm flex flex-col h-full" role="complementary" aria-label="Control panel">
      <ScrollArea className="flex-1 h-0">
        <div className="p-4 space-y-4">
          <PyodideStatus status={pyodideStatus} progress={pyodideProgress} message={pyodideMessage} />
          <Separator />
          <AOISection status={aoiStatus} vertices={aoiVertices} onStartDrawing={onStartDrawing} onClear={onClearAoi} />
          <Separator />
          <WaterwaysSection map={map} onResult={onWaterwaysResult} />
          <Separator />
          <ComputeSection
            map={map}
            pyodideReady={pyodideStatus === 'ready'}
            waterwayGraph={waterwayGraph}
            selectedFloodSource={selectedFloodSource}
            onResult={onComputeResult}
            onLegendChange={onLegendChange}
          />
          <Separator />
          {computeResult && (
            <>
              <ResultsSection nodesCount={computeResult.nodesCount} edgesCount={computeResult.edgesCount} componentsCount={computeResult.componentsCount} />
              <Separator />
            </>
          )}
          <OfflinePackSection />
        </div>
      </ScrollArea>
      <div className="p-3 border-t border-border bg-muted/30">
        <p className="text-xs text-muted-foreground text-center">\u00a9 2026 Darshan K \u00b7 MIT License</p>
        <p className="text-xs text-muted-foreground text-center mt-1">NeerNet v0.1.0</p>
      </div>
    </aside>
  );
}
`;
w('src/components/Sidebar.tsx', sidebarContent);

// ── MobileDrawer.tsx ──────────────────────────────────────────────────────────
w('src/components/MobileDrawer.tsx', `import type { Map as MLMap } from 'maplibre-gl';
import type { WaterwayGraphData } from './sidebar/WaterwaysSection';
import type { LegendType } from './sidebar/ComputeSection';
import { AOISection } from './sidebar/AOISection';
import { WaterwaysSection } from './sidebar/WaterwaysSection';
import { ComputeSection } from './sidebar/ComputeSection';
import { OfflinePackSection } from './sidebar/OfflinePackSection';
import { PyodideStatus } from './sidebar/PyodideStatus';
import { ResultsSection } from './sidebar/ResultsSection';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from './ui/drawer';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';

interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  map: MLMap | null;
  pyodideStatus: 'loading' | 'ready' | 'error';
  pyodideProgress: number;
  pyodideMessage: string;
  aoiStatus: 'idle' | 'drawing' | 'complete';
  aoiVertices: number;
  computeResult: { nodesCount: number; edgesCount: number; componentsCount: number } | null;
  waterwayGraph: WaterwayGraphData | null;
  selectedFloodSource: string | null;
  onStartDrawing: () => void;
  onClearAoi: () => void;
  onComputeResult: (data: { nodesCount: number; edgesCount: number; componentsCount: number }) => void;
  onWaterwaysResult: (waterways: number, components: number, graphData: WaterwayGraphData) => void;
  onLegendChange: (type: LegendType) => void;
}

export function MobileDrawer({
  open, onOpenChange, map, pyodideStatus, pyodideProgress, pyodideMessage,
  aoiStatus, aoiVertices, computeResult, waterwayGraph, selectedFloodSource,
  onStartDrawing, onClearAoi, onComputeResult, onWaterwaysResult, onLegendChange,
}: MobileDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle>NeerNet Controls</DrawerTitle>
        </DrawerHeader>
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-4 pb-8">
            <PyodideStatus status={pyodideStatus} progress={pyodideProgress} message={pyodideMessage} />
            <Separator />
            <AOISection status={aoiStatus} vertices={aoiVertices} onStartDrawing={() => { onStartDrawing(); onOpenChange(false); }} onClear={onClearAoi} />
            <Separator />
            <WaterwaysSection map={map} onResult={onWaterwaysResult} />
            <Separator />
            <ComputeSection
              map={map}
              pyodideReady={pyodideStatus === 'ready'}
              waterwayGraph={waterwayGraph}
              selectedFloodSource={selectedFloodSource}
              onResult={(data) => { onComputeResult(data); onOpenChange(false); }}
              onLegendChange={onLegendChange}
            />
            <Separator />
            {computeResult && (
              <>
                <ResultsSection nodesCount={computeResult.nodesCount} edgesCount={computeResult.edgesCount} componentsCount={computeResult.componentsCount} />
                <Separator />
              </>
            )}
            <OfflinePackSection />
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
`);

// ── App.tsx ───────────────────────────────────────────────────────────────────
w('src/App.tsx', `import { useState, useRef, useEffect, useCallback } from 'react';
import type { Map as MLMap } from 'maplibre-gl';
import { MapView } from './components/MapView';
import { Sidebar } from './components/Sidebar';
import { MobileDrawer } from './components/MobileDrawer';
import { Header } from './components/Header';
import { Toaster } from './components/ui/sonner';
import { useIsMobile } from './components/ui/use-mobile';
import { AoiDraw } from './aoi.js';
import { clearOverlayLayers, setFloodSourceLayer, clearFloodSourceLayer } from './map.js';
import { getPyWorker } from './py/client.js';
import type { WaterwayGraphData } from './components/sidebar/WaterwaysSection';
import type { LegendType } from './components/sidebar/ComputeSection';

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register(\`\${import.meta.env.BASE_URL}sw.js\`, { scope: import.meta.env.BASE_URL })
    .then((reg) => console.log('[SW] registered, scope:', reg.scope))
    .catch((err) => console.warn('[SW] registration failed:', err));
}

function findNearestNode(nodeMap: Record<string, [number, number]>, lon: number, lat: number): string | null {
  let bestId: string | null = null;
  let bestDistSq = Infinity;
  for (const [id, [nLon, nLat]] of Object.entries(nodeMap)) {
    const dSq = (lon - nLon) ** 2 + (lat - nLat) ** 2;
    if (dSq < bestDistSq) { bestDistSq = dSq; bestId = id; }
  }
  return bestId;
}

export default function App() {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const [map, setMap] = useState<MLMap | null>(null);
  const aoiRef = useRef<AoiDraw | null>(null);

  const [pyodideStatus, setPyodideStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pyodideProgress, setPyodideProgress] = useState(0);
  const [pyodideMessage, setPyodideMessage] = useState('Initializing\u2026');

  const [aoiStatus, setAoiStatus] = useState<'idle' | 'drawing' | 'complete'>('idle');
  const [aoiVertices, setAoiVertices] = useState(0);

  const [computeResult, setComputeResult] = useState<{ nodesCount: number; edgesCount: number; componentsCount: number } | null>(null);
  const [waterwayGraph, setWaterwayGraph] = useState<WaterwayGraphData | null>(null);
  const [selectedFloodSource, setSelectedFloodSource] = useState<string | null>(null);
  const [activeLegend, setActiveLegend] = useState<LegendType>(null);

  const waterwayGraphRef = useRef<WaterwayGraphData | null>(null);
  const aoiStatusRef     = useRef<'idle' | 'drawing' | 'complete'>('idle');
  useEffect(() => { waterwayGraphRef.current = waterwayGraph; }, [waterwayGraph]);
  useEffect(() => { aoiStatusRef.current = aoiStatus; }, [aoiStatus]);

  useEffect(() => { registerServiceWorker(); }, []);

  useEffect(() => {
    const worker = getPyWorker();
    const handler = ({ status, message }: { status: string; message: string }) => {
      if (status === 'loading') {
        setPyodideStatus('loading'); setPyodideMessage(message);
        setPyodideProgress((prev) => Math.min(prev + 20, 90));
      } else if (status === 'ready') {
        setPyodideStatus('ready'); setPyodideProgress(100);
        setPyodideMessage('Python runtime loaded successfully');
      } else if (status === 'error') {
        setPyodideStatus('error');
        setPyodideMessage(message || 'Failed to load Python runtime');
      }
    };
    worker.onStatus(handler);
    const timeout = setTimeout(() => {
      setPyodideStatus((prev) => {
        if (prev !== 'ready') { setPyodideMessage('Analysis engine timed out \u2014 please refresh the page'); return 'error'; }
        return prev;
      });
    }, 120_000);
    return () => { worker.offStatus(handler); clearTimeout(timeout); };
  }, []);

  const handleMapReady = useCallback((m: MLMap) => {
    setMap(m);
    const aoiDraw = new AoiDraw(m);
    aoiRef.current = aoiDraw;
    aoiDraw.on('change', (polygon) => { if (polygon) setAoiStatus('complete'); });
    aoiDraw.on('stop', () => { setAoiStatus((prev) => (prev === 'drawing' ? 'complete' : prev)); });

    m.on('click', (e) => {
      if (aoiStatusRef.current === 'drawing') return;
      const graph = waterwayGraphRef.current;
      if (!graph || Object.keys(graph.nodeMap).length === 0) return;
      const nearestId = findNearestNode(graph.nodeMap, e.lngLat.lng, e.lngLat.lat);
      if (nearestId) { setSelectedFloodSource(nearestId); setFloodSourceLayer(m, graph.nodeMap[nearestId]!); }
    });
  }, []);

  const handleStartDrawing = useCallback(() => {
    if (aoiRef.current) {
      aoiRef.current.start(); setAoiStatus('drawing'); setAoiVertices(0);
      const trackVertices = () => {
        const poly = aoiRef.current?.getPolygon();
        if (poly?.geometry.coordinates[0]) setAoiVertices(Math.max(0, poly.geometry.coordinates[0].length - 1));
      };
      aoiRef.current.on('change', trackVertices);
    }
  }, []);

  const handleClearAoi = useCallback(() => {
    if (aoiRef.current) aoiRef.current.clear();
    if (map) { clearOverlayLayers(map); clearFloodSourceLayer(map); }
    setAoiStatus('idle'); setAoiVertices(0); setComputeResult(null);
    setSelectedFloodSource(null); setActiveLegend(null);
  }, [map]);

  const sharedProps = {
    map, pyodideStatus, pyodideProgress, pyodideMessage,
    aoiStatus, aoiVertices, computeResult, waterwayGraph, selectedFloodSource,
    onStartDrawing: handleStartDrawing, onClearAoi: handleClearAoi,
    onComputeResult: setComputeResult,
    onWaterwaysResult: (_waterways: number, _components: number, graphData: WaterwayGraphData) => {
      setWaterwayGraph(graphData);
    },
    onLegendChange: setActiveLegend,
  };

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <Header
        onToggleSidebar={() => {
          if (isMobile) setIsMobileDrawerOpen((p) => !p);
          else setSidebarOpen((p) => !p);
        }}
        sidebarOpen={sidebarOpen}
      />
      <div className="flex flex-1 overflow-hidden">
        {!isMobile && sidebarOpen && <Sidebar {...sharedProps} />}
        <MapView aoiStatus={aoiStatus} aoiVertices={aoiVertices} onMapReady={handleMapReady} activeLegend={activeLegend} />
      </div>
      {isMobile && (
        <MobileDrawer open={isMobileDrawerOpen} onOpenChange={setIsMobileDrawerOpen} {...sharedProps} />
      )}
      <Toaster />
    </div>
  );
}
`);

w('src/components/sidebar/WaterwaysSection.tsx', `import { useState } from 'react';
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
    setStatusMsg('Connecting to OpenStreetMap\u2026');
    const worker = getPyWorker();
    const pyStatus = ({ status: s, message }: { status: string; message: string }) => {
      if (s === 'loading') setStatusMsg(message);
      else if (s === 'ready') setStatusMsg('Analysis engine ready \u2014 identifying connected networks\u2026');
    };
    worker.onStatus(pyStatus);
    try {
      const data = await fetchKeralaWaterways((msg: string) => {
        if (msg.includes('Fetching') || msg.includes('fetch')) setStatusMsg('Downloading waterway data from OpenStreetMap\u2026');
        else if (msg.includes('nodes') || msg.includes('way') || msg.includes('Parsing')) setStatusMsg('Processing waterway features\u2026');
        else setStatusMsg(msg);
      });
      setStatusMsg('Rendering waterways on map\u2026');
      setWaterwaysLayer(map, data.geojson);
      map.fitBounds([74.85, 8.18, 77.84, 12.84], { padding: 20, duration: 1000 });
      setStatusMsg('Building waterway connection graph\u2026');
      const edges = buildProximityEdges(data.nodes, 100);
      setStatusMsg('Identifying connected waterway networks\u2026');
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
        ' \u2014 largest has ' + topSize.toLocaleString() + ' sections'
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
`);

console.log('All files written successfully.');
