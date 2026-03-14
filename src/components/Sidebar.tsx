import type { Map as MLMap } from 'maplibre-gl';
import type { AoiDraw } from '../aoi.js';
import type { WaterwayGraphData } from './sidebar/WaterwaysSection';
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
  aoi: AoiDraw | null;
  pyodideStatus: 'loading' | 'ready' | 'error';
  pyodideProgress: number;
  pyodideMessage: string;
  aoiStatus: 'idle' | 'drawing' | 'complete';
  aoiVertices: number;
  computeResult: { nodesCount: number; edgesCount: number; componentsCount: number } | null;
  waterwayGraph: WaterwayGraphData | null;
  onStartDrawing: () => void;
  onClearAoi: () => void;
  onComputeResult: (data: { nodesCount: number; edgesCount: number; componentsCount: number }) => void;
  onWaterwaysResult: (waterways: number, components: number, graphData: WaterwayGraphData) => void;
}

export function Sidebar({
  map,
  aoi,
  pyodideStatus,
  pyodideProgress,
  pyodideMessage,
  aoiStatus,
  aoiVertices,
  computeResult,
  waterwayGraph,
  onStartDrawing,
  onClearAoi,
  onComputeResult,
  onWaterwaysResult,
}: SidebarProps) {
  return (
    <aside
      className="w-80 border-r border-border bg-card shadow-sm flex flex-col h-full"
      role="complementary"
      aria-label="Control panel"
    >
      <ScrollArea className="flex-1 h-0">
        <div className="p-4 space-y-4">
          <PyodideStatus
            status={pyodideStatus}
            progress={pyodideProgress}
            message={pyodideMessage}
          />

          <Separator />

          <AOISection
            status={aoiStatus}
            vertices={aoiVertices}
            onStartDrawing={onStartDrawing}
            onClear={onClearAoi}
          />

          <Separator />

          <WaterwaysSection
            map={map}
            onResult={onWaterwaysResult}
          />

          <Separator />

          <ComputeSection
            map={map}
            aoi={aoi}
            pyodideReady={pyodideStatus === 'ready'}
            aoiComplete={aoiStatus === 'complete'}
            waterwayGraph={waterwayGraph}
            onResult={onComputeResult}
          />

          <Separator />

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

          <OfflinePackSection />
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border bg-muted/30">
        <p className="text-xs text-muted-foreground text-center">
          © 2026 Darshan K · MIT License
        </p>
        <p className="text-xs text-muted-foreground text-center mt-1">
          FloodGraph v0.1.0
        </p>
      </div>
    </aside>
  );
}
