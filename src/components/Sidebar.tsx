import type { Map as MLMap } from 'maplibre-gl';
import type { WaterwayGraphData } from './sidebar/WaterwaysSection';
import type { LegendType } from './sidebar/ComputeSection';
import { AOISection } from './sidebar/AOISection';
import { BoundaryStatusSection } from './sidebar/BoundaryStatusSection';
import { WaterwaysSection } from './sidebar/WaterwaysSection';
import { WaterwaysStatusSection } from './sidebar/WaterwaysStatusSection';
import { ComputeSection } from './sidebar/ComputeSection';
import { OfflinePackSection } from './sidebar/OfflinePackSection';
import { OfflineDemoModeSection } from './sidebar/OfflineDemoModeSection';
import { PyodideStatus } from './sidebar/PyodideStatus';
import { ResultsSection } from './sidebar/ResultsSection';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { ENABLE_OFFLINE_PACK_DOWNLOADS } from '../offlinePacks.js';

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
  onOfflinePackNotice?: (message: string) => void;
}

export function Sidebar({
  map, pyodideStatus, pyodideProgress, pyodideMessage,
  aoiStatus, aoiVertices, computeResult, waterwayGraph,
  selectedFloodSource, onStartDrawing, onClearAoi,
  onComputeResult, onWaterwaysResult, onLegendChange, onOfflinePackNotice,
}: SidebarProps) {
  return (
    <aside className="w-80 border-r border-border bg-card shadow-sm flex flex-col h-full" role="complementary" aria-label="Control panel">
      <ScrollArea className="flex-1 h-0">
        <div className="p-4 space-y-4">
          {/* 1. Status Indicator (top) */}
          <PyodideStatus status={pyodideStatus} progress={pyodideProgress} message={pyodideMessage} />
          <Separator />

          {/* 2. Study Area (Optional) - Control section */}
          <AOISection status={aoiStatus} vertices={aoiVertices} onStartDrawing={onStartDrawing} onClear={onClearAoi} />
          <Separator />

          {/* 3. Boundary Drawn - Status display (shown only when boundary is complete) */}
          {aoiStatus === 'complete' && (
            <>
              <BoundaryStatusSection vertices={aoiVertices} />
              <Separator />
            </>
          )}

          {/* 4. Waterway Map - Control section */}
          <WaterwaysSection map={map} onResult={onWaterwaysResult} />
          <Separator />

          {/* 5. Waterways Loaded - Status display (shown only when waterways are loaded) */}
          {waterwayGraph && (
            <>
              <WaterwaysStatusSection
                waterwaysCount={waterwayGraph.nodeMap ? Object.keys(waterwayGraph.nodeMap).length : 0}
                componentsCount={waterwayGraph.components ? waterwayGraph.components.length : 0}
              />
              <Separator />
            </>
          )}

          {/* 6. Flood Analysis - Control section */}
          <ComputeSection
            map={map}
            pyodideReady={pyodideStatus === 'ready'}
            waterwayGraph={waterwayGraph}
            selectedFloodSource={selectedFloodSource}
            onResult={onComputeResult}
            onLegendChange={onLegendChange}
          />
          <Separator />

          {/* 7. Analysis Summary - Results display (shown only after compute runs) */}
          {computeResult && (
            <>
              <ResultsSection
                nodesCount={computeResult.nodesCount}
                edgesCount={computeResult.edgesCount}
                componentsCount={computeResult.componentsCount}
              />
              <Separator />
            </>
          )}

          {ENABLE_OFFLINE_PACK_DOWNLOADS
            ? <OfflinePackSection map={map} onNotice={onOfflinePackNotice} />
            : <OfflineDemoModeSection />}
        </div>
      </ScrollArea>
      <div className="p-3 border-t border-border bg-muted/30">
        <p className="text-xs text-muted-foreground text-center">© 2026 Darshan K · MIT License</p>
        <p className="text-xs text-muted-foreground text-center mt-1">NeerNet v0.1.0</p>
      </div>
    </aside>
  );
}
